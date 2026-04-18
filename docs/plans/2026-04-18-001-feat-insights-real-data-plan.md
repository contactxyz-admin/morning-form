---
title: feat: Wire /insights to real data (check-in persistence + weekly review + health history)
type: feat
status: active
created: 2026-04-18
origin: audit backlog item D — /insights still reads mockWeeklyReview, mockCheckInHistory, mockHealthHistory
---

# Wire `/insights` to real data

## Problem

`/insights` currently reads three mock fixtures (`mockWeeklyReview`, `mockCheckInHistory`, `mockHealthHistory`) from `src/lib/mock-data.ts`. Every signed-in user sees the same hardcoded week ("March 20 – 26 · 2026"), the same sleep/focus/adherence bars, and the same HRV chart — regardless of whether they've ever completed a check-in or connected a device.

The backing data surfaces are partially real and partially stubbed:

- **Check-ins**: Prisma `CheckIn` model exists (`prisma/schema.prisma` lines 294–305) but `POST /api/check-in` and `GET /api/check-in` are both stubs with `// In production: save to database` comments. Nothing is persisted, so no history exists to derive weekly review from.
- **Health history**: `HealthDataPoint` is fully persisted; `/api/health/sync` writes to it and is already consumed by `/home`. No aggregation endpoint exists for time-series queries.
- **Weekly review**: No derivation logic or endpoint exists.

## Goal

