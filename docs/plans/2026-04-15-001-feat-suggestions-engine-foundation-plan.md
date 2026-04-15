---
title: "feat: Suggestions engine foundation (rules registry + engine + persistence)"
status: active
created: 2026-04-15
type: feat
depth: standard
---

# feat: Suggestions engine foundation

## Overview

Introduce `src/lib/suggestions/` — a small rules engine that reads the canonical [HealthDataPoint](prisma/schema.prisma) stream produced by Unit 1 of the health-normalization plan and emits per-day `Suggestion` rows. This is the prerequisite that Unit 5 of that plan (glucose rule) assumes exists. The goal here is the **framework**, not any specific rule: one trivial reference rule lands alongside so the pipeline is testable end-to-end.

## Problem Frame

The health plan ([docs/plans/2026-04-14-003-feat-health-data-normalization-and-cgm-plan.md](docs/plans/2026-04-14-003-feat-health-data-normalization-and-cgm-plan.md)) repeatedly references `src/lib/suggestions/rules.ts`, `evaluateRules`, and `ensureTodaysSuggestions` — as if they exist. They don't. Unit 5 of that plan (glucose fasting rule with a health-safety-critical title) cannot land until there is a rule registry, an evaluator, and a persistence seam.

This plan builds that foundation. It is deliberately minimal: the rule shape, one reference rule, the evaluator, the engine that upserts today's rows, and a read route. Glucose rules, lab rules, and anything else live in follow-up plans.

## Requirements Trace

