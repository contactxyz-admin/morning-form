---
title: "feat: Daily suggestions engine — turn health data into protocol adjustments"
type: feat
status: active
date: 2026-04-14
---

# feat: Daily suggestions engine — turn health data into protocol adjustments

## Overview

Today the user's `Protocol` is generated once from the assessment and never reacts to live data. We sync from Whoop / Oura / Fitbit / Google Fit (and have Apple / Garmin behind a Terra mock) and dutifully store `HealthDataPoint` rows that nothing reads. This plan closes that loop: every morning, generate 0–3 evidence-tagged suggestions per user from yesterday's signals, surface them on `/home` and `/protocol`, and let the user accept (creates a `ProtocolAdjustment`), dismiss, or snooze each one.

The engine is built to consume **all signals about a user's state**, not just wearables. That includes clinical lab results (Randox, Medichecks, Thriva, NHS GP printouts) — episodic but high-information data that should trigger their own class of suggestions (low vitamin D → suggest D3, elevated HbA1c → suggest a glucose-stability protocol shift, low ferritin → iron + co-factors).

Lab ingest has two paths in v1, both writing to the same canonical `LabPanel` + `LabMarker` shape:

1. **Upload-and-extract** — user drops a PDF/image of a lab report (Randox, Medichecks, Thriva, NHS printout, etc.). We extract text (PDF text layer first, OCR fallback for images / scanned PDFs) and run an LLM extraction pass that returns markers in our canonical schema. User confirms the extracted markers in the same form they'd use for manual entry — the parse is always reviewable, never silently trusted. **This is the onboarding wedge**: a user already on Randox or Medichecks can move their entire history into Morning Form in one upload.
2. **Manual entry** — same form, empty. Fallback when extraction fails or for users typing in a single marker from a GP letter.

A third path lands in v2 once Morning Form Studios is live: **direct partner ingest** — when Studios sends a sample to a clinical testing partner on a user's behalf, the partner returns results to a webhook and we write `LabPanel` rows directly without any user upload step. The schema is designed for that path now (`source` field, panel-level `notes`) so v2 is additive, not a refactor.

This is the morning-form differentiator made concrete: same engine, same canonical shape, three ingest paths converging on the same suggestions loop.

## Problem Frame

The product's promise is "a system for understanding your state." Right now we *display* state (the home dashboard) but we don't *adapt*. Users who connect a wearable see prettier numbers but no behavioral consequence. The `Protocol` they got on day one is the same on day thirty regardless of whether they slept four hours every night that week.

The fix is the daily-suggestions loop. It's the smallest unit of "the system adapts" that we can ship, and it's the part of the product we cannot validate any other way.

Adjacent learnings from looking at Spike's API design that we're keeping:
- **Normalized daily-statistics shape** — we already have it (`HealthDataPoint` + `aggregateToSummary`). Don't refactor.
- **Webhook-driven freshness vs polling** — defer. Manual sync from `/home` is fine for v1; webhooks per provider come when we have users complaining about staleness.
- **CGM / blood pressure / nutrition categories** — defer. None of our current users have asked for them.
- **One-aggregator strategy (delete six native clients)** — defer. A maintenance refactor with no user-visible value; revisit when one of those six clients actually breaks.

## Requirements Trace

- **R1.** Each morning, every user with at least 7 days of `HealthDataPoint` data gets a fresh `DailySuggestion` set: 0–3 items.
- **R2.** Each suggestion has a title, one-sentence rationale, evidence tier (`strong` / `moderate` / `behavioral`), and links back to the metric(s) that triggered it.
- **R3.** Suggestions appear on `/home` (above the fold) and as a banner on `/protocol`.
- **R4.** User can **accept** (creates a `ProtocolAdjustment` linked to the suggestion), **dismiss** (permanent for that suggestion instance), or **snooze** (re-evaluates tomorrow).
- **R5.** Suggestions are deterministic and explainable — no LLM in the generation path. Rules are pure functions over normalized metrics + per-user baselines.
- **R6.** Generation is idempotent — re-running on the same day with the same data produces no new suggestions.
- **R7.** Users can add a clinical lab panel two ways: (a) upload a PDF or image of the report and confirm the extracted markers, or (b) enter markers manually into a structured form. Each marker carries a value, unit, reference range, collected-at date, and lab/source label.
- **R8.** Lab results feed the suggestions engine the same way wearable metrics do: rules can trigger off "marker X out of range for ≥Y days" or "marker X trending in direction Z across ≥2 panels". Lab-driven suggestions carry their own evidence tier and a citation back to the panel.
- **R9.** Upload-and-extract is robust to multi-vendor formats. Randox, Medichecks, Thriva, and NHS printouts all parse to the same canonical marker keys via an alias map. When extraction fails or confidence is low on a marker, the form shows the raw extracted text alongside the canonical mapping so the user can correct it before saving.
- **R10.** The `LabPanel` schema supports a future `source: "morning_form_studios"` panel written directly by a webhook from a clinical testing partner — no user upload step. v1 doesn't ship the webhook, but the model and ingestion code path treat the upload flow and the partner flow as the same write.

