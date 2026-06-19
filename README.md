# Morning Form

Morning Form is a premium mobile-first state-optimization web app covering assessment, profile generation, protocol recommendation, daily guidance, check-ins, insights, and wearable integrations.

## Local development

```bash
cd /Users/reubenselby/Desktop/morning-form
npm install
npx prisma db push
npm run db:seed
npm run dev
```

App URL:

```txt
http://localhost:3000
```

Demo user seeded locally:

```txt
demo@morningform.com
```

## Current branch workflow

- `main`: built MVP
- `feat/real-health-oauth`: review branch for real provider connection wiring

Open PR:

```txt
https://github.com/contactxyz-admin/morning-form/pull/1
```

## Health integrations

Morning Form currently supports:

- Terra-backed Apple Health and Garmin connection flow
- Direct OAuth scaffolding for Whoop, Oura, Fitbit, and Google Fit
- persisted provider connections via Prisma
- callback routes and token exchange when credentials are configured
- graceful mock fallback when credentials are absent

Detailed provider setup lives in:

[`docs/HEALTH_PROVIDER_SETUP.md`](/Users/reubenselby/Desktop/morning-form/docs/HEALTH_PROVIDER_SETUP.md)

## Metrics

- Activation funnel (signup → first grounded answer → retained): `npx tsx scripts/metrics/activation-funnel.ts --signup-since 2026-03-22 --signup-until 2026-04-21`. Prints CSV + human-readable summary. See [`docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md`](docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md).

## Retest loop

The retest loop (off by default, behind `RETEST_LOOP_ENABLED`) runs the "return leg": a lab panel completes a `Draw`, the next retest is scheduled, a daily Vercel cron (`/api/cron/retest-nudge`, gated by `CRON_SECRET`) sends a capped nudge sequence, and retention-to-retest is measured (nudge-attributed = loop-caused). The metrics CLI above appends a retest-retention section when the flag is on. Backfill existing users (run dark, before the flip): `npx tsx scripts/retest/backfill-baseline-draws.ts` (dry run) then `--apply`. Tunables live in `src/lib/retest/constants.ts`. See [`docs/runbooks/retest-loop-go-live.md`](docs/runbooks/retest-loop-go-live.md) and [`docs/plans/2026-06-17-001-feat-return-leg-retest-loop-plan.md`](docs/plans/2026-06-17-001-feat-return-leg-retest-loop-plan.md).

## Retrieval

Hybrid retrieval is enabled when an embedding provider is configured. It embeds only `SourceChunk.text`, stores one `VectorEmbedding` per chunk, and keeps `search_graph_nodes` on the same public contract while ranking with vector + lexical + graph RRF. Set `HYBRID_RETRIEVAL_ENABLED=false` to roll back to legacy lexical/graph behavior.

Production rollout:

```bash
npx prisma generate
npx prisma db push
npx tsx scripts/backfill-embeddings.ts --dry-run --estimate
npx tsx scripts/backfill-embeddings.ts --batch 80
```

See [`docs/runbooks/hybrid-retrieval-production.md`](docs/runbooks/hybrid-retrieval-production.md) and [`docs/runbooks/backfill-embeddings.md`](docs/runbooks/backfill-embeddings.md).
