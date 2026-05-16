/**
 * Deterministic IDs for the demo user's graph + sources.
 *
 * Why deterministic: the committed topic fixture
 * (`demo-navigable-record-topics.json`) embeds nodeIds inside compiled
 * Citation objects. If those IDs changed on every re-seed, every deploy
 * would render citations pointing at rows that no longer exist. Stable
 * IDs let the fixture survive infinite redeploys with no drift.
 *
 * Scope: demo user ONLY. Real-user graphs continue to use Prisma's
 * `@default(cuid())` at ingest time. These helpers are imported by
 * `prisma/seed.ts` (every-deploy seed) and `scripts/demo/regenerate-
 * topic-fixture.ts` (developer-only regeneration), and nowhere else.
 *
 * Format: ASCII, hyphen-separated, prefixed with `demo-` so a stray
 * collision is obvious in DB inspection. Underscores in canonicalKeys
 * are preserved for readability; the unique constraint upstream is
 * `(userId, type, canonicalKey)` so even identical keys across users
 * never collide.
 */

export function demoNodeId(type: string, canonicalKey: string): string {
  return `demo-node-${type}-${canonicalKey}`;
}

export function demoSourceId(sourceKey: string): string {
  return `demo-source-${sourceKey}`;
}

export function demoChunkId(sourceKey: string, chunkKey: string): string {
  return `demo-chunk-${sourceKey}-${chunkKey}`;
}
