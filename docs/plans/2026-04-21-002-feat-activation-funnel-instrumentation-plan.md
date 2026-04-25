---
title: "feat: Activation funnel instrumentation — signup to first grounded answer"
type: feat
status: active
date: 2026-04-21
origin: docs/brainstorms/2026-04-21-mvp-validation-requirements.md
---

# feat: Activation funnel instrumentation — signup to first grounded answer

## Overview

Instrument the Morning Form activation funnel end-to-end so a founder can answer, at any time, for any cohort: *of N users who signed up, how many reached each subsequent milestone, and how long did it take them?*

The highest-leverage unknown at Morning Form right now is not "does the answer cite the user's own data" (B2, already planned) — it is "do users ever reach the point where the product becomes different from ChatGPT at all." Without a funnel, every downstream metric Jonathan Selby asked for in his 16 April 2026 feedback — willingness to pay (R1), CAC (R2), unit economics (R7) — is uninterpretable. A 20% conversion rate is good or bad depending entirely on what it's 20% of; a 70% grounded-answer rate is meaningless if only 5% of signups reach a specialist answer at all.

This plan ships instrumentation and reporting, **not UX reduction.** The reduction plan comes after a first run, once the real drop-off points are visible. Instrumenting first is the disciplined order: you can't fix friction you haven't measured, and guessing invites the exact kind of unsupported assumption Jonathan criticised in the commercial model.

Every signal is derivable from existing tables (`User`, `AssessmentResponse`, `HealthConnection`, `SourceDocument`, `ChatMessage`, `ScribeAudit`). No schema change. No new events table. No UI. Shared pattern with the grounding-rate plan (`docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md`): query module + CLI + tests.

## Problem Frame

Jonathan Selby's R1 and R6 ask for evidence that the narrow MVP lands with users. The MVP-validation brainstorm sets two gates (B2 grounding rate and B1 paid conversion) but both are downstream of a more fundamental question: **does anyone ever reach the product's differentiated moment?**

Today, Morning Form can tell you, per user, that they signed up, completed some intake, connected a wearable, sent a chat message, or received a scribe audit. What it cannot tell you is the shape of the full funnel — per-stage counts, conversion rates, median time-to-stage, or which stage has the worst drop-off. A founder cannot currently answer "if we had 100 signups last week, how many reached their first grounded answer, and when?" without ad-hoc SQL.

This plan ships a single command that answers that question and its cohort variants, using only tables already in production.

## Requirements Trace

- **R1** (maps to origin V5-V7 activation/funnel) — The funnel is definable as a fixed sequence of stages, each derivable from existing tables.
- **R2** — Report per-stage cumulative user counts for a given cohort (userIds list or a `since`/`until` window of signup dates).
- **R3** — Report per-stage drop-off (absolute count + % of signups + % of previous stage) so the reader can see where the funnel breaks.
- **R4** — Report per-stage time-to-reach, expressed as median and p75 for users who did reach that stage. Zero by fiat for the signup stage.
- **R5** — Output is CSV + a human-readable summary, same pattern as the grounding-rate script (R5 of that plan).
- **R6** — No schema migration. Query-only. Reversible by deletion.
- **R7** (CTPO-imposed) — The funnel definition lives in one typed module so the stages cannot silently drift between the query, the CLI, and any future admin surface.

## Scope Boundaries

- **In scope:** funnel stage definitions, cohort query module, CLI script, tests, one README line.
- **Not in scope:** any UX change to reduce friction. That is a separate plan, scoped by whatever this instrumentation reveals.
- **Not in scope:** a UI/admin page rendering the funnel. Re-run the script until a UI is clearly needed.
- **Not in scope:** segmenting the funnel by topic, by acquisition source, or by cohort tag. Add once there's a real question to segment on. Over-segmenting a 30-user cohort is noise.
- **Not in scope:** alerting on funnel degradation. Single-shot diagnostic tool, not a service.

### Deferred to Separate Tasks

- Reduction of friction at whichever stage the first run reveals as worst — separate plan once data exists. Likely candidates: shortening baseline intake, making the "connect data source" step skippable for a first-taste answer, or surfacing a grounded answer earlier in the onboarding flow.
- A combined `scripts/metrics/*` runner or shared library — defer until there are 3+ metric scripts.
- Funnel dashboard with trend over time — defer until weekly reporting is actually needed.

