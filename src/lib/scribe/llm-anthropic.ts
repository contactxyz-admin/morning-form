/**
 * Production `ScribeLLMClient` — thin adapter around `@anthropic-ai/sdk`.
 *
 * The scribe executor talks to a bounded multi-turn tool-use loop. That's a
 * different shape than the structured-output `LLMClient` in `src/lib/llm/`,
 * which is single-shot forced-tool-use. So this client speaks its own
 * contract (`ScribeLLMClient` in `./execute.ts`) rather than threading the
 * structured-output client through.
 *
 * Responsibilities, and only these:
 *   1. Translate `ScribeLLMMessage[]` → Anthropic `MessageParam[]`.
 *   2. Translate Zod tool schemas → Anthropic `Tool[]` (JSON Schema).
 *   3. Call `messages.create()` once per turn.
 *   4. Normalise Anthropic's response into a `ScribeLLMTurn`, mapping
 *      `stop_reason` → `'tool_use' | 'end_turn'`. `max_tokens` and
 *      `stop_sequence` collapse into `'end_turn'` so the executor's
 *      "end_turn + tool_calls" invariant stays clean — an oversized response
 *      cleanly terminates the loop rather than pretending to want more tools.
 *   5. Map SDK errors into the existing `LLM*Error` hierarchy. Retries live
 *      here; `execute()` audits every outcome unconditionally and will
 *      surface whatever is thrown.
 *
 * What this adapter does NOT do:
 *   - Streaming. The route already awaits `execute()` to completion before
 *     opening its SSE stream so the audit row lands before tokens flow
 *     (D11). Streaming inside the adapter would add complexity without
 *     changing the user-visible contract.
 *   - Schema validation of tool inputs. The executor re-parses each tool
 *     call against the handler's Zod schema — duplicating that here would
 *     be coupling the adapter to the catalog.
 *   - Caching. Runtime Explain is one turn per selection; compile-time uses
 *     its own pipeline. A scribe cache belongs a layer up.
 */

import Anthropic, { APIError } from '@anthropic-ai/sdk';
import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlock,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '@/lib/env';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
} from '@/lib/llm/errors';
import type {
  ScribeLLMClient,
  ScribeLLMMessage,
  ScribeLLMStopReason,
  ScribeLLMToolDefinition,
  ScribeLLMTurn,
  ScribeLLMTurnRequest,
} from './execute';

const PER_ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const MAX_TOKENS = 2048;

export interface AnthropicScribeClientDeps {
  apiKey?: string;
  /** Injectable fetch for tests that want to intercept SDK calls. */
  fetch?: typeof fetch;
}

export class AnthropicScribeLLMClient implements ScribeLLMClient {
  private sdk: Anthropic;

  constructor(deps: AnthropicScribeClientDeps = {}) {
    const apiKey = deps.apiKey ?? env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMAuthError(
        'AnthropicScribeLLMClient: ANTHROPIC_API_KEY is required',
      );
    }
    this.sdk = new Anthropic({
      apiKey,
      maxRetries: 0, // retries happen in `callWithRetry` below
      timeout: PER_ATTEMPT_TIMEOUT_MS,
      fetch: deps.fetch,
    });
  }

  async turn(req: ScribeLLMTurnRequest): Promise<ScribeLLMTurn> {
    const params: MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: MAX_TOKENS,
      temperature: req.temperature,
      system: req.system,
      tools: req.tools.map(toAnthropicTool),
      messages: req.messages.map(toAnthropicMessage),
    };

    const response = await this.callWithRetry(
      () => this.sdk.messages.create(params, { signal: req.signal }),
      req.signal,
    );

    const text = response.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const toolCalls = response.content
      .filter((b): b is ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));

    return {
      stopReason: mapStopReason(response.stop_reason),
      text,
      toolCalls,
      modelVersion: response.model,
    };
  }

  private async callWithRetry<R>(
    call: () => Promise<R>,
    signal: AbortSignal | undefined,
  ): Promise<R> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) throw abortErrorFor(signal);
      try {
        return await call();
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) {
          throw signal ? abortErrorFor(signal) : err instanceof Error ? err : new Error(String(err));
        }
        const mapped = mapError(err);
        // Auth is not retryable — wrong key now is still wrong later.
        if (mapped instanceof LLMAuthError) throw mapped;
        if (attempt === MAX_ATTEMPTS) throw mapped;
        if (
          mapped instanceof LLMRateLimitError &&
          mapped.retryAfterSeconds !== undefined
        ) {
          await sleep(Math.min(mapped.retryAfterSeconds, 30) * 1000);
        } else {
          await backoff(attempt);
        }
      }
    }
    throw new LLMTransientError(0, 'scribe retry loop exited unexpectedly');
  }
}

/**
 * Convert a scribe executor message into Anthropic's `MessageParam` shape.
 * The executor uses three roles; Anthropic only knows 'user' and 'assistant'
 * so `tool_result` folds back into a user-role message carrying tool_result
 * blocks. That's the shape the Anthropic API actually expects.
 */
export function toAnthropicMessage(m: ScribeLLMMessage): MessageParam {
  if (m.role === 'assistant') {
    const blocks: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    > = [];
    if (m.content) blocks.push({ type: 'text', text: m.content });
    for (const call of m.toolCalls ?? []) {
      blocks.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.input,
      });
    }
    // Anthropic rejects an assistant message with an empty content array.
    // An assistant turn that emitted neither text nor tool_use shouldn't
    // reach us (the executor only pushes assistant messages from real
    // turns), but guard anyway with an empty-string text block.
    if (blocks.length === 0) blocks.push({ type: 'text', text: '' });
    return { role: 'assistant', content: blocks as MessageParam['content'] };
  }
  if (m.role === 'tool_result') {
    const blocks = (m.toolResults ?? []).map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolUseId,
      content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
      is_error: r.isError ?? false,
    }));
    return { role: 'user', content: blocks as MessageParam['content'] };
  }
  // Plain user text.
  return { role: 'user', content: m.content };
}

export function toAnthropicTool(t: ScribeLLMToolDefinition): Tool {
  const schema = zodToJsonSchema(t.parameters, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema['$schema'];
  return {
    name: t.name,
    description: t.description,
    input_schema: schema as Tool['input_schema'],
  };
}

export function mapStopReason(
  reason: string | null | undefined,
): ScribeLLMStopReason {
  // Only 'tool_use' signals another loop iteration. Everything else —
  // including 'max_tokens' and 'stop_sequence' — cleanly terminates the
  // executor loop. The executor then runs its own "end_turn must have zero
  // tool calls" invariant check, which will still catch a stop that looks
  // ambiguous.
  return reason === 'tool_use' ? 'tool_use' : 'end_turn';
}

function mapError(err: unknown): Error {
  if (
    err instanceof LLMAuthError ||
    err instanceof LLMRateLimitError ||
    err instanceof LLMTransientError
  ) {
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
      return new LLMRateLimitError(
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (err.status && err.status >= 500) {
      return new LLMTransientError(err.status, err.message);
    }
    return new LLMTransientError(err.status ?? 0, err.message);
  }
  if (err instanceof Error) return new LLMTransientError(0, err.message);
  return new LLMTransientError(0, 'unknown error');
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if ((err as { code?: string }).code === 'ABORT_ERR') return true;
  }
  return false;
}

function abortErrorFor(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const message = typeof reason === 'string' ? reason : 'aborted';
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function backoff(attempt: number): Promise<void> {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * base);
  return sleep(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
