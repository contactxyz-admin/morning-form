# A2 — Native pgvector / HNSW ANN: execution plan

**Status:** ready to execute in a Postgres-enabled environment. Written because
the audit's A2 (native ANN retrieval) cannot be built or verified in the
sandbox — it requires a live Postgres with the `pgvector` extension, and
`prisma generate` (engine download) is blocked there.

**Goal (audit A2 acceptance):** full-corpus ANN retrieval — drop the 400-chunk
recency cap and the pure-JS cosine scan; measure recall@k against the current
exact scan; confirm an old-but-relevant chunk (beyond the recent-400 window) is
now retrievable.

## Current state (verified at HEAD)

- `docs/migrations/2026-05-28-enable-pgvector.sql` — runs `CREATE EXTENSION IF
  NOT EXISTS vector;` (live); the `ALTER … vector(1536)` + HNSW `CREATE INDEX`
  are present but commented out.
- `prisma/schema.prisma` — `VectorEmbedding.vector` is `Float[]` (line ~272).
- `src/lib/graph/hybrid-retrieval.ts` — vector arm gated on
  `getVectorSearchStrategy() === 'js-cosine'`; scores only
  `getRecentChunkVectors(db, userId, 400)` with the hand-rolled
  `cosineSimilarity`.
- `src/lib/embeddings/compat.ts:46-55` — `getVectorSearchStrategy()` returns
  `'native-pgvector'` ONLY via `VECTOR_SEARCH_STRATEGY` override, but there is
  no native consumer, so selecting it today just DISABLES the vector arm.
- `src/lib/graph/queries.ts` — `getRecentChunkVectors` (`ORDER BY sc."createdAt"
  DESC LIMIT 400`); `EmbeddingBackfillState` model + `scripts/backfill-embeddings.ts`
  exist for backfill.

## Prerequisites

- Postgres 15+ with `pgvector` ≥ 0.7 available (`CREATE EXTENSION vector`).
- All target `VectorEmbedding` rows are 1536-d and backfilled (see Step 3).
- Neon note: run the one-time SQL per project (UK + US replicas), as the
  migration header states.
- Test envs too: once the schema column is `Unsupported("vector(1536)")`, the
  vitest global-setup's `prisma db push` fails on any Postgres without pgvector
  — install the extension on local dev and CI test databases before merging the
  schema change.

## Steps

### 1. Enable the extension (already authored)
Run `docs/migrations/2026-05-28-enable-pgvector.sql` once per DB
(`CREATE EXTENSION IF NOT EXISTS vector;`).

### 2. Schema: adopt the native `vector` type without Prisma fighting it
Prisma has no first-class `vector` type. Change the column to
`Unsupported("vector(1536)")` so `prisma db push` won't revert the `ALTER`:

```prisma
model VectorEmbedding {
  // …
  vector        Unsupported("vector(1536)")
  // …
}
```

All reads/writes of `vector` then go through `$queryRaw` / `$executeRaw`
(Prisma cannot select an `Unsupported` column into a typed field — exclude it
from `select` and fetch via raw SQL where needed). Keep `dimensions` Int for a
guard.

### 3. Backfill + convert
1. Ensure every `SourceChunk` that should be searchable has a `VectorEmbedding`
   row: run `scripts/backfill-embeddings.ts` (drives `EmbeddingBackfillState`).
2. Guard dimension consistency: `SELECT dimensions, count(*) FROM
   "VectorEmbedding" GROUP BY 1;` — must be a single row at 1536.
3. Convert the stored `Float[]` to `vector(1536)` (in the migration SQL, now
   uncommented):
   ```sql
   ALTER TABLE "VectorEmbedding"
     ALTER COLUMN vector TYPE vector(1536) USING vector::vector;
   ```
   Do this AFTER backfill so the `USING` cast sees only well-formed arrays.

### 4. Build the HNSW index (cosine)
```sql
CREATE INDEX CONCURRENTLY vector_embedding_hnsw
  ON "VectorEmbedding" USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```
