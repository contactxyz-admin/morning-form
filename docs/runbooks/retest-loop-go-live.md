# Retest Loop — Go-Live Runbook

Hand-off for taking the retest loop live (Plan 2026-06-17-001). The loop closes
and measures the "return leg": a lab panel completes a **Draw**, the next retest
is **scheduled**, a daily **nudge** sequence brings the member back, and
**retention-to-retest** is measured (nudge-attributed = loop-caused). Everything
is dark behind one flag (`RETEST_LOOP_ENABLED`) plus a `CRON_SECRET`.

**Who:** anyone with Vercel project access + the prod `DATABASE_URL`.
**Time:** ~30 min.

## What is already verified (do not redo)

- Full test suite green incl. flag-off parity (no Draw rows written, booking +
  intake responses unchanged when the flag is off).
- GDPR export + erasure guards exercise a real `Draw` row (seeded in both
  fixtures); the metric excludes backfilled baselines and counts lapsed/overdue
  as non-return.
- Nudge email copy is under the `src/lib/retest` static-copy scan root.

## What this flips on

| Flag | Surfaces |
|---|---|
| `RETEST_LOOP_ENABLED` | Draw write hooks (lab-ingest completion + cadence scheduling, booking→draw link), the `/api/cron/retest-nudge` endpoint, the `result_viewed` beacon on `/decisions`, and the retest-retention section in the metrics CLI |

Strict `=== 'true'`. Off = byte-for-byte pre-feature.

## Step 0 — Prerequisites

```bash
git pull && npm install
# Prod DB URL + Vercel env access (vercel env pull, or the dashboard).
```

## Step 1 — Apply the additive schema (safe, no data change)

The `Draw` model + the additive columns (`SourceDocument.drawId`,
`BookingRequest.drawId`, `UserPreferences.notifyRetest`) deploy via `db push`
(no migrations dir):

```bash
DATABASE_URL=<prod> npx prisma db push
```

Expect "Your database is now in sync". All additive — zero risk to existing
rows, safe with the app running.

## Step 2 — Provision `CRON_SECRET` (BEFORE the flip — fail-closed)

`assertAuthEnv()` refuses to boot in production with `RETEST_LOOP_ENABLED=true`
unless `CRON_SECRET` is ≥32 chars. Vercel Cron automatically sends
`Authorization: Bearer $CRON_SECRET` when a `CRON_SECRET` env var exists, and the
route rejects anything else.

```bash
# generate a strong secret, e.g. `openssl rand -hex 32`
vercel env add CRON_SECRET production    # value: <32+ char secret>
```

## Step 3 — Run the backfill DARK (deliberately BEFORE the flip)

Gives existing lab-upload users a baseline `Draw` (tagged `attribution=backfill`,
excluded from the headline) and schedules their next retest so the nudge cron
re-engages them. Idempotent; invisible until the flag flips.

```bash
DATABASE_URL=<prod> npx tsx scripts/retest/backfill-baseline-draws.ts          # DRY RUN — review counts
DATABASE_URL=<prod> npx tsx scripts/retest/backfill-baseline-draws.ts --apply  # write
```

Verify: re-run with `--apply` → every user reports `skipped-has-draws`
(idempotent).

## Step 4 — Confirm the cron is registered

`vercel.json` declares the daily cron (`/api/cron/retest-nudge`, `0 9 * * *`).
It registers on the next production deploy — check Vercel dashboard → the
project → Settings → Cron Jobs after deploying.

## Step 5 — Flip the flag (preview first, then production)

```bash
vercel env add RETEST_LOOP_ENABLED preview      # value: true  → audit on a preview
# ...redeploy a preview; sign in with a throwaway account and confirm a lab
# upload records a Draw + schedules the next (see Step 6).
vercel env add RETEST_LOOP_ENABLED production    # value: true
vercel env ls   # confirm CRON_SECRET + RETEST_LOOP_ENABLED in Production
# Redeploy production — env changes don't apply to the running deployment.
```

## Step 6 — Post-flip verification + monitoring

- Throwaway account: upload a lab PDF → a completed `Draw` (sequence 1,
  `attribution=baseline`) exists and a `scheduled` draw is dated +`RETEST_CADENCE_DAYS`.
- Force a due nudge: set a test user's scheduled `Draw.scheduledFor` to the past,
  then hit the cron with the secret:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/retest-nudge
  # → { ok: true, considered, sent, lapsed, skipped, optedOut, errors }
  ```
- Metrics: `RETEST_LOOP_ENABLED=true DATABASE_URL=<prod> npx tsx scripts/metrics/activation-funnel.ts`
  prints the retest-retention section (nudge-attributed retention, attribution
  mix, median nudge→rebook latency).
- Watch logs for the non-fatal degrade markers:
  - `[API] intake/documents retest draw hook failed post-ingest (non-fatal)`
  - `[retest-nudge] draw <id> failed (non-fatal)`

## Rollback

```bash
vercel env rm RETEST_LOOP_ENABLED production   # redeploy
```

Flag-off is byte-for-byte pre-feature. Draw rows + the cron registration stay —
inert (the route 404s, no hooks write) and GDPR-covered. The schema stays
(additive).

## Tunables (one place — `src/lib/retest/constants.ts`, CMO-adjustable)

| Constant | Default | Meaning |
|---|---|---|
| `RETEST_CADENCE_DAYS` | 90 | days from a completed draw to the next scheduled retest |
| `RETEST_NUDGE_OFFSETS_DAYS` | `[0, 7, 21]` | nudge sends, in days after `scheduledFor` (length caps the sequence) |
| `RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS` | 30 | a return within this many days of a nudge counts as nudge-caused |
| `RETEST_LAPSE_GRACE_DAYS` | 14 | grace after the final nudge before a draw lapses |
| `DRAW_DEDUP_WINDOW_DAYS` | 14 | panels completing within this window collapse to one draw |

Opt-out: a member with `UserPreferences.notifyRetest = false` is never nudged
(absent preferences = opted in by default).

## Known deferred items (not gates)

- **Rebook deep-link** points at `/record?ref=retest-nudge`; a marker-pre-filled
  booking landing is a UI refinement (rebook-surface work).
- **Ops `deliver` does not complete a draw** — completion is bound to the honest
  panel-ingest signal; `ops` attribution is reserved for a future manual-mark path.
- **Channel is email-only** — the capped nudge sequence is the v1 compensation;
  SMS is the named fast-follow and the top conversion risk to watch.
- **`result_viewed` segmentation report** (Bet A vs Bet B) — the event fires now;
  the segmentation read is a later analysis pass.
