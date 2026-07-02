---
title: "Prod DB drifted behind main — missing schema broke GDPR paths; enforce with a migrate-diff CI gate"
date: 2026-07-02
category: database-issues
module: morning-form
problem_type: database_issue
component: database
symptoms:
  - "Prisma P2021 (table does not exist) on all prisma.draw.* calls in prod"
  - "GDPR account deletion (tx.draw.deleteMany) 500s — the whole delete transaction rolls back"
  - "GDPR data export (prisma.draw.findMany) 500s"
  - "Booking flow (prisma.draw.findFirst) 500s"
  - "Daily 09:00 UTC retest-nudge cron fails silently; no test/CI signal caught the drift"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
severity: critical
related_components:
  - ci
  - authentication
  - background_job
tags:
  - prisma
  - schema-drift
  - neon-postgres
  - db-push
  - migrate-diff
  - ci-gate
  - gdpr
---

# Prod DB drifted behind main — missing schema broke GDPR paths; enforce with a migrate-diff CI gate

## Problem

morning-form has no Prisma migration chain — schema reaches prod via a **manual** `prisma db push` that is supposed to run before the merge auto-deploys. The retest/`Draw` feature was merged to `main` in code but its schema was **never pushed to prod**. Four live prod paths queried `prisma.draw.*` and threw Prisma `P2021`. It was silent — no deploy step, no CI check, no alert — until real users hit it. GDPR account deletion and data export were both down.

## Symptoms

- Prisma `P2021` "table does not exist" on any `prisma.draw.*` call.
- GDPR account deletion (`tx.draw.deleteMany`) 500s — the entire delete transaction rolls back, so the account is never removed.
- GDPR data export (`prisma.draw.findMany`) 500s.
- Booking flow (`prisma.draw.findFirst`) 500s; the daily 09:00 UTC retest-nudge cron fails silently.
- **No test or CI signal** — the drift was invisible to the suite (tests run against a locally-pushed schema, never against prod).

## What Didn't Work / The Trap

A blind `prisma db push` to prod would **over-apply**. `db push` reconciles the *entire* schema against the live DB, shipping every pending delta — the Draw table, its FKs, **and any unrelated columns from other features** that also hadn't been pushed. On a drifted prod that is both wrong (ships unintended changes) and risky (no preview, no transaction boundary). Never `db push` against a production DB that has drifted.

## Solution

Two parts — remediate the outage safely, then make the gap impossible to hide in future PRs.

### (A) Fix the drift safely: preview, then apply only what's intended

```bash
# Preview the exact DDL prod is missing (read-only, changes nothing)
npx prisma migrate diff \
  --from-url "$PROD_DATABASE_URL_UNPOOLED" \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# Apply ONLY the intended change via targeted, idempotent DDL in one transaction.
# For a single new column:
psql "$PROD_DATABASE_URL_UNPOOLED" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sexAtBirth" TEXT;'

# For a legitimately-missing whole table, paste the additive CREATE TABLE / FK
# block from the diff preview into the same psql --single-transaction call.
```

Read the `--script` output first, confirm it contains only what you intend to ship, then apply. `IF NOT EXISTS` makes the DDL idempotent on retry.

### (B) Prevent recurrence: a required `prod-schema-in-sync` CI check

`.github/workflows/schema-drift.yml`, job `prod-schema-in-sync`:

```yaml
on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 8 * * *'   # 08:00 UTC daily — ahead of the 09:00 retest cron
  workflow_dispatch:

jobs:
  prod-schema-in-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20.x, cache: npm }
      - run: npm ci
      - env:
          PROD_DATABASE_URL_UNPOOLED: ${{ secrets.PROD_DATABASE_URL_UNPOOLED }}
        run: |
          npx prisma migrate diff \
            --from-url "$PROD_DATABASE_URL_UNPOOLED" \
            --to-schema-datamodel prisma/schema.prisma \
            --exit-code
          # exit 0 = in sync (pass); exit 2 = drift (fail with the diff + fix hint)
```

Add `prod-schema-in-sync` to the branch ruleset's **required status checks**. On a PR it stays RED until prod already contains the branch's schema — turning "push before merge" into a hard merge gate. The daily run catches out-of-band drift before the cron surfaces it to a user. (The shipped workflow also errors clearly on a missing secret and on any non-2/0 exit.)

Verified: mutation-tested — exit 0 when prod matches `schema.prisma`, exit 2 when a column is missing; the gate passed green on a no-schema PR (no false positive).

## Why This Works

`prisma db push` reconciles the full schema, so on a drifted prod it silently ships other features' pending changes. `migrate diff --exit-code` turns the invisible manual step into an observable, enforceable invariant: a PR that needs schema cannot merge until prod has that schema. The failure moves from "a user hits a 500 weeks later" to "the PR check is red now."

## Prevention

- **The `prod-schema-in-sync` required check is the durable guardrail** — it enforces push-before-merge automatically.
- **Always `migrate diff --script` to preview** before any prod schema apply; apply the reviewed delta via `psql --single-transaction`. Never blind `db push` to a drifted prod.
- **Least-privilege CI role gotcha:** `information_schema` is privilege-filtered in Postgres, so a read-only introspection role needs `GRANT SELECT ON ALL TABLES IN SCHEMA public` (plus `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES`) — **not just `CONNECT`/`USAGE`** — or `migrate diff` reports *phantom* drift for tables the role can't see. Writes/DDL stay denied; use this read-only role for the CI secret, never the admin URL.

## Related

- `docs/solutions/runtime-errors/bootstrapping-the-test-stack-behind-the-agent-proxy-2026-06-30.md` — covers `prisma db push --force-reset` in the **test** context; this doc is the prod-drift counterpart (why `db push` is dangerous once prod has drifted).
- `docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md` — its footer proposes a `prisma-schema-default-vs-ts-constant-drift` doc (a different kind of drift: TS constant vs `@default`). Still unwritten; a natural neighbor in `database-issues/`.
