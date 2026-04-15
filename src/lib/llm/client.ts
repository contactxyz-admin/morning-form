/**
 * Anthropic LLM client wrapper.
 *
 * Surface: a single `generate<T>` method that runs a structured-output call
 * (forced tool-use) and returns a zod-validated typed object. Mirrors the
 * provider-client shape in src/lib/health/libre.ts — typed errors,
 * bounded retry with jittered backoff, per-attempt timeout, schema-validated
 * response.
 *
 * Mock mode: MOCK_LLM=true (dev/test) bypasses the SDK and returns a canned
 * response from the registry passed at construction time. Used so callers
 * never need to stub @anthropic-ai/sdk directly.
 */

import Anthropic, { APIError } from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '@/lib/env';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from './errors';

export type LLMModel = 'claude-opus-4-6' | 'claude-sonnet-4-6';

export const DEFAULT_MODEL: LLMModel = 'claude-opus-4-6';
export const LIGHTWEIGHT_MODEL: LLMModel = 'claude-sonnet-4-6';

const STRUCTURED_OUTPUT_TOOL_NAME = 'emit_structured_output';
const PER_ATTEMPT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export interface GenerateOptions<T> {
  prompt: string;
  schema: ZodType<T>;
  /** Tool description shown to the model. Plain English, one sentence. */
  schemaDescription?: string;
  model?: LLMModel;
  maxTokens?: number;
  temperature?: number;
  /** Optional system prompt — used by topic compile, intake extraction. */
  system?: string;
}

/**
 * Mock registry: keyed by a substring match against the prompt. When
 * MOCK_LLM=true and a key is found in the prompt, the corresponding handler
 * is invoked instead of calling Anthropic. The handler returns a value that
 * MUST satisfy the caller's zod schema (we still validate). Tests register
 * their own handlers via `setMockHandlers`.
 */
type MockHandler = (prompt: string, system?: string) => unknown;
let mockHandlers: Array<{ key: string; handler: MockHandler }> = [];

export function setMockHandlers(handlers: Array<{ key: string; handler: MockHandler }>): void {
  mockHandlers = handlers;
}

export function clearMockHandlers(): void {
  mockHandlers = [];
}

export interface LLMClientDeps {
  /** Custom fetch — used by tests to intercept the Anthropic API call. */
  fetch?: typeof fetch;
  /** Override apiKey at construction time (defaults to env). */
  apiKey?: string;
  /** Force mock mode regardless of env. */
  mock?: boolean;
}

export class LLMClient {
  private sdk: Anthropic | null;
  private mock: boolean;

  constructor(deps: LLMClientDeps = {}) {
    this.mock = deps.mock ?? env.MOCK_LLM === 'true';
    const apiKey = deps.apiKey ?? env.ANTHROPIC_API_KEY;

    if (this.mock && env.NODE_ENV === 'production') {
      throw new Error(
        '[LLMClient] MOCK_LLM=true is not permitted in production — refusing to construct.',
      );
    }

    if (!this.mock && !apiKey) {
      // Quiet warning at construction time — surfaces hard 401 at first call,
      // not a confusing crash on import.
      console.warn(
        '[LLMClient] ANTHROPIC_API_KEY missing and MOCK_LLM not set. ' +
          'Calls will fail with LLMAuthError.',
      );
    }
    if (this.mock) {
      console.warn('[LLMClient] MOCK_LLM=true — Anthropic API will not be called.');
    }

    this.sdk = this.mock
      ? null
      : new Anthropic({
          apiKey: apiKey || 'missing',
          // Disable SDK-level retries; we retry at this layer for parity with
          // the health/libre pattern and to surface our own typed errors.
          maxRetries: 0,
          // Match our per-attempt budget so a stuck connection actually aborts
          // the underlying fetch (default SDK timeout is 10 minutes).
          timeout: PER_ATTEMPT_TIMEOUT_MS,
          fetch: deps.fetch,
        });
  }