- Use `vector_cosine_ops` + the `<=>` (cosine distance) operator to match the
  current cosine semantics. (`<->` is L2 — do NOT use it here.)
- `CONCURRENTLY` to avoid locking; expect minutes on a large table.
- Set `SET hnsw.ef_search = 100;` per session/connection (tune 40–200 for the
  recall/latency trade-off).

### 5. Code: add the native vector arm
In `src/lib/graph/hybrid-retrieval.ts`, when
`getVectorSearchStrategy() === 'native-pgvector'`, replace the recent-400 JS
scan with a KNN query over the FULL corpus (user-scoped), e.g.:

```sql
SELECT sc.id AS "chunkId"
FROM "VectorEmbedding" ve
JOIN "SourceChunk" sc ON sc.id = ve."sourceChunkId"
WHERE sc."userId" = $1                     -- enforce user scope in SQL
ORDER BY ve.vector <=> $2::vector          -- $2 = the query embedding
LIMIT $3;                                   -- vectorK
```
- Bind the query embedding as a `vector` literal (`$2::vector`).
- Keep `rrfFuse` and the lexical/graph arms unchanged — only the vector arm's
  candidate source changes. The RRF rank order is preserved (distance-ascending
  = similarity-descending).
- Drop the `getRecentChunkVectors(…, 400)` call on this path. Keep the
  `js-cosine` path as the fallback for sqlite/dev and pre-migration DBs
  (`getVectorSearchStrategy()` already returns `js-cosine` there).
- In `src/lib/embeddings/compat.ts`, allow `'native-pgvector'` only when
  `isPgvectorAvailable()` AND the extension/index are present; gate promotion
  behind `VECTOR_SEARCH_STRATEGY=native-pgvector` (default stays `js-cosine`).

### 6. Verify (the acceptance)
- **Recall@k:** over a fixed query set, compute the native top-k vs the current
  exact JS-cosine top-k (over the SAME full corpus, temporarily uncapped) and
  report recall@10 / recall@20. Target ≥ 0.95 at `ef_search=100`; raise
  `ef_search` if lower.
- **Beyond-window retrieval:** seed a user whose relevant chunk is older than
  their 400 most-recent; confirm it now appears in the vector arm (it cannot
  today).
- **Latency:** log p50/p95 of the KNN query; confirm sublinear vs corpus size.
- **Grounding:** the A4 grounded-answer-rate should not regress (run
  `metrics:grounding` / the golden benchmark).

### 7. Rollout
- Ship the code with the flag OFF (`js-cosine` remains default) → apply
  extension/ALTER/index on the DB → flip `VECTOR_SEARCH_STRATEGY=native-pgvector`
  for a canary → monitor grounding + latency → full rollout. Instant rollback by
  unsetting the flag (falls back to `js-cosine`).

## Risks / notes
- **Prisma `Unsupported`:** the `vector` column can't be selected into a typed
  field; all vector I/O must be raw SQL. Audit every place that `select`s
  `VectorEmbedding` to ensure none pulls `vector` into Prisma.
- **User scoping:** the KNN `WHERE sc."userId" = $1` MUST be in the SQL — never
  rely on post-filtering, or the `LIMIT` would leak/omit across users.
- **Index recall:** HNSW is approximate; `ef_search` too low silently lowers
  recall. The recall@k gate above is the guard.
- **Dimension drift:** if a future model changes dimensionality, the fixed
  `vector(1536)` column + index must be rebuilt; keep the `dimensions` guard.

## Verification commands (DB-enabled env)
```bash
# One-time toolchain
npm ci && npx prisma generate
# Bring up the schema against your test Postgres
TEST_DATABASE_URL=postgres://user@localhost:5432/morning_form_test npx prisma db push
# Full suite (needs the Postgres above) + lint + build typecheck
TEST_DATABASE_URL=postgres://user@localhost:5432/morning_form_test npm test
npm run lint
npx tsc --noEmit    # or `npm run build`
```