## Context & Research

### Relevant Code and Patterns

- `prisma/schema.prisma:10` — `User` model (stage 1 signal: `createdAt`).
- `prisma/schema.prisma:255` — `AssessmentResponse` model (stage 2 signal: `completedAt`, one per user).
- `prisma/schema.prisma:343` — `HealthConnection` model (stage 3A signal: first `createdAt` per user).
- `prisma/schema.prisma:98` — `SourceDocument` model (stage 3B signal: first `capturedAt` per user — covers lab PDFs and other imported documents; stage 3 = first of 3A or 3B).
- `prisma/schema.prisma:331` — `ChatMessage` model with `role` field (stage 4 signal: first `createdAt` where `role='user'`).
- `prisma/schema.prisma:477` — `ScribeAudit` model (stage 5 signal: first `createdAt` where `safetyClassification='clinical-safe'` AND `citations != '[]'`).
- `src/lib/scribe/repo.ts` — Prisma access pattern to mirror.
- `src/lib/scribe/repo.test.ts` — integration test pattern.
- `docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md` — the sister metric. Patterns (CLI shape, CSV output, test approach) should match exactly so the two scripts feel like one tool family.

### Institutional Learnings

- None recorded under `docs/solutions/` for activation funnels or cohort reporting. First of its kind in this repo.

### External References

- None required. Standard SQL aggregation over known tables.

## Key Technical Decisions

- **D1 — Derive, don't emit.** No event table, no analytics pipeline, no third-party tracker. Stages are defined as queries against existing tables. Reversible, testable, no privacy surface enlargement. The only cost is that stage definitions must stay in sync with the source tables — mitigated by the shared module (R7).
- **D2 — Six stages, fixed.** Signup, essentials, connected, first chat, first grounded answer, retained-in-week-2. Six is enough to locate the biggest drop-off without over-segmenting a small cohort. More stages become noise at n<50.
- **D3 — "First grounded answer" is the aha moment.** Defined as first `ScribeAudit` row with `safetyClassification='clinical-safe'` and non-empty `citations`. Same predicate B2 uses — consistent with the grounding-rate plan. The alternative (first visible citation in the UI) is harder to nail down from persistence alone and would drift.
- **D4 — Retention = any user activity ≥24h after first grounded answer within 7 days.** Activity = a new `ChatMessage` or a new `HealthDataPoint` ingestion. Both are low-threshold signals of "the user came back." Avoid conflating with session-length or DAU — those are engagement metrics, not retention.
- **D5 — Cohort by signup date, not enrolment flag.** Jonathan's R1 framing ("30-50 early adopters") implies an explicit cohort list. This plan supports both: `--user-ids` (explicit) and `--signup-since/--signup-until` (date-window). A cohort table is not needed.
- **D6 — Time-to-stage uses median + p75, not mean.** Activation times are long-tailed; means are misleading. Report both so a reader can see the spread.
- **D7 — Data-source stage OR-merges HealthConnection and SourceDocument.** From the user's perspective, uploading a lab PDF and connecting Oura are both "I gave Morning Form my data." The funnel doesn't care which.

## Open Questions

### Resolved During Planning

- **Are all funnel signals queryable from existing tables?** Yes (see Context & Research). No schema migration.
- **Do we need an event log to capture future stages?** No, not yet. Every current stage is derivable. If a future stage (e.g., "completed paywall checkout") has no persistent artifact, introduce the event log then.
- **Does "first grounded answer" count if the user deleted the conversation?** Yes — `ScribeAudit` persists independently of chat history. The user reached the moment; the fact that they later deleted it doesn't unreach it.
- **Does stage 2 require the baseline intake to be fully complete or partially?** `AssessmentResponse.completedAt` is populated once per user on completion — use that. Partial-intake signals are not separately persisted and adding them would require a schema change.

### Deferred to Implementation

