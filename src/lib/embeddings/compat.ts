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

const FALSEY_FLAGS = new Set(['false', '0', 'off', 'disabled', 'no']);

/**
 * Returns whether the current DATABASE_URL is a Postgres that we expect has
 * the pgvector extension enabled (via the one-time SQL in PR1 migration).
 * False for sqlite/file: and for any non-postgres — forces js-cosine path.
 */
export function isPgvectorAvailable(): boolean {
  const url = (process.env.DATABASE_URL ?? env.DATABASE_URL ?? '').toLowerCase();
  if (url.includes('file:') || url.includes('sqlite')) return false;
  const pgvectorFlag = normalizeFlag(process.env.PGVECTOR_ENABLED ?? env.PGVECTOR_ENABLED);
  if (FALSEY_FLAGS.has(pgvectorFlag)) return false;
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
  const override = process.env.VECTOR_SEARCH_STRATEGY ?? env.VECTOR_SEARCH_STRATEGY;
  if (override === 'native-pgvector') return 'native-pgvector';
  return 'js-cosine';
}

/** Which provider the embeddings lib will use (openai is only real one in PR2). */
export function getEmbeddingProviderName(): string {
  return process.env.EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || 'openai';
}

/**
 * High-level rollout switch for the whole hybrid feature.
 * Defaults on when an embedding provider is configured; explicit false values
 * are the operational rollback path for retrieval and ingest-time writes.
 */
export function isHybridRetrievalEnabled(): boolean {
  const provider = getEmbeddingProviderName();
  if (provider === 'disabled') return false;

  const flag = normalizeFlag(
    process.env.HYBRID_RETRIEVAL_ENABLED ?? env.HYBRID_RETRIEVAL_ENABLED,
  );
  if (FALSEY_FLAGS.has(flag)) return false;

  // PR7 production default: once a real or mock embedding provider is
  // configured, hybrid retrieval and ingest-time embedding writes are on.
  const providerConfigured =
    provider === 'mock' ||
    process.env.MOCK_LLM === 'true' ||
    env.MOCK_LLM === 'true' ||
    Boolean(process.env.OPENAI_API_KEY || env.OPENAI_API_KEY);

  return providerConfigured;
}

function normalizeFlag(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Whether the grounded-answer gate (audit A4) is ENFORCED. Off by default
 * (grounding stays a logged metric); `true` downgrades weakly-grounded
 * clinical-safe answers to the safe deferral.
 */
export function isGroundingGateEnabled(): boolean {
  const flag = normalizeFlag(process.env.GROUNDING_GATE_ENABLED ?? env.GROUNDING_GATE_ENABLED);
  return flag === 'true' || flag === '1' || flag === 'on';
}

/**
 * The grounding floor: minimum fraction of a turn's retrieved results that must
 * be backed by real chunk+document provenance for a clinical-safe answer to
 * pass the gate. Parsed from GROUNDING_FLOOR, clamped to [0,1], default 0.5 on
 * an absent/garbage value.
 */
export function getGroundingFloor(): number {
  const raw = process.env.GROUNDING_FLOOR ?? env.GROUNDING_FLOOR;
  const parsed = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}
