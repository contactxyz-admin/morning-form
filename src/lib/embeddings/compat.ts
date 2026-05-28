import { env } from '../env';

/**
 * PR 1: pgvector availability + fallback guard (skeleton for dev/CI + future hybrid paths).
 *
 * Float[] works everywhere (including sqlite default from env.ts) so `prisma db push` is clean.
 * Real vector ops require Postgres + the one-time extension from docs/migrations/2026-05-28-enable-pgvector.sql.
 *
 * - Returns false for sqlite (file: URLs) → callers must fallback to lexical + graph traversal.
 * - Returns true for postgres (assumes extension enabled; gateable via PGVECTOR_ENABLED=false).
 * - Later PRs extend this (e.g. query strategy enum) and call it from hybrid-retrieval.ts.
 *
 * Non-negotiable: zero behavior change in PR 1. This file is not imported by any hot path yet.
 */

export function isPgvectorAvailable(): boolean {
  const url = (env.DATABASE_URL || '').trim();
  if (url.startsWith('file:')) return false;
  if (process.env.PGVECTOR_ENABLED === 'false' || process.env.PGVECTOR_ENABLED === '0') return false;
  // Postgres target (Neon or local docker): extension is a one-time manual step owned by this PR.
  return true;
}

/** Tiny ensure stub (called out in PR 1 description for healthcheck / dev ergonomics). */
export async function ensurePgvector(): Promise<void> {
  // Future: could $queryRaw`SELECT 1 FROM pg_extension WHERE extname = 'vector'` or similar.
  // PR1 keeps it a no-op stub so consuming code can import without side effects.
}

/** Env + availability gated fallback helper (the "fallback guard"). */
export function withPgvectorFallback<T>(whenAvailable: () => T, fallback: T): T {
  return isPgvectorAvailable() ? whenAvailable() : fallback;
}
