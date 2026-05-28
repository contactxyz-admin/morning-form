# Backfill Embeddings

Use this runbook after the PR6 schema is deployed and before enabling hybrid retrieval broadly. The backfill embeds only `SourceChunk.text`; it must not embed generated scribe output, graph node names, diagnostic summaries, or topic pages.

For the full production rollout and rollback sequence, see `docs/runbooks/hybrid-retrieval-production.md`.

## Prerequisites

- `DATABASE_URL` points at the target Postgres database.
- `OPENAI_API_KEY` is set for real embeddings, or `EMBEDDING_PROVIDER=mock` is set for local/test smoke runs.
- The pgvector extension SQL from `docs/migrations/2026-05-28-enable-pgvector.sql` has been run once per Neon project.

## Schema

Run from the repo root:

```bash
npm install
npx prisma generate
npx prisma db push
```

`db push` adds the additive `EmbeddingBackfillState` table and keeps existing `VectorEmbedding` rows intact.

## Dry Run

Start with a global estimate, then a scoped user estimate:

```bash
npx tsx scripts/backfill-embeddings.ts --dry-run --estimate
npx tsx scripts/backfill-embeddings.ts --user <userId> --dry-run --estimate
```

Check the printed `chunks`, `tokens`, and `costUsd`. Each run records an `EmbeddingBackfillState` row with `dryRun=true`; no provider calls or `VectorEmbedding` writes happen.

## Backfill

Backfill one user first:

```bash
npx tsx scripts/backfill-embeddings.ts --user <userId> --batch 80
```

Then run globally if the cost estimate is acceptable:

```bash
npx tsx scripts/backfill-embeddings.ts --batch 80
```

The script is idempotent. It queries chunks missing an embedding for the active model and writes with `skipDuplicates` on `sourceChunkId`, so rerunning after interruption skips already-embedded chunks.

## Resume And Audit

Inspect progress:

```bash
npx prisma studio
```

Open `EmbeddingBackfillState` and check `status`, `processedChunks`, `embeddedChunks`, `skippedChunks`, `totalTokens`, and `totalCostUsd`.

If a run fails after creating a state row, rerun either normally or continue the same audit row:

```bash
npx tsx scripts/backfill-embeddings.ts --resume <stateId> --batch 80
```

## Verification

After a scoped backfill, verify there are vectors for that user and run the grounding/adversarial checks:

```bash
npx prisma validate
npx vitest run src/lib/embeddings/backfill.test.ts src/lib/graph/hybrid-retrieval.adversarial.test.ts src/lib/metrics/hybrid-retrieval-grounding.test.ts
```

The canary grounding metric is emitted as `hybrid_retrieval_grounding_score` when `search_graph_nodes` uses hybrid retrieval. It measures the fraction of returned nodes that have a `SourceChunk` citation in the top provenance items, matching the grounding-rate plan in `docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md`.
