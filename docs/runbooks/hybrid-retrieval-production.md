# Hybrid Retrieval Production Rollout

This runbook turns on hybrid retrieval after the schema, embedding pipeline, ingest hook, RRF primitive, tool integration, and backfill harness have landed.

## Preconditions

- `CREATE EXTENSION IF NOT EXISTS vector;` has been run once in the target Neon project using `docs/migrations/2026-05-28-enable-pgvector.sql`.
- `npx prisma generate && npx prisma db push` has been run from the deployed schema.
- `scripts/backfill-embeddings.ts --dry-run --estimate` has produced an acceptable cost estimate.
- `scripts/backfill-embeddings.ts --batch 80` has completed for the first canary user or cohort.
- Existing MCP and scribe contract tests are green.

## Environment

Set these in Vercel production and preview:

```txt
OPENAI_API_KEY=<production key or AI Gateway key>
EMBEDDING_PROVIDER=openai
VECTOR_SEARCH_STRATEGY=js-cosine
PGVECTOR_ENABLED=
HYBRID_RETRIEVAL_ENABLED=true
```

Rollback switch:

```txt
HYBRID_RETRIEVAL_ENABLED=false
```

The rollback leaves `VectorEmbedding` rows in place but disables ingest-time embedding writes and routes retrieval through the legacy lexical/graph path.

## Deploy Sequence

```bash
npx prisma generate
npx prisma db push
npx tsx scripts/backfill-embeddings.ts --dry-run --estimate
npx tsx scripts/backfill-embeddings.ts --user <canaryUserId> --batch 80
```

Deploy after the canary backfill succeeds. If the Vercel Git integration is disconnected, deploy from a clean checkout with:

```bash
vercel --prod --yes
```

## Post-Deploy Verification

1. Upload or ingest a small lab PDF for a canary user.
2. Confirm new `VectorEmbedding` rows exist for that user's `SourceChunk` rows.
3. Run `search_graph_nodes` for a semantic query that pure lexical search misses, for example `low iron stores`.
4. Confirm the returned node has `get_node_provenance` citations pointing to the user's `SourceChunk`.
5. Confirm logs include `hybrid_retrieval_grounding_score` with `score > 0`.
6. Check p95 retrieval latency for the canary remains below 420 ms.
7. Check embedding cost remains inside the planned per-user budget.

## Canary Gates

Proceed from canary to wider rollout only when:

- MCP and internal scribe tool contract tests remain unchanged.
- Grounding-rate lift is positive on the fixed query suite from `docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md`.
- No contradictory biomarker retrieval appears in the adversarial fixture suite.
- `HYBRID_RETRIEVAL_ENABLED=false` has been tested in preview and restores legacy behavior.
