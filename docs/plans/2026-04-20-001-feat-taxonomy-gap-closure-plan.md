---
title: "feat: Close data-point gaps in taxonomy against the moat brief"
type: feat
status: active
date: 2026-04-20
origin: conversational (moat-thesis data-point audit brief, 2026-04-20)
parent: docs/plans/2026-04-19-002-feat-ingestion-taxonomy-coverage-plan.md
---

# Close data-point gaps in taxonomy against the moat brief

## Overview

The [parent plan](docs/plans/2026-04-19-002-feat-ingestion-taxonomy-coverage-plan.md) (shipped in PRs #78 + #79) added the vocabulary the moat brief requires: new node types (`allergy`, `immunisation`, `encounter`, `referral`, `procedure`, `observation`, `intervention_event`, `symptom_episode`), new edges (`INSTANCE_OF`, `OUTCOME_CHANGED`), new `source_document.kind` values, a structured `SourceRef`, and the cross-institution alias table.

This plan closes the residual gaps — specific registry entries and helper cases the parent plan did not enumerate individually but that the brief's data-point list demands. All additions are **additive to existing registries**: no new node/edge types, no enum contract changes, no Prisma schema changes.

## Problem Frame

Running the brief's long list against the shipped taxonomy surfaces five concrete gaps. Each gap is a registry entry or helper case that should already be addressable but isn't because the registry was seeded for the Iron / Sleep / Energy topic triad and common UK panels, not for the full moat surface the brief describes (CGM variability, wearable-native fertility tracking, consumer micronutrient panels, private sex-hormone panels, exposure categories the parent plan glossed).

Without these additions, extraction prompts will either (a) land values as unknown/unregistered canonical keys (legal but degraded — UI falls back to the raw string, unit resolution fails), or (b) be forced to pick an ill-fitting canonical that muddies topic-compile retrieval (e.g. squeezing basal body temperature into `temperature_core`).

## Requirements Trace

- **R1.** Every continuous wearable metric the brief calls out has a `CanonicalMetric` entry in `src/lib/health/canonical.ts` so `HealthDataPoint` rows and `metric_window` nodes can store it without invented names. → G1.
- **R2.** Every non-lab observation the brief mentions has a `VITAL_SIGNS_REGISTRY` entry with display name + unit. → G2.
- **R3.** Every private-panel analyte the brief highlights has a `BIOMARKER_REGISTRY` entry with ≥2 aliases for extraction-time resolution. → G3.
- **R4.** Every lifestyle/exposure category the brief lists has a typed branch in the `lifestyle` discriminated union (no free-form `lifestyleSubtype: 'other' + note`). → G4.
- **R5.** `canonicalKeyFor` has a case for every node type where a deterministic generator is useful for dedup across imports. → G5.

## Scope Boundaries

**In scope:**
- Registry additions to `src/lib/health/canonical.ts`, `src/lib/graph/attributes/vital-signs-registry.ts`, `src/lib/intake/biomarkers.ts`, `src/lib/graph/attributes/lifestyle.ts`.
- Helper-case additions to `src/lib/graph/canonical-keys.ts`.
- Registry-lookup and round-trip unit tests for each new entry.

**Out of scope:**
- New node types, edge types, or `source_document.kind` values. The parent plan was exhaustive on those.
- Extraction-prompt updates so the LLM emits the new canonical keys. Tracked as a deferred follow-up (see the parent plan's `Deferred to Implementation` section).
- Reference-range authoring for new biomarkers where no UK-broadly-agreed range exists. Entries ship without `referenceRange` if consensus is absent — labs supply their own.
- Structured pain-map / body-region on `symptom` attributes. Flagged as a candidate Moat 2 extension but not universally needed for the v1 topic triad; deferred to a future plan if symptom diaries become a primary surface.
- New `lifestyle` subtypes that overlap existing ones (`parenting_load` folds into `stress { primaryDomain: 'family' }`; `toxin_exposure` folds into `exposure_environmental { agent }`).
- Prisma migrations. Nothing in this plan touches persistent schema.
- FHIR mapping. Parent plan U7, unaffected.

## Context & Research

### What shipped (baseline)

- `NODE_TYPES` (18 entries) — complete per parent plan T2/T3/T4/T7/T8. No changes.
- `EDGE_TYPES` (7 entries) — complete per T8. No changes.
- `SOURCE_DOCUMENT_KINDS` (20 entries) — complete per T5. No changes.
- `BIOMARKER_REGISTRY` (61 entries) — covers haematology/iron/thyroid/metabolic/lipid/liver/kidney/inflammation/hormones/vitamins/electrolytes + T6 private-panel additions (apoB, Lp(a), homocysteine, hs-CRP, omega-3 index, active B12, free testosterone, DHEA-S, IGF-1, reverse T3, AMH, FSH, LH, sperm concentration/motility/morphology, microbiome Shannon/Simpson).
- `VITAL_SIGNS_REGISTRY` (11 entries) — BP × 2, pulse, core temp, respiratory rate, SpO₂, weight, height, BMI, waist, body fat %.
- `LIFESTYLE_SUBTYPES` (14 entries) — diet, caffeine, alcohol, nicotine, sauna, cold_exposure, travel, shift_work, stress, exposure_air_quality, exposure_mold, exposure_environmental, exercise_program, other.
- `CANONICAL_METRICS` (17 entries) — HRV, recovery score, readiness score, resp rate, RHR, avg/max HR, sleep total/efficiency/deep/REM, steps, calories, active minutes, strain, body temp delta, blood glucose.
- `canonicalKeyFor(...)` — cases shipped: `encounter`, `allergy`, `immunisation`, `symptom_episode`.

### Gap audit against the brief

| Brief data point | Registry | Status |
|---|---|---|
| Sleep stages (light) | `CANONICAL_METRICS` | Missing — have deep + REM only |
| Sleep latency | `CANONICAL_METRICS` | Missing |
| SpO₂ continuous (wearable stream, distinct from clinic spot reading) | `CANONICAL_METRICS` | Missing (SpO₂ is on vitals, not canonical) |
| Glucose variability (time-in-range, GMI, CV) | `CANONICAL_METRICS` | Missing — have raw `blood_glucose` only |
| Activity intensity zones (moderate / vigorous minutes) | `CANONICAL_METRICS` | Missing |
| VO₂ max | `CANONICAL_METRICS` | Missing |
| Menstrual cycle day / flow | `CANONICAL_METRICS`, `VITAL_SIGNS_REGISTRY` | Missing in both |
| Hydration (ml/day) | `CANONICAL_METRICS` | Missing |
| Basal body temperature | `VITAL_SIGNS_REGISTRY` | Missing (`temperature_core` is clinic context) |
| Lean mass, visceral fat rating, bone density Z-score (DEXA derivatives) | `VITAL_SIGNS_REGISTRY` | Missing |
| Bristol stool scale | `VITAL_SIGNS_REGISTRY` | Missing (Moat 2 "bowel habit detail") |
| Progesterone, estradiol | `BIOMARKER_REGISTRY` | Missing (sex hormone panels) |
| PSA | `BIOMARKER_REGISTRY` | Missing (common male panel) |
| Zinc, selenium, copper | `BIOMARKER_REGISTRY` | Missing (Medichecks micronutrients) |
| Sun exposure | `LIFESTYLE_SUBTYPES` | Missing (brief: "sun exposure") |
| Social isolation | `LIFESTYLE_SUBTYPES` | Missing (brief: "social isolation") |
| Dedup keygen for `referral`, `procedure`, `intervention_event` | `canonicalKeyFor` | Missing cases |

### Relevant code and patterns

- [src/lib/intake/biomarkers.ts](src/lib/intake/biomarkers.ts) — `BIOMARKER_REGISTRY` shape, exact + substring alias resolution, `MIN_SUBSTRING_ALIAS_LENGTH = 4`.
- [src/lib/graph/attributes/vital-signs-registry.ts](src/lib/graph/attributes/vital-signs-registry.ts) — flat `VitalSignEntry[]` with `canonicalKey`, `displayName`, `unit`, `context`, optional `aliases`.
- [src/lib/health/canonical.ts](src/lib/health/canonical.ts) — `CanonicalMetric` with `canonical`, `alias`, `unit`, `category: HealthCategory`. Alias is what lands in `HealthDataPoint.metric`.
- [src/lib/graph/attributes/lifestyle.ts](src/lib/graph/attributes/lifestyle.ts) — Zod discriminated union on `lifestyleSubtype`; each branch is `.strict()` except `other` and the supplement sentinel.
- [src/lib/graph/canonical-keys.ts](src/lib/graph/canonical-keys.ts) — overloaded `canonicalKeyFor` + `slugify` + `assertCanonical` helpers. Pattern: one `case` per node type, canonical-key regex-enforced.

### Institutional learnings

Nothing new applies from `docs/solutions/` — the registries have been through the T6 review cycle (see `src/lib/intake/biomarkers.test.ts` for alias-collision coverage). Continue the same test-first shape.

## Key Technical Decisions

### D1 — `HealthCategory` is not extended here

The parent plan's T4 decision was that `metric_window` + `observation` split cleanly from lab `biomarker`. Some new `CANONICAL_METRICS` (menstrual, hydration, VO₂ max) don't fit the current `HealthCategory` union cleanly. Three handling options:

- Extend `HealthCategory` with `'fertility'`, `'hydration'`, `'fitness'` — forces a ripple across the suggestions engine and `HealthSyncService.aggregateToSummary`.
- Re-use the nearest existing category — `'body'` for menstrual/hydration, `'activity'` for VO₂ max.
- Add a single `'other'` category.

**Decision: re-use nearest existing category.** Hydration and menstrual-day fit `'body'`, VO₂ max fits `'activity'`. Any suggestions-engine tuning that wants finer categorisation can happen later against real telemetry. Keeps this plan strictly additive to the registry file.

### D2 — Basal body temperature is a new vital, not an alias of `temperature_core`

`temperature_core` canonical context is `'vital'` (clinic / on-demand reading). Basal body temperature is a consistently-timed early-morning self measurement used for cycle tracking, and the unit convention (often 0.01 °C granularity) and default context (`'self'`) differ from a clinic temperature. Distinct canonical key → distinct entry. Aliasing would conflate two clinically different readings in downstream retrieval.

### D3 — Bristol stool scale is an `observation`, not a `symptom_episode` attribute

The Bristol scale is a 1–7 categorical observation of stool form at a specific moment. It is not a symptom instance (no onset/resolution) and not a lab analyte. It fits `observation` with a numeric value + unit `'scale'`. Future IBS/gut topic pages retrieve it via `relevantNodeTypes: ['observation']`.

### D4 — `social_isolation` and `sun_exposure` subtypes, not a generic `lifestyle:other`

The parent plan's T7 explicitly moved away from `other` + free-text `note` as the dumping ground (see `other` branch in `lifestyle.ts` — it's `.passthrough()`, but typed subtypes are `.strict()`). Adding these two as first-class subtypes maintains the typed-branch discipline for categories the brief explicitly calls out.

### D5 — `canonicalKeyFor` additions mirror shipped conventions

`referral`, `procedure`, `intervention_event` all follow the date-stamped-slug pattern already documented as a JSDoc comment in `src/lib/graph/types.ts`. The helpers produce:

- `canonicalKeyFor('referral', { referredAt, serviceDisplay })` → `referral_<service_slug>_<yyyy_mm_dd>`
- `canonicalKeyFor('procedure', { performedAt, procedureDisplay })` → `procedure_<proc_slug>_<yyyy_mm_dd>`
- `canonicalKeyFor('intervention_event', { parentKey, occurredAt, eventKind })` → `intervention_event_<parent_slug>_<yyyy_mm_dd>_<kind>`

Matches existing encounter/symptom_episode precedent — date folding uses `datePartsFromString` with the same timezone rules (input-shape-based, not UTC-derived; see [src/lib/graph/canonical-keys.ts](src/lib/graph/canonical-keys.ts) `hasTime` logic from the CE-review fix).

## Open Questions

### Resolved During Planning

- **Which wearable stream metrics are universally tracked vs provider-specific?** Resolved — include metrics that appear in ≥2 of {Whoop, Oura, Fitbit, Apple Health, Dexcom, Libre}. Exclude provider-specific scores (e.g. Whoop's "sleep need") that don't cross-vendor.
- **Is a `'fertility'` `HealthCategory` needed?** Resolved in D1 — no. Re-use `'body'` for cycle / menstrual metrics.
- **Should sun exposure include a UV-index quantity?** Resolved — optional `uvIndex` numeric field on the branch, matching how `exposure_air_quality` carries `aqi`/`pm25`.

### Deferred to Implementation

- **Alias wording for new biomarkers.** Registry entries need 2+ aliases each; final wording comes when the implementer scans 1–2 private-lab PDFs (Medichecks, Thriva) for how each analyte is actually printed. Shape is decided; strings are discovered.
- **Reference ranges.** Include one only when UK consensus is broad and unambiguous (e.g. PSA age-banded ranges are out of scope; zinc serum range is in). Absence of a range is not a blocker.

## Implementation Units

- [ ] **G1 — Wearable canonical metric additions**

**Goal:** Extend `CANONICAL_METRICS` so the brief's continuous-stream vocabulary resolves without invented names.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `src/lib/health/canonical.ts`
- Test: `src/lib/health/canonical.test.ts`

**Approach:**
- Append new entries to `CANONICAL_METRICS`. All additive — no reorderings, no renames.
- New entries (canonical → alias → unit → category):
  - `sleep_duration_light` → `light_sleep` → `hours` → `sleep`
  - `sleep_latency_minutes` → `sleep_latency` → `minutes` → `sleep`
  - `blood_oxygen_saturation` → `spo2_stream` → `%` → `recovery` (stream variant; distinct from the clinic reading on the vitals registry)
  - `glucose_time_in_range` → `glucose_tir` → `%` → `metabolic`
  - `glucose_mean` → `glucose_mean` → `mg/dL` → `metabolic`
  - `glucose_coefficient_of_variation` → `glucose_cv` → `%` → `metabolic`
  - `activity_zone_minutes_moderate` → `zone_mod` → `minutes` → `activity`
  - `activity_zone_minutes_vigorous` → `zone_vig` → `minutes` → `activity`
  - `vo2_max` → `vo2_max` → `mL/kg/min` → `activity`
  - `menstrual_cycle_day` → `cycle_day` → `day` → `body`
  - `hydration_intake_daily` → `hydration` → `mL` → `body`
- D1 decision: re-use existing `HealthCategory` values; do not extend the union.
- D1 rationale captured inline as a JSDoc comment above the new block so the category re-use decision is discoverable.

**Execution note:** Test-first. The existing registry is exhaustively tested via alias/canonical lookups — mirror that shape for every new entry.

**Patterns to follow:**
- Existing registry shape in [src/lib/health/canonical.ts](src/lib/health/canonical.ts)
- Test pattern in [src/lib/health/canonical.test.ts](src/lib/health/canonical.test.ts)

**Test scenarios:**
- Happy path: `findMetric('cycle_day')` returns the `menstrual_cycle_day` entry with unit `'day'` and category `'body'`.
- Happy path: `findMetric('glucose_tir')` returns the `glucose_time_in_range` entry.
- Happy path: `aliasFor('vo2_max')` returns `'vo2_max'` (canonical and alias are deliberately identical here).
- Edge case: no alias collision — every new alias fails `BY_ALIAS.get()` before this change and resolves correctly after.
- Edge case: no canonical collision — every new canonical fails `BY_CANONICAL.get()` before this change and resolves correctly after.
- Edge case: `canonicalFor('spo2_stream')` returns `'blood_oxygen_saturation'` (not clashing with the vital-sign `'spo2'` on the observation side — different namespaces).
- Integration: `pointFromCanonical('glucose_mean', 112)` (see [src/lib/health/normalize.ts](src/lib/health/normalize.ts)) produces a `HealthDataPoint`-shaped row with the correct alias, unit, and category. This verifies the new canonicals flow through the normalisation path the provider clients use.

**Verification:**
- All tests green.
- No pre-existing `canonical.test.ts` assertions regress.
- TypeScript compilation passes repo-wide — `MetricName` and alias/canonical types narrow correctly over the extended tuple.

---

- [ ] **G2 — Vital-signs registry additions**

**Goal:** Extend `VITAL_SIGNS_REGISTRY` with basal body temperature, cycle day, DEXA derivatives, and Bristol stool scale.

**Requirements:** R2

**Dependencies:** None (independent of G1 — same logical domain, different registry)

**Files:**
- Modify: `src/lib/graph/attributes/vital-signs-registry.ts`
- Test: existing test file adjacent to the registry (if absent, add `src/lib/graph/attributes/vital-signs-registry.test.ts`)

**Approach:**
- Append new `VitalSignEntry` rows:
  - `basal_body_temperature` — `'Basal body temperature'` — `°C` — `vital` — aliases `['bbt', 'basal body temp']`
  - `menstrual_cycle_day` — `'Cycle day'` — `day` — `vital` — aliases `['cycle day']`
  - `lean_mass` — `'Lean mass'` — `kg` — `body_composition` — aliases `['lean body mass', 'fat-free mass']`
  - `visceral_fat_rating` — `'Visceral fat rating'` — `rating` — `body_composition` — aliases `['visceral fat']`
  - `bone_density_z_score` — `'Bone density Z-score'` — `score` — `body_composition` — aliases `['bmd z-score', 'dexa z score']`
  - `bristol_stool_scale` — `'Bristol stool scale'` — `scale` — `vital` — aliases `['bristol scale', 'stool type']`
- D2 decision encoded inline: JSDoc comment above `basal_body_temperature` notes "distinct from `temperature_core`; context + granularity differ."
- D3 decision encoded inline: JSDoc comment above `bristol_stool_scale` notes "modelled as observation, not symptom_episode; no onset/resolution."

**Execution note:** Test-first on `resolveVitalSign` for each new entry.

**Patterns to follow:**
- Existing registry in [src/lib/graph/attributes/vital-signs-registry.ts](src/lib/graph/attributes/vital-signs-registry.ts)
- Observation test coverage in [src/lib/graph/observation-metric-window.test.ts](src/lib/graph/observation-metric-window.test.ts)

**Test scenarios:**
- Happy path: `resolveVitalSign('BBT')` returns the `basal_body_temperature` entry (alias, case-insensitive).
- Happy path: `resolveVitalSign('Lean body mass')` returns the `lean_mass` entry.
- Happy path: `resolveVitalSign('Bristol stool scale')` returns the `bristol_stool_scale` entry (exact display name).
- Edge case: `VITAL_SIGNS_CANONICAL_KEYS.has('basal_body_temperature')` is `true`.
- Edge case: `VITAL_SIGNS_CANONICAL_KEYS.size` grew by exactly the number of new entries added.
- Edge case: `resolveVitalSign('temperature')` still resolves to `temperature_core` (no alias stealing) — confirms D2's "distinct entry, not alias" decision.
- Integration: an observation node written with `canonicalKey: 'basal_body_temperature'` and `attributes: { value: 36.4, unit: '°C', measuredAt: '2026-04-20T06:30:00Z', context: 'self' }` round-trips through `validateAttributesForWrite('observation', ...)` without throwing.

**Verification:**
- All tests green.
- `resolveVitalSign` lookups work for all new entries via canonical, display, and alias forms.

---

- [ ] **G3 — Biomarker registry additions**

**Goal:** Close the private-panel coverage gap for sex hormones, PSA, and micronutrients.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/lib/intake/biomarkers.ts`
- Test: `src/lib/intake/biomarkers.test.ts`

**Approach:**
- Append entries (canonicalKey → category → unit):
  - `progesterone` → `hormone` → `nmol/L`
  - `estradiol` → `hormone` → `pmol/L`
  - `psa` → `hormone` → `µg/L` (placed in `hormone` category for now; distinct subcategory deferred)
  - `zinc` → `vitamin_mineral` → `µmol/L`
  - `selenium` → `vitamin_mineral` → `µmol/L`
  - `copper` → `vitamin_mineral` → `µmol/L`
- Alias coverage per entry — minimum two, including common lab-PDF spellings (e.g. `'estradiol'`, `'oestradiol'`, `'e2'`).
- PSA: both `'psa'` and `'prostate specific antigen'`.
- Zinc / selenium / copper: include element symbol aliases (`'zn'`, `'se'`, `'cu'`) but remember `MIN_SUBSTRING_ALIAS_LENGTH = 4` — the 2-char element symbols won't participate in substring matching, only exact matching via `EXACT_ALIAS_BY_LOWER`. That's deliberate and correct (prevents "in" false positives on "copper").
- Reference ranges: include only where UK consensus is unambiguous. Zinc: `{ low: 11, high: 24 }`. Estradiol: omit (varies dramatically by cycle phase and sex). Progesterone: omit (same reason). PSA: omit (age-banded). Selenium, copper: include adult reference ranges per NHS trust norms.

**Execution note:** Test-first on the alias-resolution surface, mirroring existing T6 coverage.

**Patterns to follow:**
- Existing T6 additions in [src/lib/intake/biomarkers.ts](src/lib/intake/biomarkers.ts)
- Alias-collision regression tests in [src/lib/intake/biomarkers.test.ts](src/lib/intake/biomarkers.test.ts)

**Test scenarios:**
- Happy path: `resolveBiomarker('Progesterone')` → returns the `progesterone` entry.
- Happy path: `resolveBiomarker('Oestradiol')` → returns the `estradiol` entry.
- Happy path: `resolveBiomarker('PSA')` → returns the `psa` entry (exact short alias).
- Happy path: `resolveBiomarker('Prostate specific antigen')` → returns the `psa` entry.
- Edge case: `resolveBiomarker('Zn')` → returns the `zinc` entry via exact short alias (not substring).
- Edge case: `resolveBiomarker('in the zone')` → returns `undefined` — the short aliases `'zn'`, `'se'`, `'cu'` do not substring-match because of `MIN_SUBSTRING_ALIAS_LENGTH`.
- Edge case: `resolveBiomarker('E2')` → returns the `estradiol` entry via exact alias.
- Integration: `BIOMARKER_CANONICAL_KEYS` length grew by exactly the number of new entries.
- Integration: no regressions in existing `resolveBiomarker` tests — every pre-existing alias still resolves to the same canonical.

**Verification:**
- All tests green.
- No alias-collision regressions: run the full test file and confirm `ferritin`/`iron`/`transferrin_saturation` still resolve correctly despite new entries.

---

- [ ] **G4 — Lifestyle subtype additions**

**Goal:** Promote sun exposure and social isolation from free-text notes to typed branches.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `src/lib/graph/attributes/lifestyle.ts`
- Test: `src/lib/graph/symptom-episode-lifestyle.test.ts`

**Approach:**
- Add two entries to `LIFESTYLE_SUBTYPES`: `'sun_exposure'`, `'social_isolation'`.
- Add matching `SunExposureBranch` and `SocialIsolationBranch` to the discriminated union:
  - `SunExposureBranch`: literal subtype `'sun_exposure'`, `sessionsPerWeek?`, `avgDurationMinutes?`, `uvIndex?`, `usedSunscreen?: boolean`, plus `...BaseLifestyleFields`. `.strict()`.
  - `SocialIsolationBranch`: literal subtype `'social_isolation'`, `selfRated?: 0-10`, `pattern?: 'rare' | 'occasional' | 'frequent' | 'daily'`, plus `...BaseLifestyleFields`. `.strict()`.
- Append both to the `DiscriminatedTypedBranches` union — ordering only matters relative to `SupplementSentinelBranch` (which stays last because it's a rejection sentinel).
- The supplement redirection and preprocess-lowercase logic from the CE-review fix are untouched — this is additive to the union only.

**Execution note:** Test-first on the new branches and on the round-trip through `validateAttributesForWrite('lifestyle', ...)`.

**Patterns to follow:**
- Existing branches in [src/lib/graph/attributes/lifestyle.ts](src/lib/graph/attributes/lifestyle.ts) (e.g. `SaunaBranch`, `StressBranch`)
- Discriminated-union test style in [src/lib/graph/symptom-episode-lifestyle.test.ts](src/lib/graph/symptom-episode-lifestyle.test.ts)

**Test scenarios:**
- Happy path: `validateAttributesForWrite('lifestyle', 'summer_sun_2026', { lifestyleSubtype: 'sun_exposure', sessionsPerWeek: 4, avgDurationMinutes: 30, uvIndex: 7, usedSunscreen: true })` → no throw.
- Happy path: `validateAttributesForWrite('lifestyle', 'isolation_q1', { lifestyleSubtype: 'social_isolation', selfRated: 7, pattern: 'frequent' })` → no throw.
- Edge case: `sun_exposure` branch with an unknown field (e.g. `bogus: true`) → `NodeAttributesValidationError` (strict branch).
- Edge case: `social_isolation` with `selfRated: 11` → rejected (min/max bound).
- Edge case: case-insensitive routing — `lifestyleSubtype: 'SUN_EXPOSURE'` preprocesses to lowercase and resolves (confirms the existing preprocess still routes the new values).
- Integration: `LIFESTYLE_SUBTYPES.length` grew by exactly 2.
- Integration: No pre-existing test regresses — `diet`, `caffeine`, `stress`, `exposure_environmental` still round-trip.

**Verification:**
- All tests green.
- TypeScript `LifestyleAttributes` narrows to include `{ lifestyleSubtype: 'sun_exposure', ... } | { lifestyleSubtype: 'social_isolation', ... }`.

---

- [ ] **G5 — `canonicalKeyFor` helper extensions**

**Goal:** Add deterministic key generators for `referral`, `procedure`, and `intervention_event` so structured imports (FHIR adapters, future NHS App exports, CSV backfills) produce collision-free keys across re-imports.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `src/lib/graph/canonical-keys.ts`
- Test: `src/lib/graph/canonical-keys.test.ts`

**Approach:**
- Extend the overload set with three new signatures:
  ```
  canonicalKeyFor('referral', { referredAt: string | Date, serviceDisplay: string }): string
  canonicalKeyFor('procedure', { performedAt: string | Date, procedureDisplay: string, encounterRef?: string }): string
  canonicalKeyFor('intervention_event', { parentKey: string, occurredAt: string | Date, eventKind: string }): string
  ```
- Corresponding `case` arms in the switch. Pattern mirrors the existing `encounter` case:
  - Use `datePartsFromString(...)` for consistent date handling, including the input-shape-based `hasTime` check (preserves the CE-review fix).
  - Use `slugify(...)` for the display-string component.
  - Assemble with underscores; run through `assertCanonical(...)` to enforce the regex.
- Canonical-key shapes:
  - `referral`: `referral_<service_slug>_<yyyy_mm_dd>[_<hhmmss>]`
  - `procedure`: `procedure_<proc_slug>_<yyyy_mm_dd>[_<hhmmss>][_<encounter_ref_slug>]`
  - `intervention_event`: `intervention_event_<parent_key>_<yyyy_mm_dd>[_<hhmmss>]_<event_kind>`
- `intervention_event.parentKey` must already match `CANONICAL_KEY_RE` — embed as-is, same contract as `symptom_episode.parentSymptomKey` (`throw` on violation).
- The `eventKind` value is slugified to match the canonical-key grammar (lowercase, underscores).

**Execution note:** Test-first. Existing `canonical-keys.test.ts` shape is the pattern — round-trip + collision + regex assertions.

**Patterns to follow:**
- Existing `encounter` case in [src/lib/graph/canonical-keys.ts](src/lib/graph/canonical-keys.ts) — particularly the `hasTime` input-shape check from the CE-review fix.
- `symptom_episode` parent-key embed pattern for `intervention_event.parentKey`.

**Test scenarios:**
- Happy path: `canonicalKeyFor('referral', { referredAt: '2026-03-04', serviceDisplay: 'Cardiology' })` → `'referral_cardiology_2026_03_04'`.
- Happy path: `canonicalKeyFor('procedure', { performedAt: '2026-02-10T14:30:00Z', procedureDisplay: 'ECG' })` → `'procedure_ecg_2026_02_10_143000'`.
- Happy path: `canonicalKeyFor('intervention_event', { parentKey: 'ferrous_sulfate_200mg', occurredAt: '2026-03-15', eventKind: 'taken_as_prescribed' })` → `'intervention_event_ferrous_sulfate_200mg_2026_03_15_taken_as_prescribed'`.
- Edge case: same referral imported twice with slightly different service display (`'Cardiology'` vs `'cardiology dept'`) collapses via `slugify` stopword handling to the same key.
- Edge case: `intervention_event` with a `parentKey` that doesn't match `CANONICAL_KEY_RE` throws a descriptive error.
- Edge case: `procedure` with a `Date` instance → always folds `hhmmss`; `procedure` with a bare date string (`'2026-02-10'`) does not (mirrors encounter's `hasTime` logic).
- Edge case: all generated keys pass `CANONICAL_KEY_RE` — enforced via `assertCanonical`.

**Verification:**
- All tests green.
- No regressions in existing `canonicalKeyFor` cases (`encounter`, `allergy`, `immunisation`, `symptom_episode`).
- Exhaustive-switch check: TypeScript `never` in the `default` case still fires — adding the three new type strings to the union picks them up without a runtime fallback.

## System-Wide Impact

- **Interaction graph:** No callbacks, middleware, or observers affected. Registry additions are pure data; canonical-key helper is pure function.
- **Error propagation:** No new error classes. Existing `NodeAttributesValidationError` still fires for lifestyle-branch misuse. `canonicalKeyFor` still throws a plain `Error` on parent-key grammar violation (same contract as `symptom_episode`).
- **State lifecycle risks:** None. No persistent state touched. No migration needed.
- **API surface parity:** The new canonical metrics become immediately available to `HealthSyncService.aggregateToSummary` via `findMetric/aliasFor/unitFor`. No explicit per-provider wiring needed — provider clients that emit a matching alias will start flowing through. Providers not emitting the new metrics are unchanged.
- **Integration coverage:** `validateAttributesForWrite` + `ingestExtraction` paths are exercised by the existing test suites; new registry entries ride those paths without new integration tests beyond what each unit adds.
- **Unchanged invariants:** `NODE_TYPES`, `EDGE_TYPES`, `SOURCE_DOCUMENT_KINDS`, `FIXED_SOURCE_SYSTEMS`, `HealthCategory`, `CANONICAL_KEY_RE`, the Prisma schema, and the extraction-prompt contract.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Alias collision with existing biomarker entries (e.g. `'se'` alias for selenium collides with `'se'` somewhere else) | Exact-alias map is checked first, ordered by insertion; run the full `biomarkers.test.ts` + add explicit "no-regression" assertions per G3 test scenarios. |
| `HealthCategory` re-use (D1) produces ambiguous aggregations in `HealthSyncService.aggregateToSummary` (e.g. hydration mL/day averaged against weight kg) | `aggregateToSummary` is keyed on alias, not category — category is metadata-only. No averaging risk. Confirmed by reading [src/lib/health/sync.ts](src/lib/health/sync.ts). |
| Future extraction prompts emit the new `lifestyleSubtype` values with unexpected casing / formatting | The existing `preprocess` step lowercases any `lifestyleSubtype` string before discriminator lookup — new branches inherit that behaviour unchanged. |
| Ambiguity between `vital-signs-registry` `spo2` and `CANONICAL_METRICS` `blood_oxygen_saturation → spo2_stream` | Namespaces are distinct (`observation.canonicalKey` vs `metric_window.attributes.metric`); alias `'spo2_stream'` is chosen deliberately to avoid collision on reads. Documented via a JSDoc comment at the `blood_oxygen_saturation` entry. |
| Extraction prompts still emit old unregistered canonical keys, so the new entries don't populate | Acknowledged — prompt updates are a deferred follow-up (out of scope per Scope Boundaries). This plan closes the vocabulary gap so the prompt work, when it happens, has a registry to target. |

## Deferred to Implementation

- **Final alias strings for G3 biomarkers.** Scan 1–2 real Medichecks / Thriva PDFs during implementation; aliases should reflect the exact strings the lab prints, not guesses. Shape is fixed; strings are discovered.
- **Whether `visceral_fat_rating` carries a unit `'rating'` or numeric 1–30 scale.** Most DEXA reports use a numeric rating; confirm at implementation time by checking two sample reports.
- **Whether `procedure` canonical-key should include the encounter ref.** The signature includes it optionally; decide during implementation whether the default behaviour folds it in when present (like `encounter`'s `encounterRef`) or only when the caller explicitly opts in.

## Implementation-Time Unknowns

- The full list of `eventKind` values that flow through `intervention_event` in practice. Current extractor set is `'started' | 'taken_as_prescribed' | 'missed_dose' | 'dose_changed' | 'stopped' | 'side_effect'`. If that grows, the canonical-key helper's `eventKind` slugify step absorbs new values automatically.

## Sources & References

- **Origin brief:** conversational moat-thesis ingestion audit (captured in this session's feature-description block).
- **Parent plan:** [docs/plans/2026-04-19-002-feat-ingestion-taxonomy-coverage-plan.md](docs/plans/2026-04-19-002-feat-ingestion-taxonomy-coverage-plan.md) (status: complete; this plan closes residual gaps).
- **Shipped taxonomy (context):**
  - [src/lib/graph/types.ts](src/lib/graph/types.ts) — `NODE_TYPES`, `EDGE_TYPES`, `SOURCE_DOCUMENT_KINDS`
  - [src/lib/intake/biomarkers.ts](src/lib/intake/biomarkers.ts) — `BIOMARKER_REGISTRY`
  - [src/lib/graph/attributes/vital-signs-registry.ts](src/lib/graph/attributes/vital-signs-registry.ts)
  - [src/lib/graph/attributes/lifestyle.ts](src/lib/graph/attributes/lifestyle.ts)
  - [src/lib/health/canonical.ts](src/lib/health/canonical.ts)
  - [src/lib/graph/canonical-keys.ts](src/lib/graph/canonical-keys.ts)
- **Recent CE-review fix (context for G5 `hasTime` behaviour):** PR #79 (`fix(graph): clear CE review P2/P3 taxonomy backlog`)
