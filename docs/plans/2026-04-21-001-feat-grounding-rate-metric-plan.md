---
title: "feat: Grounding-rate metric script (B2 validation gate)"
type: feat
status: active
date: 2026-04-21
origin: docs/brainstorms/2026-04-21-mvp-validation-requirements.md
---

# feat: Grounding-rate metric script (B2 validation gate)

## Overview

Ship a CLI script that answers one question: of specialist answers Morning Form is producing, what percentage cite the user's own data? This is the B2 product-quality gate from the MVP-validation brainstorm — the signal that Morning Form's "specialist conversation about MY data" claim is actually true, not aspirational.

No new API route. No admin page. No UI. A script, a query, tests, and a README line for how to run it. This is the genuinely startup-scale answer: every piece of data the script needs is already in `ScribeAudit`; the only work is a query and a way to invoke it.

Broader context — of Jonathan Selby's seven recommendations (see origin doc), this is the single code-actionable item. R1/R2/R3/R7 are commercial artifacts that don't touch the repo. R4 is addressed by the companion regulatory-posture memo. R5/R6 are already reflected in the codebase today.

## Problem Frame

Jonathan Selby's 16 April 2026 feedback (R1) asks for hard data on willingness to pay and market size. The MVP-validation brainstorm introduces two sequenced gates: **B2 data-grounded answer rate** (product-quality gate, must clear first) and **B1 paid-conversion cohort** (commercial gate, runs after B2).

B1 requires a paywall that doesn't exist in code. B2 requires nothing but a query against `ScribeAudit`, which already stores every clinical-safe turn's `safetyClassification` and `citations` JSON (see `prisma/schema.prisma:477`).

Currently there is no way to read this metric. This plan ships the minimum scaffolding to make the metric a single command away. Pre-requisite for B1; immediately useful on its own for founder-level decisions about product quality.

## Requirements Trace

- R1 (maps to origin V1) — A query function computes the citation rate of clinical-safe specialist answers.
- R2 (maps to origin V2) — The rate is reportable at cohort level (a list of userIds + a time window).
- R3 (maps to origin V3) — Output includes `N` alongside the rate so a reader can distinguish signal from noise.
- R4 (maps to origin V4) — Implementation relies on the `citations` JSON already persisted on `ScribeAudit`. No schema change.
- R5 (implicit) — Script output is a stable CSV plus a one-line summary, suitable for copy-paste into a deck or sheet without reformatting.

## Scope Boundaries

- **In scope:** one query module, one CLI script, tests, a short README note.
- **Not in scope:** admin page, API route, live dashboard, trend charting, Slack notifications, scheduled runs. Revisit if weekly reporting becomes a real need.
- **Not in scope:** B1 paid-conversion instrumentation, pricing UI, subscription checkout. Separate plan after B2 has actually been run against a cohort.
- **Not in scope:** B2 itself *clearing* the ≥70% threshold. This plan ships the measurement; the product work to raise the rate if it's below target is whatever the next iteration finds.

### Deferred to Separate Tasks

- Admin/internal page rendering B2 over time — deferred until weekly-or-faster cadence is needed. For now, re-run the script.
- Exclusion of internal/test users from the rate — deferred; the initial query accepts an explicit userId list, so callers can exclude internal accounts by not passing them.

## Context & Research

### Relevant Code and Patterns

- `prisma/schema.prisma:477` — `ScribeAudit` model. Columns used: `userId`, `topicKey`, `citations` (JSON string), `safetyClassification`, `createdAt`.
- `src/lib/scribe/repo.ts:182` — serializes `citations` as `JSON.stringify(Citation[])`. Query module parses with `JSON.parse` and tolerates `[]`.
- `src/lib/scribe/repo.test.ts` — Prisma-integration test pattern for scribe audit reads/writes; mirror this for the new query module.
- `src/lib/topics/types.ts:19-24` — `CitationSchema` and `Citation` type. Zod guarantees `excerpt` is 1-500 chars if present, so a non-empty `citations` array implies ≥1 valid citation.
- `src/lib/scribe/policy/types.ts:21-24` — `SafetyClassification` enum. The query filters on `'clinical-safe'`.

