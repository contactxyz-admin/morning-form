# Longitudinal Health Graph — Go-Live Runbook

Hand-off for taking the longitudinal feature live in production: the merged
work from PRs #162 (data substrate + `/decisions` card), #165/#166 (temporal
graph canvas: badge/ring/pulse), and #167 (importance lift, perf, link
gating). Everything is in `main`, fully dark behind two flags.

**Who:** anyone with Vercel project access + the prod `DATABASE_URL`, plus
eyes on a browser for the audit. **Time:** ~45–60 min end to end.

## What is already verified (do not redo)

- Full test suite green (1,822) incl. flag-off byte-for-byte parity tests.
- Tailwind cold-render check: all 8 change-decoration classes present in the
  compiled production CSS (no JIT drop).
- Two `/ce:code-review` passes over the feature (PRs #166, #167); findings
  fixed or listed below as audit watch-items.

## What this flips on

| Flag | Surfaces |
|---|---|
| `DECISIONS_ENABLED` | `/decisions` timeline (5th nav tab), action lifecycle API, marker trajectory pages, outcome snapshots |
| `LONGITUDINAL_GRAPH_ENABLED` | "What changed since your last test" card on `/decisions`; `GET /api/markers/changes`; `changes` block on lab-upload responses; instance-backed trajectories + lab↔wearable alias merge; canvas change badge/ring/pulse + detail-sheet before→after; importance lift for moved markers |

Lab-upload *writes* (dated observation instances) are already live and
unconditional — they are invisible until these read flags flip.

Both flags are strict `=== 'true'`. Flip them together: the canvas
"See trajectory" link lands on a `/decisions` page, and the card lives there.

## Step 0 — Prerequisites

```bash
git pull && npm install
# Prod DB URL: Vercel dashboard → morning-form → Settings → Environment
# Variables → DATABASE_URL (or `vercel env pull`).
```

## Step 1 — Apply the additive schema index (safe, no data change)

PR #162's review pass added `@@index([userId, fromDocumentId])` on
`GraphEdge` (the panel-diff join). The repo deploys schema via `db push`
(no migrations dir):

```bash
DATABASE_URL=<prod> npx prisma db push
```

Expect: "Your database is now in sync". Additive index only — zero risk to
existing rows; safe with the app running.

## Step 2 — Run the backfill (while still dark — deliberately BEFORE the flip)

Recovers each pre-existing biomarker's surviving anchor reading as a dated
observation instance **with SUPPORTS provenance**, so the panel diff can show
before→after the moment the flag flips (instead of "new" for everything).
Invisible while the flags are off; idempotent (re-run = no-op).

```bash
DATABASE_URL=<prod> npm run markers:backfill-observations
# per-user lines: scanned / created / skipped, then a total.
```

Verify: re-run it — second run should report `created=0` everywhere.

## Step 3 — Preview audit (flags on in Preview scope only)

Set both flags for **Preview** (not Production) so you can audit on a preview
deployment with prod still dark:

```bash
vercel env add LONGITUDINAL_GRAPH_ENABLED preview   # value: true
vercel env add DECISIONS_ENABLED preview            # value: true
# then redeploy any open preview (Vercel dashboard → Redeploy) or push a
# trivial branch to get a fresh preview build.
```

Seed an audit account on the preview: sign in with a throwaway email, upload
**two lab PDFs with different collection dates** (any real panel PDFs work —
extraction needs genuine text). The second upload is the "re-test".

### Audit checklist (the visual gate — desktop + 320 px mobile + reduced-motion)

`/record?mode=map` (desktop):
- [ ] Changed biomarker nodes show a tone ring + a small ↑/↓/+ badge; the
      graph layout itself does NOT shift because of the decoration.
- [ ] One calm **pulse** plays per page load after the entrance settles
      (single swell, fades out, nothing keeps moving afterwards).
- [ ] OS reduced-motion ON → static ring only, no pulse, no entrance tween.
- [ ] **Watch-item (known):** the badge glyph is white on the tone disc; on
      the *neutral gray* tone (`stable`/`unclassified`) contrast is marginal.
      If illegible: change `fill-white` → a darker fill in
      `use-graph-state.ts` (badge text node) — one-line fix.
- [ ] **Watch-item (known):** canvas tones are design tokens
      (positive/alert/accent) while the `/decisions` card chips are raw
      emerald/amber/blue. Decide whether the drift is acceptable or pick one
      palette (tracked review finding #3 — a deliberate visual decision).
- [ ] Click a changed node → detail sheet shows "Since your last test"
      (before → after, dates, range-relative label) and the
      "See trajectory →" link opens the marker page.

Mobile (`/record`, 320 px):
- [ ] List view shows the change chip (e.g. `18 ↑ 41 ug/L`) on moved markers.
- [ ] 5-tab bottom nav (Decisions appears) doesn't truncate or crowd.

`/decisions`:
- [ ] "What changed since your last test" card lists the moved markers with
      before→after, chips, and correct dates; disclaimer reads correctly.
- [ ] Trajectory page (≥2 points) renders the sparkline with sane date labels.
- [ ] Phase B walkthrough (its own U6 gate, never run in prod): ask a
      question on `/ask` → accept a suggested action → mark complete → mark
      outcome → the timeline shows the frozen before/after snapshot.

## Step 4 — Production flip

```bash
vercel env add LONGITUDINAL_GRAPH_ENABLED production   # value: true
vercel env add DECISIONS_ENABLED production            # value: true
vercel env ls   # verify both show in Production scope
# Redeploy production (Vercel dashboard → latest production deployment →
# Redeploy) — env changes do not apply to the running deployment.
```

## Step 5 — Post-flip verification + monitoring

- Repeat the audit's happy path once on prod with a throwaway account
  (upload re-test → badge on canvas → sheet → trajectory → `/decisions` card).
- Watch function logs for these non-fatal degrade markers (they hide the
  feature rather than erroring, so logs are the only signal):
  - `[API] record panel-diff failed (non-fatal)`
  - `[API] intake/documents panel diff failed post-ingest (non-fatal)`
  - `[decisions] panel diff failed (card hidden)`
- `GET /api/markers/changes` on an account with two panels returns the diff.

## Rollback

```bash
vercel env rm LONGITUDINAL_GRAPH_ENABLED production
vercel env rm DECISIONS_ENABLED production
# redeploy production
```

Flag-off behaviour is byte-for-byte pre-feature (parity-tested). The backfill
rows and observation instances stay in the DB — invisible, harmless, and
GDPR-covered by the existing GraphNode/GraphEdge export+delete guards. The
schema index stays — additive, no rollback needed.

## Known deferred items (not gates)

- Demo persona fixture has no observation instances — the public `/demo`
  surfaces won't show multi-point lab trajectories until that separate task.
- Per-request panel diff on `/api/record` is parallelized but uncached;
  compute-at-ingest/memoize-by-revision is the eventual home once usage is
  real.
- Feeding the dated history series into scribe/LLM context is a separate,
  DPIA-gated phase — NOT enabled by these flags.