- Exact time window for stage 6 retention: 7 days is the chosen default, but the script should accept `--retention-window-days` so it can be tuned without a code change. Decide whether 7 is too tight when the first run reports out.
- Whether to report per-topic breakdown of stage 5 (first grounded answer). The underlying query can join `topicKey`; surface as a flag if useful on first run.
- Whether to include a "didn't reach stage N in window" bucket so a 30-day cohort's still-activating users are explicit rather than hidden in the `total - reached` subtraction.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Stage definitions live in one typed registry. The cohort report function takes a cohort (list of userIds + a window) and, for each stage, computes the subset of cohort users who reached it and the delta from signup.

```
Cohort  ──►  [Stage 1: signup      ]  ──► { userId -> firstAt }
         ──►  [Stage 2: essentials  ]  ──► { userId -> firstAt | null }
         ──►  [Stage 3: connected   ]  ──► { userId -> firstAt | null }   (OR-merge of HealthConnection, SourceDocument)
         ──►  [Stage 4: first chat  ]  ──► { userId -> firstAt | null }
         ──►  [Stage 5: grounded ans]  ──► { userId -> firstAt | null }
         ──►  [Stage 6: retained 7d ]  ──► { userId -> firstAt | null }

Report  =  for each stage:
             { count, % of signups, % of previous, median time-from-signup, p75 time-from-signup }
```

Shape of a stage definition:

```
StageDefinition = {
  key: 'signup' | 'essentials' | 'connected' | 'first-chat' | 'grounded-answer' | 'retained-7d',
  label: <human string>,
  resolve: async (userIds, window) => Map<userId, Date>
}
```

## Implementation Units

- [ ] **Unit 1: Stage definitions and resolvers**

**Goal:** Typed, testable set of stage-resolver functions that map a cohort's userIds + a window to `Map<userId, Date>` for each funnel stage.

**Requirements:** R1, R7 (single source of truth for stages).

**Dependencies:** None.

**Files:**
- Create: `src/lib/metrics/activation-funnel.ts`
- Test: `src/lib/metrics/activation-funnel.test.ts`

**Approach:**
- Export a `const ACTIVATION_STAGES: readonly StageDefinition[]` — the ordered registry.
- Each stage's `resolve` is an `async (userIds, window, prisma)` that runs one Prisma query returning rows of `{ userId, firstAt }`.
- Each resolver scopes by userIds (when provided) and by the window's `until` (no signals after `until` should count — prevents "future" data leaking into historical cohorts).
- "Connected" stage queries both `HealthConnection` and `SourceDocument` and merges per-user with the earlier of the two timestamps.
- "Grounded answer" stage query parses `citations` JSON; empty arrays do not qualify. Malformed JSON is treated as not-qualifying (conservative).
- "Retained-7d" stage depends on "grounded answer" completing first. The resolver takes the grounded-answer map as input and queries for activity ≥24h after each user's grounded-answer timestamp and within 7 days (or `retentionWindowDays`). This is the one cross-stage dependency; call it out in the type signature.

**Patterns to follow:**
- `src/lib/scribe/repo.ts` — Prisma access, error handling.
- `src/lib/scribe/repo.test.ts` — integration test against real Prisma.

**Test scenarios:**
- Happy path — seed a user with full funnel: signup → AssessmentResponse → HealthConnection → ChatMessage → ScribeAudit(clinical-safe, with citation) → second ChatMessage 3 days later. Each stage resolver returns a single-entry map with the expected timestamp.
- Happy path — stage 3 "connected" resolves via SourceDocument when no HealthConnection exists (lab PDF upload path).
- Happy path — stage 3 takes the earlier of HealthConnection and SourceDocument when both exist.
- Edge case — a user who signed up but did nothing else: stage 1 has an entry; stages 2-6 return empty maps.
- Edge case — a ScribeAudit row with `citations='[]'` does NOT qualify as stage 5; a row with `citations='[{"nodeId":"...","excerpt":"..."}]'` does.
- Edge case — a ScribeAudit row with malformed `citations` JSON does NOT qualify as stage 5 and does not throw.
- Edge case — a ScribeAudit row with `safetyClassification='out-of-scope-routed'` does NOT qualify as stage 5, even if citations are present.
- Edge case — "retained-7d" requires activity strictly ≥24h after grounded-answer timestamp; activity at +12h does not count.
- Edge case — "retained-7d" requires activity strictly ≤7 days (or `retentionWindowDays`) after grounded-answer timestamp; activity at +8 days does not count under default.
- Edge case — userIds filter narrows every stage's result; a user not in the list appears in no stage's map even if they have the underlying data.
- Integration — resolvers run against real Prisma through the existing test DB pattern.