## Scope Boundaries

- Not adding new health providers, not changing OAuth flows, not changing the `HealthConnection` schema.
- Not building webhook ingestion. The existing `POST /api/health/sync` and the manual "Sync now" affordance stay as the freshness mechanism.
- Not building an LLM "explain this suggestion" deep-dive. Title + rationale + linked metrics are enough for v1.
- Not changing how the initial `Protocol` is generated from the assessment.
- Not touching the 11 routes that still call `getOrCreateDemoUser()` — but new code in this plan calls `getCurrentUser()` from day one.

### Deferred to Separate Tasks

- **Suggestion telemetry dashboard** (accept/dismiss rates per rule): wait until we have suggestions in users' hands and need to tune.
- **Webhook ingestion per provider** (Whoop / Oura / Fitbit have native webhooks): only worth it if users complain that "sync now" is too clunky.
- **Push / email "your suggestions are ready"**: needs the notification plumbing we don't have yet.
- **Replacing Terra mock with real Apple Health / Garmin data**: separate plan, only matters once a user with one of those wearables exists and complains.
- **Morning Form Studios → partner webhook ingest** (Studios sends a sample to a clinical partner; partner posts results back to a webhook that writes a `LabPanel` row directly): v2. Requires partner contracts, signed-payload verification, and a per-partner field-mapping config — none of which we should build before the first partner is signed. The v1 schema and `LabPanel.source` field are designed to accept this path additively.
- **Direct user-side lab-vendor API integrations** (sign in with your Randox / Medichecks account, sync history): v3 at earliest. Most consumer lab vendors don't expose user-facing APIs, so the upload path covers the same need today.
- **Re-parsing every old upload when the extraction prompt improves**: v2 nice-to-have. v1 stores the original file blob so we *can* re-parse later, but doesn't run a backfill job.

## Context & Research

### Relevant code and patterns

- `src/lib/health/sync.ts` — `aggregateToSummary` is the existing reduce-over-points pattern; the suggestions engine reads from the same `HealthDataPoint` rows.
- `prisma/schema.prisma` — `HealthDataPoint` already stores `(userId, provider, category, metric, value, unit, timestamp)`. `Protocol` and `ProtocolAdjustment` exist and are exactly the right shape to receive accepted suggestions.
- `src/app/(app)/protocol/page.tsx` — where the protocol view lives; the suggestions banner goes here.
- Home page — needs locating during impl (likely under `src/app/(app)/home/`); suggestions list goes above the fold.
- `src/lib/session.ts` — use `getCurrentUser()` for every new route. Do NOT add to the `getOrCreateDemoUser()` debt.

### Institutional learnings