  async generate<T>(opts: GenerateOptions<T>): Promise<T> {
    if (this.mock) {
      const raw = this.runMock(opts.prompt, opts.system);
      return this.validate(raw, opts.schema);
    }

    const jsonSchema = zodToJsonSchema(opts.schema, {
      target: 'openApi3',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    // Anthropic tool input_schema accepts JSON Schema; remove the top-level
    // $schema wrapper that zod-to-json-schema adds.
    delete jsonSchema['$schema'];

    const tool = {
      name: STRUCTURED_OUTPUT_TOOL_NAME,
      description:
        opts.schemaDescription ??
        'Emit the structured response that satisfies the caller\'s schema.',
      input_schema: jsonSchema as Anthropic.Tool.InputSchema,
    };

    const response = await this.callWithRetry(() =>
      this.sdk!.messages.create({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0,
        system: opts.system,
        tools: [tool],
        tool_choice: { type: 'tool', name: STRUCTURED_OUTPUT_TOOL_NAME },
        messages: [{ role: 'user', content: opts.prompt }],
      }),
    );

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new LLMValidationError(response.content, 'no tool_use block in response');
    }
    return this.validate(toolUse.input, opts.schema);
  }

  private validate<T>(raw: unknown, schema: ZodType<T>): T {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new LLMValidationError(raw, result.error.message);
    }
    return result.data;
  }

  private runMock(prompt: string, system?: string): unknown {
    for (const { key, handler } of mockHandlers) {
      if (prompt.includes(key) || (system && system.includes(key))) {
        return handler(prompt, system);
      }
    }
    throw new LLMTransientError(
      0,
      `MOCK_LLM=true but no mock handler matched. Register one with setMockHandlers.`,
    );
  }

  private async callWithRetry<R>(call: () => Promise<R>): Promise<R> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.withTimeout(call(), PER_ATTEMPT_TIMEOUT_MS);
      } catch (err) {
        const mapped = mapError(err);
        if (mapped instanceof LLMAuthError) throw mapped;
        if (mapped instanceof LLMValidationError) throw mapped;
        if (attempt === MAX_ATTEMPTS) throw mapped;
        // 429: honor server-supplied retry-after when present, else fall back
        // to jittered backoff. Without this we burn the budget in <1.5s.
        if (mapped instanceof LLMRateLimitError && mapped.retryAfterSeconds !== undefined) {
          await sleep(Math.min(mapped.retryAfterSeconds, 30) * 1000);
        } else {
          await backoff(attempt);
        }
      }
    }
    // Unreachable.
    throw new LLMTransientError(0, 'retry loop exited unexpectedly');
  }

  private async withTimeout<R>(p: Promise<R>, ms: number): Promise<R> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LLMTransientError(0, `timeout after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function mapError(err: unknown): Error {
  if (err instanceof LLMAuthError || err instanceof LLMRateLimitError ||
      err instanceof LLMTransientError || err instanceof LLMValidationError) {
    return err;
  }
  if (err instanceof APIError) {
    if (err.status === 401) return new LLMAuthError(err.message);
    if (err.status === 429) {
      const headers = err.headers as unknown;
      let retryAfterHeader: string | null | undefined;
      if (headers && typeof (headers as Headers).get === 'function') {
        retryAfterHeader = (headers as Headers).get('retry-after');
      } else if (headers && typeof headers === 'object') {
        retryAfterHeader = (headers as Record<string, string>)['retry-after'];
      }
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return new LLMRateLimitError(Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    if (err.status && err.status >= 500) return new LLMTransientError(err.status, err.message);
    return new LLMTransientError(err.status ?? 0, err.message);
  }
  if (err instanceof Error) return new LLMTransientError(0, err.message);
  return new LLMTransientError(0, 'unknown error');
}

function backoff(attempt: number): Promise<void> {
  const base = 200 * 2 ** (attempt - 1); // 200, 400, 800
  const jitter = Math.floor(Math.random() * base);
  return sleep(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
