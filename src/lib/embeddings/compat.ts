/**
 * Embeddings compatibility & rollout helpers (PR 2 extension of PR 1 skeleton).
 *
 * PR1 was responsible for the initial `isPgvectorAvailable()` + env-gated
 * fallback (so sqlite dev + pre-migration Neon branches stay green).
 *
 * PR2 extends the file with:
 *   - VectorSearchStrategy enum (js-cosine vs native-pgvector) used by PR4 hybrid
 *   - getVectorSearchStrategy() with safe default to 'js-cosine' until native
 *     path is proven (see plan "MVP query strategy for Float[]").
 *   - Thin wrappers so higher layers never import env directly for embeddings.
 *
 * sqlite default in env.ts is tolerated; hybrid paths force lexical+graph fallback
 * via this module. No hard dependency on the vector extension in PR2.
 */

import { env } from '@/lib/env';

/**
 * Strategy for the vector arm of hybrid retrieval (PR4).
 * 'js-cosine' = fetch bounded candidates + pure-JS cosine on Float[] (MVP, works on sqlite & pre-ALTER).
 * 'native-pgvector' = use <-> operator + HNSW (follow-up after backfill + ALTER).
 */
export type VectorSearchStrategy = 'js-cosine' | 'native-pgvector';

/**
 * Returns whether the current DATABASE_URL is a Postgres that we expect has
 * the pgvector extension enabled (via the one-time SQL in PR1 migration).
 * False for sqlite/file: and for any non-postgres — forces js-cosine path.
 */
export function isPgvectorAvailable(): boolean {
  const url = (env.DATABASE_URL ?? '').toLowerCase();
  if (url.includes('file:') || url.includes('sqlite')) return false;
  if (env.PGVECTOR_ENABLED === 'false' || env.PGVECTOR_ENABLED === '0') return false;
  return url.startsWith('postgres') || url.startsWith('postgresql');
}

/**
 * Current strategy for vector search. In PR2/PR3 this is always 'js-cosine'
 * (the only implemented arm). PR4 will respect the return value and implement
 * the JS cosine fallback when native is not available.
 */
export function getVectorSearchStrategy(): VectorSearchStrategy {
  if (!isPgvectorAvailable()) {
    return 'js-cosine';
  }
  // Explicit env override reserved for post-PR6 experimentation.
  // Default remains the safe MVP path until native is hardened.
  const override = (env as Record<string, unknown>).VECTOR_SEARCH_STRATEGY as string | undefined;
  if (override === 'native-pgvector') return 'native-pgvector';
  return 'js-cosine';
}

/** Which provider the embeddings lib will use (openai is only real one in PR2). */
export function getEmbeddingProviderName(): string {
  return env.EMBEDDING_PROVIDER || 'openai';
}

/**
 * High-level kill switch for the whole hybrid feature.
 * In PR2 the library itself is always usable (mock friendly).
 * Real gating + ingest hook behind the flag lands in PR3.
 */
export function isHybridRetrievalEnabled(): boolean {
  // Not yet wired to a real env var in PR2 (HYBRID_RETRIEVAL_ENABLED added in PR3/7).
  // For now: enabled as soon as we have a provider key or are in mock mode.
  const provider = getEmbeddingProviderName();
  return provider !== 'disabled' && (provider === 'mock' || !!env.OPENAI_API_KEY || env.MOCK_LLM === 'true');
}