- Login PR review (PR #3) flagged that 11 routes still scope to the demo user. New routes in this plan must use `getCurrentUser()` so we don't make that debt worse.

## Key Technical Decisions

- **Generation is on-demand, not scheduled.** When a user opens `/home`, if today's suggestions don't exist, generate them in the request. Cache the result in `DailySuggestion` rows. Rationale: we have no scheduler, no background workers. On-demand is simpler and "the user has to actually be using the app for the loop to matter" is a feature not a bug.
- **Rules are TypeScript object literals**, not DB rows. Five rules at v1; if we get to fifteen and they're churning weekly, promote to a DB-backed format. YAGNI until then.
- **Per-user baselines computed on the fly** (7-day median, 30-day median, std dev). No materialized baseline table. SQLite + index on `(userId, category, timestamp)` handles the lookup fine for our scale.
- **Accept = transactional.** Suggestion `status: accepted` and the new `ProtocolAdjustment` insert happen in one Prisma `$transaction`. If either fails, neither is written.
- **Suggestions never auto-apply.** Always pending until the user explicitly accepts. This is a trust property, not a UX preference.
- **Empty state is opinionated.** "Your protocol is on track today" — we never show empty list chrome. If the engine has nothing to say, the UI says nothing.

## Open Questions

### Resolved during planning

- **Q: Should suggestions appear before the user has a baseline?** A: No. Rules that need a baseline are skipped until the user has 7 days of data. Rules with absolute thresholds (e.g. "deep sleep < 1h for 3 consecutive nights") fire from day one.
- **Q: What happens if a rule fires, user dismisses, same trigger fires tomorrow?** A: New `DailySuggestion` row for the new day. Dismissal is per-instance, not per-rule.
- **Q: Where does generation get called from?** A: A small server-side helper `ensureTodaysSuggestions(userId)` invoked from the `/home` and `/api/suggestions` GET handlers. Idempotent via `(userId, date, kind)` dedupe.

### Deferred to implementation

- Whether to store the triggering metric values in the `DailySuggestion` row (for explainability) or just the metric IDs (smaller row, requires a join). Decide when wiring the card UI.
- Exact rationale copy for each rule. Draft during impl, iterate from there.
- Snooze-until calculation in user's timezone — defer until we see whether `UserPreferences.timezone` is reliably populated.

## Implementation Units

- [x] **Unit 1: `DailySuggestion` schema + suggestions API**

**Goal:** Persistence and CRUD for suggestions. Lays the foundation for everything else.

**Requirements:** R2, R4, R6

**Dependencies:** None.

**Files:**
- Modify: `prisma/schema.prisma` — add `DailySuggestion` model with: `id`, `userId`, `date` (YYYY-MM-DD string for cheap dedupe), `kind` (string), `title`, `rationale`, `evidenceTier`, `triggeringMetricIds` (JSON string of `HealthDataPoint` ids), `status` (`pending` / `accepted` / `dismissed` / `snoozed`), `snoozeUntil?`, `acceptedAdjustmentId?`, `createdAt`, `updatedAt`. Indexes on `(userId, date)` and `(userId, status)`. Unique on `(userId, date, kind)` for idempotent generation.
- Create: prisma migration via `npx prisma migrate dev --name add_daily_suggestion`
- Create: `src/app/api/suggestions/route.ts` (GET today's pending, PATCH `{ id, action: 'accept' | 'dismiss' | 'snooze' }`)
- Test: `src/app/api/suggestions/route.test.ts`

**Approach:**
- GET filters to `status = 'pending'` and `date = today` (or `status = 'snoozed' AND snoozeUntil <= today`).
- PATCH `accept` runs a `$transaction`: create `ProtocolAdjustment` with description = title and rationale = rationale, then update `DailySuggestion` with `status: 'accepted'` and `acceptedAdjustmentId`.
- PATCH `dismiss` sets `status: 'dismissed'`. Permanent for this instance.
- PATCH `snooze` sets `status: 'snoozed'` and `snoozeUntil = tomorrow` (date-only, in UTC for now).
- All routes use `getCurrentUser()`.

**Patterns to follow:**
- `src/app/api/auth/login/route.ts` for zod body parsing and route-handler shape.
- Existing `Protocol` / `ProtocolAdjustment` Prisma usage in the protocol API for the transactional write pattern.

**Test scenarios:**
- Happy path: GET returns today's pending suggestions in createdAt-desc order.
- Happy path: PATCH `accept` creates the linked `ProtocolAdjustment` and links it back; both writes succeed atomically.
- Happy path: PATCH `dismiss` flips status, no `ProtocolAdjustment` created.
- Happy path: PATCH `snooze` sets `snoozeUntil` to tomorrow.
- Edge case: PATCH on already-accepted suggestion returns 409.
- Edge case: GET when user has no suggestions returns `{ suggestions: [] }`, not 404.
- Edge case: snoozed suggestions whose `snoozeUntil` is today appear in GET; those still in the future do not.
- Error path: PATCH with unknown action returns 400.
- Integration: accept transaction failure (simulated) leaves both `DailySuggestion.status` and `ProtocolAdjustment` unchanged.

**Verification:**
- All endpoint tests pass; manual smoke: insert a fixture suggestion, accept via the API, see it as a `ProtocolAdjustment` in the DB.

---

- [ ] **Unit 2: Baselines + suggestions engine + initial rule set**

**Goal:** Generate `DailySuggestion` rows from a user's `HealthDataPoint` history and current `Protocol`.

**Requirements:** R1, R5, R6

**Dependencies:** Unit 1.

**Files:**
- Create: `src/lib/suggestions/engine.ts` — `ensureTodaysSuggestions(userId, date) -> DailySuggestion[]`
- Create: `src/lib/suggestions/baselines.ts` — rolling baseline math (7-day median, 30-day median, std dev) over `HealthDataPoint` rows
- Create: `src/lib/suggestions/rules.ts` — initial rule set as TypeScript object literals
- Test: `src/lib/suggestions/engine.test.ts`
- Test: `src/lib/suggestions/rules.test.ts`
- Test: `src/lib/suggestions/baselines.test.ts`

**Approach:**
- Each rule is `(metrics, baselines, protocol) -> { kind, title, rationale, evidenceTier, triggeringMetricIds } | null`.
- Initial rules (concrete, evidence-tagged):
  - **HRV ↓ ≥15% from 7-day median** → "Take it easier today" + suggest glycine 2g PM. `strong`.
  - **Resting HR ↑ ≥10% from 7-day median** → "Hydrate, defer caffeine until 10am". `moderate`.
  - **Deep sleep < 1h for 3 consecutive nights** → "Consider magnesium glycinate 400mg PM". `strong`.
  - **Steps < 3,000 for 2 consecutive days** → "20-minute walk before noon". `behavioral`.
  - **Sleep duration < 6h last night** → "Skip morning stimulants today". `behavioral`.
  - Lab-driven rules ship in Unit 3 once the `LabResult` model exists.
- Engine flow: read last 30 days of `HealthDataPoint`, compute baselines, run each rule, dedupe against existing rows for `(userId, date, kind)`, insert new ones.
- If baseline is `null` (insufficient data), rules requiring it are silently skipped.
- Engine is idempotent: re-running same day inserts nothing new.

**Execution note:** Test-first for the rules. The thresholds and rationale text are the user-facing contract; spec them in tests before implementing the math.

**Patterns to follow:**
- `src/lib/health/sync.ts:aggregateToSummary` for the reduce-over-points shape.

**Test scenarios:**
- Happy path: HRV 60 today, baseline 75 (20% drop) → HRV-deload suggestion is generated with the right title, rationale, evidence tier, and triggering metric IDs.
- Happy path: HRV 70 today, baseline 75 (6% drop) → no suggestion (under threshold).
- Happy path: deep sleep 0.8h / 0.5h / 0.7h over three consecutive nights → magnesium suggestion fires; only 2 nights → does not fire.
- Edge case: user has fewer than 7 days of data → baseline is `null`, baseline-dependent rules are skipped, absolute-threshold rules still fire.
- Edge case: re-run with same data on same day produces 0 new suggestions (idempotency via `(userId, date, kind)` unique index).
- Edge case: rule fires but user already dismissed that kind today → not regenerated same-day (engine queries for `dismissed` rows too when checking dedupe).
- Edge case: rule fires for a behavior the user already has in their `Protocol` (e.g. magnesium PM already prescribed) → suggestion is suppressed; no point telling them to add what they already take.
- Error path: a rule throws → engine logs and continues with the other rules; one bad rule never blocks the others.
- Integration: write fixture `HealthDataPoint` rows with HRV trending down, call `ensureTodaysSuggestions`, query DB → expected suggestions exist.

**Verification:**
- Table-driven rule tests pass. End-to-end fixture: seeded user with 8 days of declining HRV → engine produces the expected suggestion exactly once even when called twice.

---

- [ ] **Unit 3: Lab results — schema, ingest (upload + manual), lab-driven rules**

**Goal:** Let a user move a clinical panel into Morning Form in two ways — drop in a PDF/image of the report and confirm the extracted markers, or type markers into a structured form. Both paths converge on the same canonical schema. The schema is also designed for v2 partner-webhook ingest from Morning Form Studios.

**Requirements:** R7, R8, R9, R10

**Dependencies:** Unit 1 (`DailySuggestion` exists), Unit 2 (engine runs).

**Files:**
- Modify: `prisma/schema.prisma` — add two models:
  - `LabPanel` — `id`, `userId`, `source` (free-text label, e.g. `"Randox Everyman"`, `"NHS GP"`, `"morning_form_studios"`), `collectedAt` (date), `ingestMethod` (enum: `upload_extracted` / `manual` / `partner_webhook`), `originalFileKey?` (storage path of uploaded PDF/image — kept so we can re-parse later), `extractionConfidence?` (Float 0–1, only set for `upload_extracted`), `notes?`, `createdAt`, `updatedAt`. Index on `(userId, collectedAt)`.
  - `LabMarker` — `id`, `panelId` (FK to `LabPanel`), `key` (canonical short name, e.g. `vitamin_d`, `hba1c`, `ferritin`, `crp`, `tsh`), `displayName` (free-text as printed on the report), `value` (Float), `unit` (e.g. `nmol/L`, `mmol/mol`, `µg/L`), `referenceLow?`, `referenceHigh?`, `flag` (`low` / `normal` / `high` / `unknown` — derived from reference range at insert time), `extractionConfidence?` (Float 0–1, per-marker confidence when extracted). Index on `(panelId, key)`.
- Create: prisma migration `add_lab_panel_and_marker`.
- Create: `src/lib/lab/canonical-markers.ts` — a curated map of `displayName` aliases → canonical `key` (e.g. "Vit D", "25-OH Vitamin D", "25(OH)D" → `vitamin_d`). Start with ~40 of the markers Randox / Medichecks / Thriva panels include; extend as users paste new ones.
- Create: `src/lib/lab/extract.ts` — extraction pipeline. Input: file buffer + mime type. Steps: (1) extract text — `pdf-parse` for PDFs with a text layer, fall back to `tesseract.js` OCR for images and scanned PDFs; (2) call an LLM (Anthropic via the SDK already in the repo, or stubbed for tests) with a strict JSON-schema prompt that returns `{ source, collectedAt, markers: [{ displayName, value, unit, referenceLow?, referenceHigh?, confidence }] }`; (3) post-process — resolve `displayName → key` via the alias map, normalize units (e.g. "ng/mL" → "ng/mL", but flag known unit-conversion ambiguities like vitamin D in ng/mL vs nmol/L for explicit user confirmation); (4) return a `DraftPanel` shape ready for the confirmation form. Pure function — does not write to DB.
- Create: `src/app/api/lab-panels/extract/route.ts` — POST `multipart/form-data` with the file. Stores the file blob (local fs in dev, S3-compatible in prod via existing `process.env` config — confirm during impl), runs `extract.ts`, returns the `DraftPanel` JSON for the form to render. Does not persist `LabPanel` / `LabMarker` rows yet — that happens on the confirm POST.
- Create: `src/app/api/lab-panels/route.ts` — POST `{ source, collectedAt, ingestMethod, originalFileKey?, extractionConfidence?, markers: [{ displayName, value, unit, referenceLow?, referenceHigh?, extractionConfidence? }] }`. Resolves `displayName` → canonical `key` via the alias map, derives `flag` from range, persists `LabPanel` + `LabMarker` rows in one `$transaction`. Same endpoint accepts both manual and confirmed-extraction submissions — the only difference is `ingestMethod` and the optional `originalFileKey` / confidence fields. GET returns all panels for the current user with their markers.
- Create: `src/app/api/lab-panels/[id]/route.ts` — DELETE removes a panel (cascade markers and the original file blob).
- Create: `src/app/(app)/lab-results/page.tsx` — page listing the user's panels (newest first) with two CTAs: "Upload report (PDF/image)" and "Enter manually".
- Create: `src/app/(app)/lab-results/upload/page.tsx` — upload flow: file picker → POST to `/api/lab-panels/extract` → render the `DraftPanel` in the same `lab-panel-form.tsx` with values pre-filled and low-confidence markers visually flagged for review → user confirms → POST to `/api/lab-panels`.
- Create: `src/components/lab/lab-panel-form.tsx` — the entry form. Source label, collected-at date, dynamic marker rows (add/remove). Each marker row: display name (autocomplete from canonical map), value, unit, optional reference low/high. When a row carries `extractionConfidence < 0.7`, render a "review" pill and show the raw extracted text alongside. Used for both the empty-manual and pre-filled-extracted flows.
- Create: `src/components/lab/lab-panel-card.tsx` — read-only render of a saved panel with markers grouped by category and out-of-range markers highlighted. Shows a small `source` chip and an "extracted from upload" badge when relevant.
- Modify: `src/lib/suggestions/rules.ts` — add lab-driven rules (initial set below).
- Modify: `src/lib/suggestions/engine.ts` — engine now also reads `LabMarker` rows for the user (most recent value per `key`) and passes them to rules alongside wearable metrics.
- Modify: `src/app/(app)/settings/page.tsx` — add a "Lab Results" link in the existing settings list.
- Test: `src/app/api/lab-panels/route.test.ts`
- Test: `src/app/api/lab-panels/extract/route.test.ts` — uses fixture PDFs (a Randox sample, a Medichecks sample, a scanned NHS letter) committed under `src/app/api/lab-panels/extract/__fixtures__/`. Mocks the LLM call; asserts the extraction pipeline normalizes correctly and returns the expected `DraftPanel` shape.
- Test: `src/lib/lab/extract.test.ts` — unit tests for the post-processing layer (alias resolution, unit-ambiguity flagging, confidence threshold logic).
- Test: `src/lib/lab/canonical-markers.test.ts`
- Test: `src/lib/suggestions/lab-rules.test.ts`

**Approach:**
- Two ingest paths in v1, one schema. Upload-and-extract is the onboarding wedge — a Randox or Medichecks customer can move their entire history into Morning Form in one upload. Manual entry is the always-works fallback.
- **Extraction is always reviewable, never silently trusted.** Even on a high-confidence parse, the user lands on the same form they'd use for manual entry, with extracted values pre-filled. They confirm or correct, then submit. Low-confidence markers are visually flagged. This is the contract that lets us ship LLM-based extraction without it becoming a data-quality liability.
- The `displayName → key` alias map is the only place we standardize across vendors. Both the LLM extraction pipeline and the manual form route through it. New aliases get added to the file as they appear in real user data — no DB migration needed for new markers.
- Original file blobs are stored so we can re-parse later when the extraction prompt improves (deferred backfill is in the deferred list, but the storage decision has to happen now to enable it).
- v2 partner-webhook ingest from Morning Form Studios writes to the same endpoint logic with `ingestMethod = 'partner_webhook'` and a verified-signature check. The schema fields (`source`, `ingestMethod`, `originalFileKey`) are designed for that path now, so v2 is additive — no migration.
- `flag` is derived once at insert, not at read time. If the reference range was wrong (vendor variance), the user can edit the panel.
- Suggestions cite the panel: rationale includes "based on your Randox panel from 2026-03-12, your vitamin D was 38 nmol/L (ref 75–200)". The panel id goes into `triggeringMetricIds` alongside any `HealthDataPoint` ids.
- Lab-driven rules are a different shape from wearable rules — they fire on the *most recent panel*, not on a baseline. Rationale: lab panels are episodic; you can't compute a 7-day median from one data point.
- Initial lab-driven rules:
  - **Vitamin D < 75 nmol/L** (UK insufficiency threshold) → "Add Vitamin D3 2000–4000 IU daily with a fat-containing meal". `strong`.
  - **Ferritin < 30 µg/L** (functional iron deficiency, even if Hb normal) → "Consider iron bisglycinate 25mg + Vitamin C 250mg, away from coffee/tea". `strong`. *Suppress for menstruating-female-presumed users only when the rule has direct context; otherwise show with a "discuss with your GP" caveat.*
  - **HbA1c ≥ 39 mmol/mol (5.7%) and < 48 mmol/mol** (pre-diabetic range) → "Glucose-stability protocol: 10g resistant starch pre-meal, deprioritize liquid carbs, walk 10 min after dinner". `strong`.
  - **HbA1c ≥ 48 mmol/mol** → "This is in the diabetic range. Please consult a clinician — morning-form should not be your primary intervention here". `strong`. (Behavioral safety rule, not a supplement push.)
  - **CRP > 3 mg/L** (chronic inflammation) → "Add omega-3 EPA/DHA 2g daily, audit sleep and overtraining patterns this week". `moderate`.
  - **TSH out of range (low or high)** → "Thyroid markers are outside reference. This is a clinician conversation, not a supplement decision". `behavioral`. (Safety rule again — we never freelance on thyroid.)
  - **B12 < 300 ng/L** (low-normal but symptomatic threshold) → "Consider methylcobalamin 1000µg sublingual 3×/week". `moderate`.
- Rules must respect the user's existing `Protocol`: if a suggestion's compound is already prescribed, suppress (same dedupe as Unit 2).

**Execution note:** Test-first for the lab rules. Health-safety wording (the HbA1c-diabetic and TSH rules especially) is the user-facing contract; spec the rationale strings in tests so they don't drift.

**Patterns to follow:**
- The form patterns from `src/app/sign-in/page.tsx` and the existing input components for the entry form.
- `Protocol` and `ProtocolItem` Prisma usage for the parent/child cascade pattern.

**Test scenarios:**
- Happy path (manual): POST a Randox-shaped panel with 8 markers via the manual form — `LabPanel` (`ingestMethod = 'manual'`) and 8 `LabMarker` rows persist; markers with values outside reference ranges have `flag` set correctly.
- Happy path (extraction): POST a fixture Randox PDF to `/api/lab-panels/extract` (LLM mocked) → returns a `DraftPanel` with 8 markers, each resolved to a canonical `key`, with confidence scores. Subsequent POST to `/api/lab-panels` with `ingestMethod = 'upload_extracted'` and the `originalFileKey` persists the panel.
- Happy path (extraction, low confidence): a marker the LLM returned with `confidence: 0.4` is included in the `DraftPanel` but flagged for review; the form renders it with the review pill and shows the raw extracted text.
- Happy path (extraction, scanned PDF): a fixture image-only PDF triggers the OCR fallback; markers still resolve to canonical keys.
- Happy path (cross-vendor): the same marker (`vitamin_d`) extracts correctly from a Randox fixture and a Medichecks fixture, both resolving to the same canonical `key` despite different `displayName` strings.
- Happy path: a marker named "25-OH Vitamin D" resolves to canonical key `vitamin_d` via the alias map.
- Happy path: vitamin D = 38 nmol/L (ref 75–200) → vitamin D rule fires with the right title, rationale citing the panel date and value, evidence tier `strong`.
- Happy path: HbA1c = 51 mmol/mol → diabetic-range safety rule fires with clinician-referral language; the "glucose-stability" rule does NOT also fire (the safety rule wins).
- Happy path: GET returns the user's panels newest-first with markers attached.
- Edge case: marker `displayName` not in the alias map — saved with `key = null`, no rule can match it; surfaces in the panel card but doesn't trigger anything. Logged so we can extend the alias map.
- Edge case: user has two panels for the same marker — engine uses only the most recent value. (Trending rules over multiple panels are deferred until we have users with ≥2 panels.)
- Edge case: marker has no reference range provided → `flag` is `unknown`, rule skips it (rules require a known abnormal flag).
- Edge case: suggestion already exists today for a wearable rule of the same `kind` (e.g. magnesium PM from deep-sleep rule + magnesium PM from low-Mg lab marker) — dedupe via `(userId, date, kind)` unique index. Both rules contributed; only one suggestion shown. Rationale combines the citations. *(Defer rationale-merging to impl; first cut just keeps whichever fired first.)*
- Error path: POST with malformed payload (missing value or unit) returns 400 with field-specific errors.
- Error path: DELETE a panel that doesn't exist or isn't yours returns 404. The associated `originalFileKey` blob is also deleted.
- Error path (extraction): LLM returns malformed JSON → `/api/lab-panels/extract` returns 422 with a "we couldn't parse this — try manual entry" payload. The file blob is still stored so we can debug.
- Error path (extraction): file is >10MB or wrong mime type → 400 before the pipeline runs.
- Integration: persist a panel via the API → call `ensureTodaysSuggestions` → expected lab-driven suggestions appear via `GET /api/suggestions`.
- Integration: accept a vitamin D suggestion → `ProtocolAdjustment` is created with the right compound/dose/rationale → visible in `/protocol`.

**Verification:**
- Manual smoke (manual): type a real Randox panel into the form, save, navigate to `/home`, see the lab-driven suggestions appear with citations referencing the panel date.
- Manual smoke (extraction): upload a real Randox PDF, confirm the extracted markers in the form, save, see the same suggestions appear. Then upload a Medichecks PDF and verify the same canonical markers resolve correctly.

---

- [ ] **Unit 4: UI surfaces — suggestion card + home + protocol banner**

**Goal:** Surface today's suggestions where users will see them and let them act.

**Requirements:** R3, R4

**Dependencies:** Unit 1, Unit 2, Unit 3.

**Files:**
- Create: `src/components/suggestions/suggestion-card.tsx`
- Create: `src/components/suggestions/suggestion-list.tsx`
- Modify: home page (path TBD during impl — confirm under `src/app/(app)/home/`) — render `<SuggestionList />` above the existing fold.
- Modify: `src/app/(app)/protocol/page.tsx` — render `<SuggestionList variant="banner" />` above the schedule.
- Modify: home or protocol page server component to call `ensureTodaysSuggestions(userId, today)` before rendering, so users always see fresh suggestions on page load.

**Approach:**
- One shared `SuggestionCard` with three actions (accept / dismiss / snooze). Optimistic UI; rolls back on PATCH failure.
- Empty state: "Your protocol is on track today" — single line, no card chrome.
- Card shows: title (heading), rationale (body), evidence tier (small label), three buttons.
- Accept animates the card out and (on protocol page) flows it into the existing adjustments section.

**Patterns to follow:**
- Existing card / button / spacing tokens in `src/components/ui/`. Reference specific files during impl based on what's already there for `Toggle` / `Button` / `Input` / `SectionLabel`.

**Test scenarios:**
- Test expectation: minimal — one component-level render test confirming card renders title, rationale, evidence label, and three buttons. Behavior is covered by Unit 1's API tests.

**Verification:**
- Manual: seed a fixture suggestion, load `/home` → card visible. Click accept → card disappears, `/protocol` shows the new adjustment. Disconnect all providers and clear suggestions → empty-state copy renders.

## System-Wide Impact

- **Interaction graph:** `/home` and `/protocol` both call `ensureTodaysSuggestions(userId, today)` on render. The function is idempotent so double-calls (e.g. user opens both tabs) are safe. PATCH `accept` writes two tables in one transaction.
- **Error propagation:** engine errors degrade silently — log, return `[]`, render the empty state. A broken rule never blocks the page.
- **State lifecycle risks:** `accepted` always pairs with non-null `acceptedAdjustmentId`. The `$transaction` is the only place this invariant is enforced; tests must cover the failure case.
- **API surface parity:** no changes to existing `/api/health/*` endpoints. `/api/suggestions` is new, follows the same auth pattern as `/api/auth/*`.
- **Integration coverage:** the accept-creates-adjustment chain needs at least one integration test with a real DB write — mocked-only tests will pass while the chain breaks.
- **Unchanged invariants:** `Protocol` initial generation, `HealthConnection`, `HealthDataPoint`, `Subscription`, auth, and the entire `/api/health/*` surface are untouched.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Suggestions are wrong, paternalistic, or scary → erodes trust in the whole product | Conservative thresholds, evidence tier on every suggestion, dismiss is always one click, no auto-apply ever. After launch, watch the dismiss/accept ratio per rule and tune. |
| Generation latency on `/home` page load (computing baselines from raw points each time) is noticeable | Indexed query on `(userId, category, timestamp)` keeps the read fast at our scale. If it ever shows up in p95, materialize a daily baseline row. Defer the optimization. |
| User has data but no suggestion ever fires → looks broken | At least one rule (sleep duration < 6h or low steps) has a low enough threshold that it'll trigger for most users at some point in the first week. We'll watch the "users with zero suggestions ever" cohort post-launch. |
| Terra mock returns identical fixture data every day → suggestions never fire for Apple/Garmin users | Acceptable for v1 — we have ~zero of those users today. Replacing the Terra mock is its own plan, triggered by demand. |
| Accept transaction silently half-fails | Covered by the integration test in Unit 1; `$transaction` is the only correct way and tests enforce it. |

## Documentation / Operational Notes

- New env vars: none. This plan adds no third-party dependencies.
- New migration: `add_daily_suggestion`. Run `npx prisma migrate dev` on the dev DB before testing.
- After launch, instrument accept / dismiss / snooze counts per `kind` in whatever telemetry layer we end up adopting. Defer the dashboard.

## Sources & References

- Related plan: [docs/plans/2026-04-14-001-feat-login-skip-assessment-plan.md](docs/plans/2026-04-14-001-feat-login-skip-assessment-plan.md) — establishes the `getCurrentUser()` pattern this plan extends.
- Existing health pipeline: [src/lib/health/sync.ts](src/lib/health/sync.ts), [src/lib/health/providers.ts](src/lib/health/providers.ts).
- Existing protocol pipeline: [src/app/(app)/protocol/page.tsx](src/app/(app)/protocol/page.tsx), `Protocol` and `ProtocolAdjustment` models in [prisma/schema.prisma](prisma/schema.prisma).
