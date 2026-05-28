/**
 * Embeddings provider abstraction + concrete OpenAI + mock implementations (PR 2).
 *
 * Default: openai/text-embedding-3-small (1536d, retrieval-grade, cheap).
 * Pluggable via EmbeddingProvider interface so Voyage or AI Gateway wrappers
 * require zero pipeline changes.
 *
 * Gateway note (plan D3 + §9): set OPENAI_BASE_URL to route through Vercel AI
 * Gateway (or equivalent) for unified billing/observability. The OpenAI SDK
 * passes it through transparently.
 *
 * Error mapping, retry (3 attempts + jitter), per-attempt timeout (30s), and
 * test injection (apiKey, fetch, mock) mirror src/lib/llm/client.ts and
 * src/lib/health/libre.ts exactly.
 *
 * Mock path: used automatically when EMBEDDING_PROVIDER=mock, MOCK_LLM=true,
 * or no API key in non-prod. Deterministic vectors for reproducible tests.
 *
 * No DB, no prisma.
 */

import OpenAI from 'openai';
import { env } from '@/lib/env';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_DIMENSIONS,
  type BatchEmbeddingResult,
  type EmbeddingProvider,
  EmbeddingAuthError,
  EmbeddingRateLimitError,
  EmbeddingTransientError,
} from './types';
import { EmbeddingMetrics } from './metrics';

const PER_ATTEMPT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

interface ProviderDeps {
  apiKey?: string;
  /** Injectable fetch for tests (intercept network without real calls). */
  fetch?: typeof fetch;
  /** Force mock regardless of env (preferred in unit tests). */
  mock?: boolean;
  /** Optional baseURL override (for gateway or test double). */
  baseURL?: string;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';
  readonly model = DEFAULT_EMBEDDING_MODEL;
  readonly dimensions = DEFAULT_DIMENSIONS;

  private client: OpenAI | null;
  private mock: boolean;

  constructor(deps: ProviderDeps = {}) {
    this.mock =
      deps.mock ?? (env.EMBEDDING_PROVIDER === 'mock' || env.MOCK_LLM === 'true');

    const apiKey = deps.apiKey ?? env.OPENAI_API_KEY;

    if (this.mock && env.NODE_ENV === 'production') {
      throw new Error(
        '[OpenAIEmbeddingProvider] mock mode is not permitted in production — refusing to construct.',
      );
    }

    if (!this.mock && !apiKey) {
      console.warn(
        '[OpenAIEmbeddingProvider] OPENAI_API_KEY missing and no mock. ' +
          'Calls will fail with EmbeddingAuthError.',
      );
    }
    if (this.mock) {
      console.warn('[OpenAIEmbeddingProvider] mock mode — OpenAI will not be called.');
    }

    this.client = this.mock
      ? null
      : new OpenAI({
          apiKey: apiKey || 'missing-key',
          baseURL: deps.baseURL ?? process.env.OPENAI_BASE_URL,
          maxRetries: 0, // we own retry + timeout
          timeout: PER_ATTEMPT_TIMEOUT_MS,
          fetch: deps.fetch,
        });
  }