**Verification:**
- Tests pass.
- Each resolver works end-to-end against the dev DB when called from a REPL with real userIds.

- [ ] **Unit 2: Cohort funnel report**

**Goal:** Aggregate Unit 1's per-stage maps into a single cohort report with counts, drop-off percentages, and time-to-stage distributions.

**Requirements:** R2, R3, R4.

**Dependencies:** Unit 1.

**Files:**
- Create: `src/lib/metrics/activation-funnel-report.ts`
- Test: `src/lib/metrics/activation-funnel-report.test.ts`

**Approach:**
- Export `computeActivationFunnel({ userIds?, signupSince, signupUntil, retentionWindowDays?, prisma? })` that:
  1. Resolves the cohort: if `userIds` given, use it; otherwise query `User` where `createdAt` is within `[signupSince, signupUntil]`.
  2. Invokes each stage resolver in order.
  3. For each stage, computes: `count`, `pctOfSignups`, `pctOfPrevious`, `medianDaysFromSignup`, `p75DaysFromSignup`.
  4. Returns `{ cohort: { size, signupSince, signupUntil, userIds? }, stages: StageReport[] }`.
- Signup stage always has `count = cohort.size`, `pctOfSignups = 100`, `pctOfPrevious = 100`, and median/p75 = 0.
- Time-to-stage uses `Date - signup.createdAt` in days, floating-point. Compute median/p75 using a simple sorted-midpoint — no stats library.
- Users who don't reach a stage are excluded from the time-to-stage calculation for that stage (not coerced to 0 or to the window end).

**Patterns to follow:**
- Same Prisma + test patterns as Unit 1.
- Mirror the output-shape philosophy of `docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md` — structured returns that the CLI formats, not pre-formatted strings.

**Test scenarios:**
- Happy path — seed a 5-user cohort where 5 sign up, 4 complete essentials, 3 connect, 2 chat, 2 get grounded answers, 1 retains. Report returns correct counts and percentages at each stage; `pctOfPrevious` computed correctly (e.g., essentials = 80% of signups, connected = 75% of essentials).
- Happy path — median/p75 computed from an odd-size and even-size set; both correct.
- Edge case — empty cohort (no users match the window): report returns `cohort.size = 0` and each stage has `count = 0`, `pctOfSignups = 0`, `pctOfPrevious = 0`, median/p75 = null.
- Edge case — cohort with all users completing every stage: every stage shows 100% / 100%.
- Edge case — a user who reached stage 5 before stage 3 (e.g., imported historical data out of order): counts remain based on whether the stage was reached at all. Time-to-stage can be negative; report as-is rather than clamping, so the caller can see the anomaly.
- Error path — `signupSince > signupUntil` throws a clear validation error.
- Integration — end-to-end run against Prisma with seeded data matches the unit-test expectations.

**Verification:**
- Tests pass.
- Report output object is stable enough to render to CSV without further transformation.

- [ ] **Unit 3: CLI script + README line**

**Goal:** Invocable CLI that calls Unit 2 and prints CSV + a human summary. One-line README entry.

**Requirements:** R5.

**Dependencies:** Unit 2.

**Files:**
- Create: `scripts/metrics/activation-funnel.ts`
- Modify: `README.md` (add a one-line pointer beside the grounding-rate entry)

**Approach:**
- Parse CLI args: `--signup-since`, `--signup-until`, optional `--user-ids` (comma-separated), optional `--retention-window-days` (default 7). Defaults: `signup-until=now`, `signup-since=30 days ago`.
- Call `computeActivationFunnel`.
- Print CSV header + one row per stage (`stage,label,count,pct_of_signups,pct_of_previous,median_days,p75_days`), then a blank line and a summary block (`Activation funnel | cohort: N users signing up 2026-03-22 → 2026-04-21 | signup: N (100%) | essentials: N (x%) | ...`).
- Exit 0 on success; exit 1 on validation error or DB error.
- Use the same invocation shape as the grounding-rate script (`npx tsx scripts/metrics/...`).