- R1. Downstream rules can be declared as data and evaluated against `HealthDataPoint[]`
- R2. Rule outputs persist as `Suggestion` rows keyed on `(userId, date, kind)` with idempotent upsert
- R3. Rule titles are user-facing strings that must not drift silently — verbatim-equality testing is the contract
- R4. A read route exposes today's suggestions so UI can consume them
- R5. The engine is runnable in test mode without hitting real providers (reuses the sync pipeline's mock-first posture)

## Scope Boundaries

- Not in scope: the glucose fasting rules themselves (Unit 5 of the health plan)
- Not in scope: lab-result rules, sleep rules, HRV rules — follow-up plans
- Not in scope: UI — a separate plan wires suggestions into the home screen
- Not in scope: scheduling/cron — the engine runs on-demand via the API route for now

### Deferred to Separate Tasks

- Glucose fasting rules → Unit 5 of the health-normalization plan (depends on this)
- Suggestions UI card on home screen → separate plan once at least two rules exist

## Context & Research

### Relevant Code and Patterns

- [src/lib/health/canonical.ts](src/lib/health/canonical.ts) — the canonical metric registry + `pointFromCanonical` helper. Rules read these canonical names.
- [src/lib/health/sync.ts](src/lib/health/sync.ts) — the mock-first, test-friendly pipeline pattern to mirror.
- [src/lib/protocol-engine.ts](src/lib/protocol-engine.ts) — existing in-process "data → structured output" module. Mirror its pure-function discipline.
- [prisma/schema.prisma](prisma/schema.prisma) — `HealthDataPoint` already has `@@index([userId, category, timestamp])` which the engine's fetch path will use. `ChatMessage` and `CheckIn` show the repo's Prisma-upsert idiom.
- [src/app/api/health/sync/route.ts](src/app/api/health/sync/route.ts) — the API-route pattern to follow (`getOrCreateDemoUser`, `NextResponse.json`).

### Institutional Learnings

- The health plan's Unit 1 established canonical metric names and units as the contract between providers and rules. Drift there breaks rules silently — preserve the invariant by reading from `canonical.ts` rather than hard-coding strings.
- `sync.test.ts` locks the metric-name contract via characterization tests. Rule tests should lock the rule-output contract the same way.

## Key Technical Decisions

- **Rule shape = pure function + metadata.** Each rule is `{ kind, evaluate(points, ctx) → RuleOutcome | null }`. No class hierarchy, no I/O, no hidden state. Same discipline as `protocol-engine.ts`.
- **`RuleOutcome` carries title + tier + triggeringMetricIds.** The ids let the UI (later) show "why" a suggestion fired without re-running logic.
- **Verbatim-title testing is the safety contract.** Tests use `toBe`, not `toContain`. Safety-critical wording (e.g., "consult a clinician") must not be paraphrased by a refactor.
- **Mutual exclusion is a rule-level concern.** `evaluateRules` does not know about exclusions. Each rule is responsible for returning `null` when a stronger rule in the same family should win. Keeps the evaluator dumb and the rule self-contained.
- **`Suggestion` rows are keyed on `(userId, date, kind)`.** Idempotent per day. Re-running the engine overwrites the row, so fixes to rule wording propagate on next run.
- **Engine fetches a time-bounded window of points.** 7 days by default, so time-of-day and fasting-window rules have a recent context without scanning all history.
- **Date is stored as a `DateTime` at UTC midnight** for the user's local day. Timezone inference is deferred — assume UTC for now and add a user-preferences lookup in a follow-up plan. Noted in Open Questions.
- **One reference rule ships with this plan.** `recovery_low` — fires when most recent `recovery_score` is < 40. Chosen because the data is already flowing (Whoop/Oura mock series), the threshold is simple, and the wording is non-safety-critical so it can live as a reference without the glucose rule's gravity.

## Open Questions

### Resolved During Planning

- *Where does mutual exclusion live?* → Inside the rule, not the evaluator. See Key Technical Decisions.
- *How is "today" determined?* → UTC midnight of the current calendar day. Timezone support deferred.
- *Should the engine be a cron job?* → No. On-demand via API route for this plan. Cron is a follow-up.

### Deferred to Implementation

- Exact Prisma field type for `triggeringMetricIds` (SQLite has no native array — likely `String` holding JSON, matching the existing `metadata` pattern on `HealthDataPoint`)
- Whether `ensureTodaysSuggestions` should short-circuit when rows already exist for today, or always re-evaluate. Characterize first, decide during engine work.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
                ┌─────────────────────────┐
                │  HealthDataPoint[]      │   (last 7 days, from Prisma)
                └───────────┬─────────────┘
                            │
                            ▼
               ┌─────────────────────────┐
               │  evaluateRules          │   pure function
               │  (points, { now })      │
               │    for each rule:       │
               │      rule.evaluate(...) │
               │    → RuleOutcome[]      │
               └───────────┬─────────────┘
                            │
                            ▼
               ┌─────────────────────────┐
               │  ensureTodaysSuggestions│   engine
               │  (userId)               │
               │    fetch points         │
               │    evaluateRules        │
               │    upsert per (kind)    │
               │    delete stale today   │
               └───────────┬─────────────┘
                            │
                            ▼
                     Suggestion rows
                            │
                            ▼
                   GET /api/suggestions
```

`RuleOutcome` shape (directional):

```
{ kind, title, tier: 'gentle' | 'moderate' | 'strong', triggeringMetricIds: string[] }
```

## Implementation Units

- [x] **Unit 1: Prisma `Suggestion` model**

**Goal:** Add the persistence seam rules will write to.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts` (export `SuggestionTier`, `Suggestion` type)

**Approach:**
- Add `Suggestion` model: `id`, `userId`, `date` (DateTime, UTC midnight), `kind` (String), `title` (String), `tier` (String), `triggeringMetricIds` (String, JSON), `createdAt`, `updatedAt`.
- Unique constraint on `(userId, date, kind)` — enforces idempotence.
- Index on `(userId, date)` — the read route queries by user + today.
- Add a relation to `User`.

**Patterns to follow:**
- `HealthDataPoint` and `HealthConnection` for model shape and index conventions.
- `metadata` JSON-in-String pattern for `triggeringMetricIds`.

**Test scenarios:**
- Test expectation: none — schema-only change; Units 2–4 exercise it through `db push` + prisma client.

**Verification:**
- `npx prisma db push` succeeds.
- `npx prisma generate` produces a `Suggestion` delegate usable from TS.

- [x] **Unit 2: Rule registry + `evaluateRules` (test-first)**

**Goal:** The pure-function core. Declare rule shape, ship one reference rule, and evaluate.

**Requirements:** R1, R3

**Dependencies:** Unit 1 (for the `SuggestionTier` type)

**Files:**
- Create: `src/lib/suggestions/types.ts`
- Create: `src/lib/suggestions/rules.ts`
- Create: `src/lib/suggestions/rules.test.ts`

**Execution note:** **Test-first.** Rule titles are the user-facing safety contract. Write `toBe` assertions for verbatim titles and threshold-boundary tests before implementing the rule.

**Approach:**
- `types.ts` exports `Rule`, `RuleOutcome`, `SuggestionTier`, `EvaluateContext` (`{ now: Date }`).
- `rules.ts` exports the `rules` array and `evaluateRules(points, ctx)` — a straightforward `rules.map(r => r.evaluate(points, ctx)).filter(Boolean)`.
- Reference rule `recoveryLowRule`: fires when most recent `recovery_score` point value is `< 40`. Title (verbatim): `Prioritise recovery today — consider a lighter session and an earlier bedtime`. Tier: `moderate`.

**Patterns to follow:**
- `src/lib/health/canonical.ts` for reading canonical metric names.
- `src/lib/protocol-engine.ts` for the pure-function + pure-data module shape.

**Test scenarios:**
- Happy path — `recovery_low` fires at `recovery_score = 39` with the verbatim title (`toBe`) and tier `moderate`.
- Edge case — does not fire at `recovery_score = 40` (boundary).
- Edge case — uses the most recent point when multiple exist (timestamp ordering matters).
- Edge case — returns empty array when no `recovery_score` points are present.
- Integration — `evaluateRules` returns one outcome per firing rule, and `triggeringMetricIds` includes the id of the point that triggered it.

**Verification:**
- `npm test -- rules.test` green.
- `npx tsc --noEmit` clean.

- [x] **Unit 3: `ensureTodaysSuggestions` engine + integration test**

**Goal:** Wire the rules into Prisma. Read points, evaluate, upsert today's rows.

**Requirements:** R2, R5

**Dependencies:** Units 1 and 2

**Files:**
- Create: `src/lib/suggestions/engine.ts`
- Create: `src/lib/suggestions/engine.test.ts`

**Approach:**
- `ensureTodaysSuggestions(userId)` computes today's UTC midnight, fetches the last 7 days of `HealthDataPoint` for that user, calls `evaluateRules`, and upserts one `Suggestion` row per outcome keyed on `(userId, date, kind)`.
- Also deletes any existing today-rows whose `kind` is no longer in the current outcome set (so a fix that makes a rule stop firing doesn't leave a stale row).
- Return the resulting `Suggestion[]` for caller convenience.

**Patterns to follow:**
- `src/lib/health/sync.ts` for the userId-keyed prisma upsert idiom.

**Test scenarios:**
- Integration — inserting a `HealthDataPoint` with `metric = 'recovery_score'`, `value = 30`, `timestamp = now` then running `ensureTodaysSuggestions('u1')` creates exactly one `Suggestion` row with the expected kind, title, and tier.
- Integration — running the engine twice is idempotent (one row, not two).
- Integration — when the triggering point is removed and the engine re-runs, the stale row is deleted.
- Edge case — running for a user with zero `HealthDataPoint` rows returns `[]` and persists nothing.

**Verification:**
- `npm test -- engine.test` green against a real prisma client (use the same test-mode prisma setup the rest of the suite uses).
- `npx tsc --noEmit` clean.

- [x] **Unit 4: `GET /api/suggestions` route**

**Goal:** Expose today's suggestions to the UI.

**Requirements:** R4

**Dependencies:** Unit 3

**Files:**
- Create: `src/app/api/suggestions/route.ts`
- Create: `src/app/api/suggestions/route.test.ts`

**Approach:**
- `GET` handler: resolve the demo user, call `ensureTodaysSuggestions(user.id)`, return `{ suggestions }` as JSON.
- Parse `triggeringMetricIds` from JSON-string back to `string[]` in the response shape so the UI doesn't have to.

**Patterns to follow:**
- `src/app/api/health/sync/route.ts` for handler shape, error envelope, and `getOrCreateDemoUser` usage.

**Test scenarios:**
- Happy path — returns `200` with `{ suggestions: [...] }`, each item shaped `{ kind, title, tier, triggeringMetricIds: string[] }`.
- Happy path — `triggeringMetricIds` deserialized from JSON string to array.
- Error path — returns `500` with `{ error }` when the engine throws.

**Verification:**
- `npm test -- api/suggestions/route.test` green.
- `npx tsc --noEmit` clean.
- Full suite green.

## System-Wide Impact

- **Interaction graph:** The engine reads `HealthDataPoint` (produced by `src/lib/health/sync.ts`) and writes `Suggestion`. Nothing else reads `Suggestion` yet — the UI wiring is a separate plan.
- **Error propagation:** Rule-evaluation errors should not mask each other. `evaluateRules` should catch per-rule throws, log, and continue so one broken rule does not silence the rest. Tested as part of Unit 2.
- **State lifecycle risks:** The stale-row cleanup in Unit 3 is the only place the engine deletes data. Scope the delete to today's rows for this user only.
- **API surface parity:** Only one new public route (`GET /api/suggestions`). No changes to existing routes.
- **Unchanged invariants:** `HealthDataPoint` schema, canonical metric names, and the sync pipeline are untouched. This plan only adds new surfaces.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Rule wording drifts under refactor and changes user-facing safety-critical messaging | Verbatim-title `toBe` tests; follow-up glucose plan relies on this pattern |
| `triggeringMetricIds` stored as JSON string becomes hard to query | Accepted — this field is read-only context for the UI; no query path is needed. Documented as a deliberate SQLite constraint |
| Engine runs on every API hit — could be slow at scale | Not a concern at current scale (single demo user). Caching / job queue is a follow-up when multi-user lands |
| Timezone-naive "today" computes wrong day for users west of UTC | Documented in Open Questions; affects correctness but not safety. Fix when user-preferences timezone field exists |

## Documentation / Operational Notes

- Add a short comment at the top of `src/lib/suggestions/rules.ts` explaining the verbatim-title contract and pointing to the test file for the pattern.
- No migration coordination needed — `prisma db push` in dev, same as the rest of the repo.

## Sources & References

- Prerequisite for: [docs/plans/2026-04-14-003-feat-health-data-normalization-and-cgm-plan.md](docs/plans/2026-04-14-003-feat-health-data-normalization-and-cgm-plan.md) Unit 5.
- Canonical metric contract: [src/lib/health/canonical.ts](src/lib/health/canonical.ts)
- Pipeline pattern mirrored: [src/lib/health/sync.ts](src/lib/health/sync.ts)
- Pure-engine pattern mirrored: [src/lib/protocol-engine.ts](src/lib/protocol-engine.ts)