  async embed(texts: string | string[]): Promise<BatchEmbeddingResult> {
    const input = Array.isArray(texts) ? texts : [texts];
    if (input.length === 0) {
      return { results: [], tokens: 0, model: this.model, dimensions: this.dimensions };
    }

    if (this.mock || !this.client) {
      return this.mockEmbed(input);
    }

    const start = Date.now();
    try {
      const res = await this.callWithRetry(() =>
        this.client!.embeddings.create({
          model: this.model,
          input,
          // dimensions left default (1536) for 3-small; explicit only if future model needs
        }),
      );

      const results = res.data.map((d) => ({ vector: d.embedding as number[] }));
      const tokens = res.usage?.prompt_tokens ?? 0;

      const latency = Date.now() - start;
      const costUsd = (tokens / 1_000_000) * 0.02;
      EmbeddingMetrics.recordCall(latency);
      EmbeddingMetrics.recordTokens(tokens, costUsd);
      EmbeddingMetrics.logBatch({
        model: this.model,
        batchSize: input.length,
        tokens,
        costUsd,
        latencyMs: latency,
      });

      return {
        results,
        tokens,
        model: this.model,
        dimensions: this.dimensions,
      };
    } catch (err) {
      EmbeddingMetrics.recordError();
      EmbeddingMetrics.logBatch({
        model: this.model,
        batchSize: input.length,
        tokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private mockEmbed(input: string[]): BatchEmbeddingResult {
    // Stable deterministic pseudo-embeddings for tests (no network, reproducible).
    const results = input.map((t) => ({
      vector: this.pseudoVector(t),
    }));
    const tokens = input.reduce((sum, t) => sum + Math.max(1, Math.floor(t.length / 3.5)), 0);
    return {
      results,
      tokens,
      model: 'mock-embedding',
      dimensions: this.dimensions,
    };
  }

  private pseudoVector(text: string): number[] {
    // FNV-1a inspired; good enough for unit tests that only assert length + non-zero.
    const v = new Array(DEFAULT_DIMENSIONS).fill(0);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    for (let i = 0; i < DEFAULT_DIMENSIONS; i++) {
      const byte = (h >>> (i % 32)) & 0xff;
      v[i] = (byte / 127.5) - 1;
      h = (h * 16777619 + i) >>> 0;
    }
    return v;
  }

  private async callWithRetry<R>(call: () => Promise<R>): Promise<R> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.withTimeout(call(), PER_ATTEMPT_TIMEOUT_MS);
      } catch (err) {
        const mapped = mapError(err);
        if (mapped instanceof EmbeddingAuthError) throw mapped;
        if (mapped instanceof EmbeddingRateLimitError) {
          if (attempt === MAX_ATTEMPTS) throw mapped;
          const wait = mapped.retryAfterSeconds
            ? Math.min(mapped.retryAfterSeconds, 30) * 1000
            : backoffMs(attempt);
          await sleep(wait);
          continue;
        }
        if (attempt === MAX_ATTEMPTS) throw mapped;
        await sleep(backoffMs(attempt));
      }
    }
    throw new EmbeddingTransientError(0, 'retry loop exited unexpectedly');
  }

  private async withTimeout<R>(p: Promise<R>, ms: number): Promise<R> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EmbeddingTransientError(0, `timeout after ${ms}ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

class MockOnlyProvider implements EmbeddingProvider {
  readonly id = 'mock';
  readonly model = 'mock-embedding';
  readonly dimensions = DEFAULT_DIMENSIONS;

  async embed(texts: string | string[]): Promise<BatchEmbeddingResult> {
    const input = Array.isArray(texts) ? texts : [texts];
    const results = input.map((t) => ({ vector: this.pseudoVector(t) }));
    const tokens = input.reduce((s, t) => s + Math.max(1, Math.floor(t.length / 3.5)), 0);
    return { results, tokens, model: this.model, dimensions: this.dimensions };
  }

  private pseudoVector(text: string): number[] {
    const v = new Array(DEFAULT_DIMENSIONS).fill(0);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    for (let i = 0; i < DEFAULT_DIMENSIONS; i++) {
      v[i] = (((h >>> (i % 32)) & 0xff) / 127.5) - 1;
      h = (h * 16777619 + i) >>> 0;
    }
    return v;
  }
}

function backoffMs(attempt: number): number {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * base);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mapError(err: unknown): Error {
  if (
    err instanceof EmbeddingAuthError ||
    err instanceof EmbeddingRateLimitError ||
    err instanceof EmbeddingTransientError
  ) {
    return err;
  }
  // OpenAI SDK error shape (v4)
  const e = err as { status?: number; message?: string; headers?: unknown };
  if (e && typeof e.status === 'number') {
    if (e.status === 401) return new EmbeddingAuthError(e.message);
    if (e.status === 429) {
      let retryAfter: number | undefined;
      const h = e.headers as Record<string, string> | Headers | undefined;
      if (h) {
        const raw =
          typeof (h as Headers).get === 'function'
            ? (h as Headers).get('retry-after')
            : (h as Record<string, string>)['retry-after'];
        retryAfter = raw ? Number(raw) : undefined;
      }
      return new EmbeddingRateLimitError(Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    if (e.status >= 500) return new EmbeddingTransientError(e.status, e.message);
    return new EmbeddingTransientError(e.status, e.message);
  }
  if (err instanceof Error) return new EmbeddingTransientError(0, err.message);
  return new EmbeddingTransientError(0, 'unknown embedding error');
}

/**
 * Factory. Respects EMBEDDING_PROVIDER=mock, MOCK_LLM, and missing key (non-prod).
 * Tests should prefer explicit { mock: true } or { apiKey: 'sk-...' }.
 */
export function createEmbeddingProvider(deps: ProviderDeps = {}): EmbeddingProvider {
  const forcedMock =
    deps.mock ||
    env.EMBEDDING_PROVIDER === 'mock' ||
    env.MOCK_LLM === 'true' ||
    (!deps.apiKey && !env.OPENAI_API_KEY && env.NODE_ENV !== 'production');

  if (forcedMock) {
    return new MockOnlyProvider();
  }
  return new OpenAIEmbeddingProvider(deps);
}

/** Convenience re-exports for callers that want the concrete types. */
export { OpenAIEmbeddingProvider, MockOnlyProvider };