Every piece of data on `/insights` is either real (from the user's own check-ins and connected devices) or explicitly absent (empty state). No mock fixtures in the rendered page.

## Scope boundaries

- **In scope**: Check-in persistence in `POST /api/check-in` and `GET /api/check-in`; new `GET /api/insights/weekly` for derived weekly review; new `GET /api/insights/health-history` for 7-day HRV; `useInsightsData` hook; wire `/insights` page; remove the three mock exports once unused.
- **Out of scope**:
  - Protocol adjustment recommendations (`protocolStatus: 'adjustment-recommended'`) — deriving this from check-in trends is a separate protocol-engine task.
  - Insights beyond 7 days (30-day or lifetime views) — current UI is 7-day only.
  - Pattern insight generation via LLM — keep the simple heuristic from the existing mock for v1 (or null).
  - Editing or backdating check-ins.
  - `/setup` mock cleanup (audit item F, still parked).

## Implementation units

### Unit 1 — Persist check-ins in `POST /api/check-in`

**Goal**: Replace the stub in `POST /api/check-in` with a real Prisma write. Idempotent per `(userId, date, type)` so a user re-submitting the morning check-in on the same day overwrites rather than duplicates.

**Files**:
- `src/app/api/check-in/route.ts` — replace the `// In production` comment block with a real `prisma.checkIn.upsert`
- `src/app/api/check-in/route.test.ts` — new

**Approach**:
- Validate `type ∈ {'morning','evening'}` and `date` matches `YYYY-MM-DD` at the boundary (not a generic Zod schema — one inline check matches the shape of the existing `/api/assessment` route).
- Upsert via a composite unique on `(userId, date, type)`. Schema currently has indexes on those tuples but no `@@unique`. Add `@@unique([userId, date, type])` in the same PR, generate the migration, re-run `prisma generate`.
- Serialize `responses` via `JSON.stringify` (matches existing `responses String` column and the `/api/assessment` pattern).

**Test scenarios**:
- 401 when no session cookie.
- 400 when `type` is missing or not `'morning'`/`'evening'`.
- 400 when `date` is missing or not `YYYY-MM-DD` shaped.
- 200 + new row on first submit for a given `(user, date, type)`.
- 200 + same `id` on second submit for the same `(user, date, type)` (idempotency).
- Distinct rows for same `(user, date)` but different `type` (morning + evening same day both persist).

**Verification**: `npx vitest run src/app/api/check-in` → passes. Pattern reference: `src/app/api/assessment/route.test.ts`.

---

### Unit 2 — Read check-ins in `GET /api/check-in`

**Goal**: Replace `{ checkIns: [] }` stub with a real range query. Used directly by Unit 3's weekly review aggregator and indirectly by Unit 5's insights page.

**Files**:
- `src/app/api/check-in/route.ts` — flesh out the GET handler
- `src/app/api/check-in/route.test.ts` — extend

**Approach**:
- Query params: `?start=YYYY-MM-DD&end=YYYY-MM-DD` (inclusive both ends). Default to the last 7 days if omitted.
- Reject query params that don't match `YYYY-MM-DD` with 400.
- Return `{ checkIns: Array<{ date, type, responses: MorningCheckIn | EveningCheckIn }> }` — parse `responses` from the stored JSON string before returning.
- Sort by date asc.

**Test scenarios**:
- 401 when no session.
- 400 on malformed `start` or `end`.
- Empty array when user has no check-ins in range.
- Only returns check-ins owned by the current user (insert a second user's row in setup, assert it's filtered).
- Default 7-day window when no params given.

**Verification**: `npx vitest run src/app/api/check-in` → passes.

---

### Unit 3 — `GET /api/insights/weekly`

**Goal**: Derive `WeeklyReview` (matching the existing type at `src/types/index.ts` lines 99–114) from the user's check-ins for a given week.

**Files**:
- `src/app/api/insights/weekly/route.ts` — new
- `src/app/api/insights/weekly/route.test.ts` — new
- `src/lib/insights/weekly-review.ts` — new (pure derivation logic, unit-testable)
- `src/lib/insights/weekly-review.test.ts` — new
- `src/middleware.ts` — add `/api/insights/:path*` to the matcher

**Approach**:
- Query param: `?weekStart=YYYY-MM-DD` (Monday). Default to the current week's Monday if omitted.
- Pure function `deriveWeeklyReview(checkIns, weekStart)` in `src/lib/insights/weekly-review.ts`:
  - `sleepQuality.filled` = count of morning check-ins where `sleepQuality ∈ {'well','great'}`
  - `focusConsistency.filled` = count of evening check-ins where `focusQuality ∈ {'good','locked-in'}`
  - `protocolAdherence.filled` = count of evening check-ins where `protocolAdherence ∈ {'fully','mostly'}`
  - `total` = 7 for all three.
  - `trend`: compare current week's filled count to the prior week's. `improving` if >= +2, `declining` if <= -2, else `stable`. (Document the threshold inline.)
  - `label` strings follow the existing mock copy: `"5 of 7 nights rated 'Well' or better"`, etc.
  - `patternInsight`: null for v1 — keep the field, leave it null. Removes a whole class of LLM dependency from this plan.
  - `protocolStatus`: always `'no-changes'` for v1 — adjustment recommendations are parked.
- The route loads two consecutive weeks of check-ins (current + prior) and passes them to the derivation function.

**Test scenarios** (derivation function):
- Empty check-ins → all filled counts 0, trend `stable`, label `"0 of 7 nights rated 'Well' or better"`.
- 5 morning check-ins with sleep `'well'` or `'great'`, 2 with `'poorly'` → `sleepQuality.filled === 5`.
- `trend` = `improving` when current week fills are 6 and prior week fills are 3.
- `trend` = `declining` when current fills are 2 and prior fills are 5.
- `trend` = `stable` when the delta is ±1.
- Focus and adherence counts only read evening check-ins (morning rows don't contribute).

**Test scenarios** (route):
- 401 when no session.
- 400 when `weekStart` is malformed or not a Monday.
- 200 with zeroed review when user has no check-ins.
- 200 with correct counts for a seeded week of check-ins.

**Verification**: `npx vitest run src/lib/insights src/app/api/insights/weekly` → passes.

---

### Unit 4 — `GET /api/insights/health-history`

**Goal**: 7-day time series for HRV (and sleep duration, recovery score — the fields the UI already renders or could render) from `HealthDataPoint`.

**Files**:
- `src/app/api/insights/health-history/route.ts` — new
- `src/app/api/insights/health-history/route.test.ts` — new
- `src/middleware.ts` — already added in Unit 3

**Approach**:
- Query param: `?days=7` (default 7, clamp 1–30).
- Group `HealthDataPoint` rows by date (UTC day from `timestamp`) for the current user, for the relevant metrics: `hrv`, `recoveryScore`, `sleepDuration`, `restingHR`, `steps`. Use the metric name strings already written by `/api/health/sync`.
- If multiple points exist for a day/metric (multiple providers, intra-day samples), take the mean. This is a product judgment, not a gold standard — call it out in a comment on the aggregator.
- Return `{ history: Array<{ date, hrv, recoveryScore, sleepDuration, restingHR, steps }> }` sorted asc. Missing metrics per day → `null`.

**Test scenarios**:
- 401 when no session.
- 400 when `days` is non-numeric or out of range.
- Empty array when no health data points exist.
- Correct mean across two providers on the same day.
- 7-day default returns exactly 7 entries (padding missing days with null-filled rows, so the UI can render bars with gaps rather than reflowing).

**Verification**: `npx vitest run src/app/api/insights/health-history` → passes. Pattern reference: `/api/health/sync` already touches `HealthDataPoint`.

---

### Unit 5 — `useInsightsData` hook + wire `/insights` page

**Goal**: Single hook that loads weekly review + check-in history + health history in parallel and exposes a discriminated-union state, mirroring `useAssessmentData`. Replace all three mock imports in `src/app/(app)/insights/page.tsx`.

**Files**:
- `src/lib/hooks/use-insights-data.ts` — new
- `src/app/(app)/insights/page.tsx` — rewrite imports + header copy + chart data sources
- `src/lib/mock-data.ts` — delete `mockWeeklyReview`, `mockCheckInHistory`, `mockHealthHistory` (keep `mockHealthSummary` if still used elsewhere; verify with grep)

**Approach**:
- Hook signature:
  ```ts
  type InsightsData = {
    review: WeeklyReview;
    checkInHistory: Array<{ date: string; morning?: MorningCheckIn; evening?: EveningCheckIn }>;
    healthHistory: Array<{ date: string; hrv: number | null; /* ... */ }>;
  };
  type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; data: InsightsData }
    | { kind: 'unauthenticated' }
    | { kind: 'error'; message: string };
  ```
  (No `not-onboarded` — insights is viewable by any authed user; empty-state handles the no-data case.)
- Parallel fetch via `Promise.all` of the three endpoints; one failure transitions to `{ kind: 'error' }`.
- Pattern reference: `src/lib/hooks/use-assessment-data.ts`.

**UI changes**:
- Header date range: read `weekStart` / `weekEnd` from `review` (formatted via `lib/utils.ts` helpers).
- When `kind === 'loading'`: render the existing skeleton (or a simple "Loading…" line — keep it minimal).
- When `kind === 'ready'` and counts are all 0: render the page with zeroed bars and a small "No check-ins yet this week" caption below the metrics section. Don't hide the charts; empty bars communicate the shape.
- Pattern detected card: render only when `review.patternInsight !== null`. With v1's null value this means the card is never shown — acceptable.
- Check-in history chart: pass `data.checkInHistory` through the existing `scoreToHeight` / `scoreToColor` maps. Days without a morning row get a neutral bar.
- HRV chart: pass `data.healthHistory`. Days with `hrv === null` get a ghost bar (height 0 or ~10% + lower opacity) so the 7-day grid stays intact.

**Test scenarios**:
- Because the Vitest config is `node` (no jsdom/RTL per earlier session context), don't write component tests for the page. The hook's contract is exercised by the endpoint tests and the integration happens in-browser.
- If a `/insights` page test file exists, delete it or leave it alone — do not expand coverage here.

**Verification**:
- `npx vitest run` → 473+ passing (no new failures, new endpoint + derivation tests added).
- `tsc --noEmit` → no new errors.
- In-browser smoke: log in as a user with 0 check-ins → see empty bars + "No check-ins yet this week" caption. Log in as a seeded user with 5 morning + 5 evening check-ins → see filled bars and correct counts. Deferred if browser testing isn't feasible this session.

---

## Deferred to implementation

- **`@@unique([userId, date, type])` on CheckIn**: The migration needs to handle any pre-existing duplicates. Expected to be zero (nothing persists currently), but verify on dev DB first. If any rows exist, `SELECT COUNT(*) FROM "CheckIn" GROUP BY "userId", "date", "type" HAVING COUNT(*) > 1` before the migration.
- **Pattern insight copy**: v1 ships with `null`. Whether we populate it later with a canned-heuristic string (e.g. "Your best focus days followed your best sleep nights" when that correlation holds) or hold for an LLM-generated version is a product call out of scope here.
- **Timezone handling for `date`**: Check-ins are stored as `YYYY-MM-DD` strings (no TZ). If the client is in Tokyo and submits at 00:30 local, which `date` do we use? Current `/api/check-in` POST accepts the date from the client, so this question is already resolved by convention — but worth confirming no regression during implementation.

## Risks

- **Migration risk is low**: CheckIn is currently empty in all environments; adding a unique index is safe.
- **Aggregation correctness**: Weekly review math is deterministic and fully unit-testable via the pure `deriveWeeklyReview` function. The risk surface is the threshold choice for `trend` — document it and move on.
- **Empty state UX**: Biggest design judgment — zeroed bars vs. hidden sections. Going with zeroed + caption because the page's identity is "your week in shape" and hiding everything would leave a mostly-blank page.

## Sequencing

1. Unit 1 (POST persistence) — unblocks everything else.
2. Units 2, 3, 4 in parallel once Unit 1 lands. They're independent.
3. Unit 5 (hook + UI) — consumes all three endpoints.

## Verification (whole feature)

- [ ] `npx vitest run` → all tests pass.
- [ ] `tsc --noEmit` → clean.
- [ ] Log in as a new user (no check-ins, no device) → `/insights` renders zeroed bars + empty-state caption without errors.
- [ ] Submit a morning check-in via `/check-in`, reload `/insights` → sleep quality bar reflects the new entry.
- [ ] Grep for `mockWeeklyReview|mockCheckInHistory|mockHealthHistory` → no results in `src/app/`.

## Not changing

- `protocol-engine.ts` — no new rules.
- Suggestions engine — untouched.
- `/home` and `/protocol` — already wired in prior PRs (#65, #66).
- `/setup` — still parked.
