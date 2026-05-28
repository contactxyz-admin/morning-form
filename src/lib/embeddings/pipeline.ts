/**
 * Embedding pipeline: batching, retry, cost tracking, token tally (PR 2).
 *
 * Public surface:
 *   - embedAndStoreChunk (single chunk path; name kept for PR3 wiring)
 *   - embedMany (efficient batch path for backfill / future ingest bursts)
 *   - embedQuery (short query path, <150ms p95 target)
 *
 * Batching: 50–100 texts per provider call (design: 80 default).
 * Retry: 3 attempts, 30s per-attempt timeout, jittered backoff, 429 honor.
 * Cost: derived from prompt tokens using OpenAI 3-small public rate ($0.02 / M tokens).
 * Metrics: every path goes through EmbeddingMetrics (tokens, latency, cache surface, errors).
 *
 * CRITICAL (PR2 scope): NO DATABASE WRITES. embedAndStoreChunk returns the
 * vector + cost data. The actual INSERT of VectorEmbedding rows happens in PR 3
 * (ingest hook) and PR 6 (backfill). This keeps the library pure and unit-testable
 * without a Prisma dependency or side effects.
 *
 * Source of truth for chunking strategy: existing SourceChunk.text (already high
 * quality from pdf-extract + MIN_CHUNK_CHARS). Never embed synthesized content.
 */

import { createEmbeddingProvider } from './provider';
import type { EmbeddingProvider, BatchEmbeddingResult } from './types';
import {
  EmbeddingMetrics,
} from './metrics';
import {
  EmbeddingTransientError,
  type EmbeddingVector,
} from './types';

const BATCH_SIZE = 80; // sweet spot inside the 50–100 range from plan
const COST_PER_MILLION_TOKENS_USD = 0.02; // text-embedding-3-small (public rate)

export interface EmbedChunkInput {
  text: string;
  /** Correlation id for future store step (opaque in PR2). */
  sourceChunkId?: string;
  userId?: string; // reserved for per-user budget logging (PR6+)
}

export interface EmbedChunkResult {
  vector: EmbeddingVector;
  tokens: number;
  costUsd: number;
  model: string;
  dimensions: number;
  sourceChunkId?: string;
}

export interface EmbedManyResult {
  results: EmbedChunkResult[];
  totalTokens: number;
  totalCostUsd: number;
}

/**
 * Embed a single chunk (or query string) and return everything needed to store later.
 * Fire-and-forget friendly: callers (PR3) do `.catch(log)` so a transient embed
 * failure never fails the user-visible ingest.
 */
export async function embedAndStoreChunk(
  input: EmbedChunkInput,
  deps: { provider?: EmbeddingProvider } = {},
): Promise<EmbedChunkResult> {
  if (!input.text || input.text.trim().length === 0) {
    // tiny chunks already filtered upstream; guard anyway
    throw new EmbeddingTransientError(0, 'empty text for embedding');
  }

  const provider = deps.provider ?? createEmbeddingProvider();
  const start = Date.now();

  const batch = await provider.embed(input.text);
  const r = batch.results[0];
  if (!r) throw new EmbeddingTransientError(0, 'provider returned no result for single embed');

  const tokens = batch.tokens;
  const costUsd = tokensToCost(tokens);

  EmbeddingMetrics.recordTokens(tokens, costUsd);
  EmbeddingMetrics.recordCall(Date.now() - start);

  EmbeddingMetrics.logBatch({
    model: provider.model,
    batchSize: 1,
    tokens,
    costUsd,
    latencyMs: Date.now() - start,
  });

  return {
    vector: r.vector,
    tokens,
    costUsd,
    model: provider.model,
    dimensions: provider.dimensions,
    sourceChunkId: input.sourceChunkId,
  };
}

/**
 * Efficient multi-chunk embed. Automatically shards into BATCH_SIZE calls.
 * Used by backfill (PR6) and any future bulk path. Returns aligned results.
 */
export async function embedMany(
  inputs: EmbedChunkInput[],
  deps: { provider?: EmbeddingProvider } = {},
): Promise<EmbedManyResult> {
  if (inputs.length === 0) return { results: [], totalTokens: 0, totalCostUsd: 0 };

  const provider = deps.provider ?? createEmbeddingProvider();
  const out: EmbedChunkResult[] = [];
  let totalTokens = 0;
  const start = Date.now();

  // Shard into provider-friendly batches (50-100)
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const slice = inputs.slice(i, i + BATCH_SIZE);
    const texts = slice.map((x) => x.text);
    const batchRes: BatchEmbeddingResult = await provider.embed(texts);

    for (let j = 0; j < slice.length; j++) {
      const r = batchRes.results[j];
      const tokensForItem = Math.floor(batchRes.tokens / Math.max(1, texts.length)); // approx; real per-item not surfaced by most providers
      const cost = tokensToCost(tokensForItem);
      out.push({
        vector: r.vector,
        tokens: tokensForItem,
        costUsd: cost,
        model: provider.model,
        dimensions: provider.dimensions,
        sourceChunkId: slice[j].sourceChunkId,
      });
      totalTokens += tokensForItem;
    }
  }

  const latency = Date.now() - start;
  const totalCost = tokensToCost(totalTokens);
  EmbeddingMetrics.recordTokens(totalTokens, totalCost);
  EmbeddingMetrics.recordCall(latency);

  EmbeddingMetrics.logBatch({
    model: provider.model,
    batchSize: inputs.length,
    tokens: totalTokens,
    costUsd: totalCost,
    latencyMs: latency,
  });

  return { results: out, totalTokens, totalCostUsd: totalCost };
}

/** Short query embedding path (used by hybridRetrieveNodes in PR4+). */
export async function embedQuery(
  query: string,
  deps: { provider?: EmbeddingProvider } = {},
): Promise<EmbeddingVector> {
  if (!query || query.trim().length === 0) {
    throw new EmbeddingTransientError(0, 'empty query');
  }
  const res = await embedAndStoreChunk({ text: query }, deps);
  return res.vector;
}

function tokensToCost(tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_MILLION_TOKENS_USD;
}

/** Test / script helper to obtain a fresh provider (bypasses cached singletons if any added later). */
export function getDefaultProvider(): EmbeddingProvider {
  return createEmbeddingProvider();
}
