/**
 * Core types, provider interface, and typed error hierarchy for the embeddings
 * abstraction (PR 2 of hybrid retrieval plan).
 *
 * Design goals (from 2026-05-28-001 plan):
 * - Pluggable providers (OpenAI 3-small default; Voyage / gateway future).
 * - No PII in payloads — only raw SourceChunk.text (or query strings).
 * - Strong contracts + testability via dependency injection (apiKey, fetch, mock).
 * - Cost + token observability exported via metrics surface.
 *
 * Mirrors patterns from src/lib/llm/client.ts + src/lib/health/libre.ts (typed
 * errors, bounded retry + jitter, per-attempt timeout, mock bypass for dev/test).
 *
 * No Prisma imports, no DB writes in this module (PR2 scope — writes arrive in PR 3).
 */

export type EmbeddingModel = 'openai/text-embedding-3-small';

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = 'openai/text-embedding-3-small';
export const DEFAULT_DIMENSIONS = 1536;

export type EmbeddingVector = number[];

export interface EmbeddingResult {
  vector: EmbeddingVector;
  /** Per-item token count when provider surfaces it (optional for batch). */
  tokens?: number;
}

export interface BatchEmbeddingResult {
  results: EmbeddingResult[];
  /** Aggregate prompt tokens for the entire batch (drives cost + EmbeddingMetrics). */
  tokens: number;
  model: string;
  dimensions: number;
}

/**
 * Minimal pluggable provider contract.
 * Callers (pipeline) never reach into SDKs directly.
 */
export interface EmbeddingProvider {
  readonly id: string; // 'openai' | 'mock' | future
  readonly model: string;
  readonly dimensions: number;

  /**
   * Embed a single string or batch of strings.
   * Returns parallel results + total tokens used (for cost calc).
   * Must be side-effect free except network.
   */
  embed(texts: string | string[]): Promise<BatchEmbeddingResult>;
}

/** Auth failures (bad key, 401). Not retried. */
export class EmbeddingAuthError extends Error {
  constructor(message = 'embedding provider auth failed') {
    super(message);
    this.name = 'EmbeddingAuthError';
  }
}

/** Rate limit (429). Carries optional retry-after for backoff. */
export class EmbeddingRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('embedding provider rate limited');
    this.name = 'EmbeddingRateLimitError';
  }
}

/** Transient (5xx, network, timeout). Safe to retry with backoff. */
export class EmbeddingTransientError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `embedding transient error: ${status}`);
    this.name = 'EmbeddingTransientError';
  }
}