### Institutional Learnings

- Not applicable — no prior grounding-rate or similar audit-query tooling in the repo.

### External References

- None. Query is a single Prisma filter; no framework research needed.

## Key Technical Decisions

- **D1 — Script, not route.** Matches the startup-scale answer: ship the smallest thing that tells a founder the number. An API/page is a follow-up once the script isn't enough.
- **D2 — Explicit userId list for cohort membership.** No cohort table, no enrolment concept in code. Callers pass the list. The script can also run without a list (all users), printing the ungrouped number.
- **D3 — Classification filter is hardcoded to `clinical-safe`.** The metric is defined against specialist answers the user actually sees as answers. Out-of-scope routes and rejected outputs are (correctly) not chatbot answers; counting them would dilute the measurement.
- **D4 — Empty `citations` array is the "ungrounded" signal.** Any non-empty array counts as grounded. The brainstorm's more nuanced Q1 (turn-level vs answer-level) is deferred; at v1 every row is one answer.
- **D5 — Output is CSV + one summary line.** CSV for pasteability, summary for a human reading the console. No JSON; nobody reads JSON in a terminal.

## Open Questions

### Resolved During Planning

- **Is `ScribeAudit` enough to compute the metric?** Yes — it already persists `citations`, `safetyClassification`, `userId`, `createdAt`. Q4 from the brainstorm is answered "no pipeline, just a query."
- **Does "cite the user's own data" need a provenance check?** No. `Citation.nodeId` always points at a user-owned graph node (the provenance endpoint is owner-scoped by construction). Any citation qualifies.

### Deferred to Implementation

- Exact CLI shape (positional args vs flags, date-string format). Pick the shape that reads cleanest when invoked; this doesn't change the plan.
- Whether to print per-topic breakdown in the summary row. If the query function already supports topic grouping, the script can expose it as a flag. Decide during implementation based on how useful the first run looks.

## Implementation Units

- [ ] **Unit 1: Grounding-rate query module**

**Goal:** Pure function that reads `ScribeAudit` and returns grounding-rate counts for a given window and optional userId list.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None.

**Files:**
- Create: `src/lib/metrics/grounding-rate.ts`
- Test: `src/lib/metrics/grounding-rate.test.ts`