**Patterns to follow:**
- `scripts/metrics/grounding-rate.ts` (sister script; follow its arg parsing, output formatting, and exit-code conventions exactly).

**Test scenarios:**
- Happy path — invoked against seeded data, prints the expected CSV and summary; exits 0.
- Error path — invalid `--signup-since` date string exits 1 with a clear message.
- Error path — `--signup-since` later than `--signup-until` exits 1 with a clear message.
- Edge case — `--user-ids "a,b,c"` narrows the cohort correctly; empty intersection prints an empty-cohort report rather than erroring.

**Verification:**
- `npx tsx scripts/metrics/activation-funnel.ts --signup-since 2026-03-22 --signup-until 2026-04-21` prints a sensible result.
- README entry exists and names the exact command.
- First real run produces a table where at least one drop-off is obvious and actionable — the deliverable of this plan is the measurement, not a particular number.

## System-Wide Impact

- **Interaction graph:** None. Read-only queries on existing tables. No callbacks, no middleware, no UI.
- **Error propagation:** Malformed `ScribeAudit.citations` JSON is counted as not-grounded rather than raising. Other query failures (DB connection, etc.) propagate out of the resolver and abort the script with exit 1.
- **State lifecycle risks:** None. No writes.
- **API surface parity:** None. No public API surface.
- **Integration coverage:** The per-stage resolvers are integration-tested against real Prisma. The cohort-report aggregation is tested with seeded data covering realistic drop-off patterns.
- **Unchanged invariants:** All existing write paths, safety policies, scribe behavior, and user-facing surfaces are untouched.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| First-run data reveals most users never reach stage 5, and the company has to confront a product-quality problem head-on. | That is the explicit goal. This plan ships the thermometer; the next plan ships the treatment. |
| The fixed six-stage funnel misses a real drop-off (e.g., between "connected wearable" and "data actually synced"). | Six stages are enough to locate the biggest cliff. Add stages after the first run reveals what's missing, not before. |
| Stage definitions silently drift from source-table semantics (e.g., a change to how `ScribeAudit` stores citations). | All stage definitions live in one module (R7). Integration tests against real Prisma will fail if the underlying shape changes. |
| Cohort sizes too small for time-to-stage percentiles to be meaningful. | Report `count` alongside every percentile; the reader can judge. Don't hide low-n behind a single number. |
| Over-indexing on the funnel distracts from actual product quality work. | This plan is measurement-only. The follow-up plan is the reduction work; the measurement is not a substitute for it. |

## Documentation / Operational Notes

- README gains a one-line pointer next to the grounding-rate entry: "Measure the activation funnel with `npx tsx scripts/metrics/activation-funnel.ts ...`".
- No runbook, no monitoring, no alerting. Founder-level diagnostic tool.
- First real run should be on the earliest cohort with enough signups to read (target ≥30). Document the run result in a short note alongside the next plan; the measurement becomes the input to the friction-reduction plan.

## Sources & References

- Origin document: [docs/brainstorms/2026-04-21-mvp-validation-requirements.md](../brainstorms/2026-04-21-mvp-validation-requirements.md)
- CTPO prioritisation context (session): the activation funnel is Priority 1 in the CTPO reading of Jonathan Selby's 16 April 2026 feedback — prerequisite for Priorities 3 (paywall), 4 (weekly recap), and for any interpretable answer to R1/R2/R7.
- Sister plan (shared patterns): [docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md](2026-04-21-001-feat-grounding-rate-metric-plan.md)
- Regulatory posture background: [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](../brainstorms/2026-04-21-regulatory-posture-requirements.md)
- Schema: `prisma/schema.prisma` — `User`, `AssessmentResponse`, `HealthConnection`, `SourceDocument`, `ChatMessage`, `ScribeAudit`
- Repo pattern to mirror: `src/lib/scribe/repo.ts`, `src/lib/scribe/repo.test.ts`