**Approach:**
- Export a `computeGroundingRate({ since, until, userIds?, prisma? })` function returning `{ total: number; grounded: number; rate: number; byTopic?: Record<string, { total: number; grounded: number; rate: number }> }`.
- Query: `safetyClassification = 'clinical-safe'` and `createdAt` between `since` and `until`; scope by `userId IN (...)` when `userIds` is provided.
- For each row, parse `citations` via `JSON.parse` inside a `try/catch`; treat unparseable rows as ungrounded and log a count in the return (so bad data can't silently inflate the rate).
- `rate = grounded / total` when `total > 0`; return `rate: 0` and a flag when `total === 0` so callers can distinguish "zero grounded" from "no data."
- Accept `prisma` as a param with a default to the shared client (mirrors existing repo test patterns — lets tests inject a transaction).

**Patterns to follow:**
- `src/lib/scribe/repo.ts` — Prisma access pattern, error handling, citations JSON round-trip.
- `src/lib/scribe/repo.test.ts` — integration-test pattern using real Prisma against the test DB.

**Test scenarios:**
- Happy path — seed three clinical-safe rows (two with a citation, one with `[]`) within window, one out-of-scope row, one clinical-safe row outside the window; `computeGroundingRate` returns `total=3, grounded=2, rate=0.667` (rounded to caller's display choice).
- Happy path — `userIds` filter narrows the result to the given list; rows from other users are excluded from both numerator and denominator.
- Edge case — empty result set returns `{ total: 0, grounded: 0, rate: 0 }` with the zero-data flag set.
- Edge case — a row with malformed `citations` JSON is counted in `total` but not `grounded`, and the malformed-row count is surfaced on the return.
- Edge case — a row with `citations = '[]'` is counted in `total` but not `grounded`.
- Error path — `since > until` throws a clear validation error before any query runs.
- Integration — the function runs against the real Prisma client (tests use the existing scribe-repo test pattern).

**Verification:**
- Tests pass (including the integration test against the test DB).
- Function works end-to-end when called from a REPL or script against the dev DB with seeded data.

- [ ] **Unit 2: CLI script + README line**

**Goal:** Invocable script that calls Unit 1 and prints CSV + a summary line. One-line entry in the repo README (or `docs/` index) explaining how to run it.

**Requirements:** R5 (stable CSV, paste-ready).

**Dependencies:** Unit 1.

**Files:**
- Create: `scripts/metrics/grounding-rate.ts`
- Modify: `README.md` (add a one-line "How to measure grounding rate" note pointing at the script, or — if the repo keeps dev docs elsewhere — the equivalent place)

**Approach:**
- Parse CLI args for `--since`, `--until`, and an optional `--user-ids` (comma-separated). Default `until` = now; default `since` = 30 days ago.
- Call `computeGroundingRate`. Print a CSV header + one row to stdout (`since,until,user_count,total,grounded,rate,malformed`), followed by a blank line and a human-readable summary line (`Grounding rate: 67% (40/60 clinical-safe turns, window 2026-03-22 → 2026-04-21, 12 users)`).
- Exit 0 on success; exit 1 with a clear error on validation failure or DB error. No retries, no fallbacks — this is a diagnostic tool, not a production process.
- Use `tsx` or whatever the repo's existing ad-hoc script-runner is (check for a `package.json` script convention like `npm run script -- scripts/x.ts`; if none exists, document the invocation shape chosen).

**Patterns to follow:**
- Existing Node scripts in the repo (if any emerge during implementation). If truly nothing, keep it in plain TypeScript invoked via `tsx`.

**Test scenarios:**
- Happy path — invoked with a window that contains seeded data, script prints the expected CSV row + summary and exits 0. Run as a subprocess test (if comfortable) or a hand-run verification step documented in the PR.
- Error path — invalid `--since` (non-date string) exits 1 with a readable message.
- Error path — `--since` later than `--until` exits 1 with a readable message (covered by Unit 1's validation, verified at script boundary).

**Verification:**
- `npx tsx scripts/metrics/grounding-rate.ts --since 2026-03-22 --until 2026-04-21` prints a sensible result against the dev DB (or empty-data path against a fresh DB).
- README/docs entry exists and names the exact command to run.
- When the first real run happens, the number is legible enough to be pasted into a deck without reformatting.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Rate looks surprisingly low and reflects a product problem, not a measurement bug. | That's the point of the tool. Treat the first-run output as signal; investigate via a few `clinical-safe` rows with empty citations before reporting out. |
| Malformed `citations` JSON from older rows skews the rate. | Query module counts malformed rows separately and surfaces the count. Script prints the `malformed` column so the reader can judge. |
| Startup bloat — the script is a tree of flags nobody uses. | Keep to 3 CLI flags max. Anything else is a follow-on. |

## Documentation / Operational Notes

- README (or equivalent) gains a one-line "Measuring grounding rate" pointer to the script.
- No runbook, no monitoring, no alerting. This is a manual script for founder-level reads, not a service.

## Sources & References

- Origin document: [docs/brainstorms/2026-04-21-mvp-validation-requirements.md](../brainstorms/2026-04-21-mvp-validation-requirements.md)
- Related regulatory context (read-only): [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](../brainstorms/2026-04-21-regulatory-posture-requirements.md)
- Schema: `prisma/schema.prisma` — `ScribeAudit` model
- Repo pattern to mirror: `src/lib/scribe/repo.ts`, `src/lib/scribe/repo.test.ts`
- Types: `src/lib/topics/types.ts` (`Citation`), `src/lib/scribe/policy/types.ts` (`SafetyClassification`)
