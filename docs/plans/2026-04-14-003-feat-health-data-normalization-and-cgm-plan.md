---
title: "feat: Health-data normalization layer + CGM (glucose) ingest"
status: active
created: 2026-04-14
type: feat
depth: standard
origin: user request to "Research Spike API and plan adoption" — pivoted in clarification to "don't depend on Spike/OpenWearables; copy the best learnings; build native"
---

# feat: Health-data normalization layer + CGM (glucose) ingest

## Problem Frame

Today, [src/lib/health/sync.ts](src/lib/health/sync.ts) hand-rolls a per-provider mapper inside one `switch` statement that flattens every payload into [HealthDataPoint](prisma/schema.prisma) rows. The metric names (`hrv`, `resting_hr`, `deep_sleep`, `duration`, `efficiency`) and units (`hours`, `bpm`, `ms`, `%`) are chosen ad-hoc per case and are the *de facto* contract for the suggestions engine in [src/lib/suggestions/rules.ts](src/lib/suggestions/rules.ts). There is:

- No single source of truth for canonical metric names or units. A new provider can silently emit `restingHr` or `resting_heart_rate` and the engine just won't fire.
- No CGM / glucose pathway — Dexcom and Freestyle Libre are absent from [src/lib/health/providers.ts](src/lib/health/providers.ts), and the suggestions engine has no glucose rule.
- No vendor-neutral abstraction. The user has explicitly steered away from depending on Spike or OpenWearables; instead we want to copy their best learnings (entity hierarchy, normalized vocabulary, redirect-style connection flow) and own the layer ourselves.

This plan formalizes a thin normalization layer on top of our existing per-provider OAuth clients, then wires Dexcom + Freestyle Libre through it, then adds a glucose-driven suggestion rule with health-safety wording.

## Origin & Research Notes

- **Spike API** ([docs.spikeapi.com/llms.txt](https://docs.spikeapi.com/llms.txt)) — the metric vocabulary we're cribbing: `hrv_rmssd` (ms), `heartrate_resting` (bpm), `sleep_duration_deep` (ms), `glucose` (mg/dL), `weight` (g). Connection model: `GET /v3/providers/{provider}/integration/init_url` → redirect → callback. Webhook events: `record_change`, `provider_integration_created`, `provider_integration_deleted`. We adopt the **vocabulary shape** and **redirect pattern** but not the API itself.
- **OpenWearables** ([docs/llms.txt](https://openwearables.io/docs/llms.txt)) — much richer prior art than Spike. Specifically lifted into this plan:
  - **`ProviderCapabilities` declaration** ([how-to-add-new-provider](https://openwearables.io/docs/dev-guides/how-to-add-new-provider.md)) — every provider declares `supports_pull / supports_push / supports_sdk / webhook_notify_only` flags. We currently conflate this in [HEALTH_PROVIDERS](src/lib/health/providers.ts) (Apple Health is just `oauthBaseUrl: ''` with no flow declared). Folded into Unit 1.
  - **Strategy / Factory / Template Method** for provider plug-in. Our six clients ([whoop.ts](src/lib/health/whoop.ts), [oura.ts](src/lib/health/oura.ts), etc.) share method *names* but no enforced TypeScript interface — easy to drift. Folded into Unit 1 as a `HealthProviderStrategy` interface.
  - **Raw payload capture before processing** ([raw-payload-storage](https://openwearables.io/docs/dev-guides/raw-payload-storage.md)) — they store provider JSON pre-normalization for debugging, replay against updated parsers, bug repro, and audit. We have zero of this today; when a LibreLinkUp shape change breaks ingest we'll be blind. Folded in as new **Unit 2**.
  - **Canonical metric vocabulary** ([data-types](https://openwearables.io/docs/architecture/data-types.md)) — they expose `heart_rate_variability_rmssd`, `resting_heart_rate`, `blood_glucose` (mg/dL), `respiratory_rate`, `vo2_max`, `body_mass_index`, etc. We adopt this as the *external/storage* vocabulary and keep the short `hrv`/`resting_hr`/`deep_sleep` names as *rule-engine aliases*. See "Vocabulary strategy" below.
  - **Workout type enum** (80+ canonical types — `running`, `cycling`, `strength_training`, `yoga`, etc.). We don't have first-class workouts yet, but adopting the constant set now is cheap and unblocks Workouts as a follow-up plan.
- **Explicitly *not* lifted** (deferred to a follow-up brainstorm `feat-summary-event-entities`): the `EventRecord + EventRecordDetails` split, `DataPointSeries` granularity, `ExternalDeviceMapping` indirection table, `PersonalRecord` for slow-changing biometrics, webhook receiver abstraction. These are real and worth doing — but each is its own architectural lift, not a checkbox on this plan.
- **Existing canonical names in [src/lib/suggestions/rules.ts](src/lib/suggestions/rules.ts:66-152)** — `hrv`, `resting_hr`, `deep_sleep`, `steps`, `duration`. These stay as **rule-engine aliases** so the existing rules and tests don't churn.

## Vocabulary Strategy

Two concurrent vocabularies, both declared in `src/lib/health/canonical.ts`:

| Layer | Names | Why |
|---|---|---|
| **Storage / external** | `heart_rate_variability_rmssd`, `resting_heart_rate`, `sleep_duration_deep`, `blood_glucose`, etc. | Matches Open Wearables / industry conventions. If we ever do export an API, we don't have to rename. |
| **Rule-engine alias** | `hrv`, `resting_hr`, `deep_sleep`, `duration`, `steps`, `glucose_fasting` | What [rules.ts](src/lib/health/../suggestions/rules.ts) actually reads. Stays terse and untouched. |

`pointFromCanonical(metric, value, opts)` accepts either name and resolves to the storage name + correct unit. `HealthDataPoint.metric` is written using the **alias** (so existing rules keep working unchanged), and the storage-name is recorded in `HealthDataPoint.metadata` JSON for forward-compatibility. A future "rename to canonical names" plan flips the field with one migration; existing rule code reads through the alias map instead of the raw column.

## Scope Boundaries (non-goals)

- **No `EventRecord + EventRecordDetails` split** (Open Wearables has it; we don't need it yet). No `SleepSession`, `Workout`, `DailySummary` tables. Keep the flat `HealthDataPoint`. Tracked as follow-up brainstorm `feat-summary-event-entities`.
- **No `ExternalDeviceMapping` indirection** — we keep `provider` denormalized on each `HealthDataPoint`. Cheap until we hit ≥1M rows or want per-device attribution.
- **No `PersonalRecord` table** for slow-changing biometrics (DOB, sex). We have `User.name` and assessment responses; that's enough for now.
- **No workout-type enum import.** The 80+ canonical workout types from Open Wearables are noted as a future constants file; we don't add `src/lib/health/workout-types.ts` until we have a Workouts entity to use them.
- **Raw payload storage is single-tier** (DB rows in dev/prod, no S3). Open Wearables has a three-tier system; we ship tier 1.5.
- **No Spike / OpenWearables HTTP client.** We borrow vocabulary, not vendor lock-in.
- **No mobile SDK work.** Apple Health pass-through stays as-is at [src/app/api/health/connect/route.ts:36-44](src/app/api/health/connect/route.ts#L36-L44).
- **No webhook receiver.** Sync remains polling-driven via [HealthSyncService.syncProvider](src/lib/health/sync.ts). A push-based ingest is a future plan.
- **No suggestion-UI changes.** That's Unit 4 of [the suggestions engine plan](docs/plans/2026-04-14-002-feat-daily-suggestions-engine-plan.md).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Replace existing OAuth clients? | **No** — keep Whoop/Oura/Fitbit/Google Fit/Terra clients. Refactor only the mapping layer. | User confirmed: copy learnings, don't add a new dependency. Existing clients work; the gap is normalization discipline. |
| Metric vocabulary | **Keep our existing canonical names** (`hrv`, `resting_hr`, `deep_sleep`, `duration`, `steps`) and translate Spike-style payloads into them at the boundary. | Suggestions engine, rules, baselines, and tests already use these names. Renaming churns the rule contract for zero user benefit. |
| Glucose rule in this plan? | **Yes** — fasting-glucose-elevated + post-meal-spike pattern, with a health-safety variant for diabetic-range fasting (≥126 mg/dL). | User chose "Include glucose rule now". Same test-first posture as Unit 3's HbA1c rule — wording is the contract. |
| CGM ingest source | **Direct OAuth: Dexcom + LibreLinkUp.** | User's pick. Mirrors existing Whoop/Oura/Fitbit pattern. Mock mode for dev — see "Implementation-time unknowns". |
| Backfill window | **30 days** on first connect. | Matches `HISTORY_DAYS = 30` in [src/lib/suggestions/engine.ts:6](src/lib/suggestions/engine.ts#L6). Anything beyond is wasted today. |

## Requirements Trace

| Requirement | Lands in |
|---|---|
| One source of truth for canonical metric names + units (storage + alias) | Unit 1: `src/lib/health/canonical.ts` |
| Each provider mapper goes through the canonical layer | Unit 1: refactored `src/lib/health/sync.ts` |
| Every provider client implements a common TS strategy interface | Unit 1: `src/lib/health/strategy.ts` |
| Provider capabilities (`pull / push / sdk`) declared, not branched | Unit 1: extended `src/lib/health/providers.ts` |
| Raw provider payloads captured before normalization, queryable for debugging | Unit 2 |
| Dexcom OAuth → glucose data points | Unit 3 |
| LibreLinkUp → glucose data points | Unit 4 |
| Glucose-driven suggestion rule with safety variant for diabetic range | Unit 5 |
| Settings UI lists Dexcom + Libre | Unit 6 |

## Implementation Units

### Unit 1 — Canonical metric registry + provider strategy interface + normalizer refactor

**Goal.** Three tightly-related changes that land together because they only make sense together:
1. **Canonical metric registry** — pull metric names + units + categories + aliases out of the `switch` in [src/lib/health/sync.ts](src/lib/health/sync.ts) into a single declarative module.
2. **`HealthProviderStrategy` interface** — every provider client implements the same TypeScript shape (auth methods, sync method, declared `capabilities`). Inspired by Open Wearables' `BaseProviderStrategy`.
3. **`ProviderCapabilities` declaration** — each provider declares `supportsPull / supportsPush / supportsSDK / supportsXmlImport / webhookNotifyOnly`. Replaces the implicit "Apple Health is special" branching in [src/app/api/health/connect/route.ts:36-44](src/app/api/health/connect/route.ts#L36-L44).

**Files.**
- `src/lib/health/canonical.ts` (new) — exports `CANONICAL_METRICS`, `CanonicalMetric` (storage names: `heart_rate_variability_rmssd`, `resting_heart_rate`, `sleep_duration_deep`, `blood_glucose`, ...), `RuleAlias` (`hrv`, `resting_hr`, ...), `unitFor(metric)`, `aliasFor(canonical)`, `canonicalFor(alias)`. Each entry: `{ canonical, alias, unit, category, kind: 'timeseries' }`.
- `src/lib/health/strategy.ts` (new) — exports `HealthProviderStrategy` interface and `ProviderCapabilities` type. Existing clients ([whoop.ts](src/lib/health/whoop.ts), [oura.ts](src/lib/health/oura.ts), [fitbit.ts](src/lib/health/fitbit.ts), [google-fit.ts](src/lib/health/google-fit.ts), [terra.ts](src/lib/health/terra.ts)) get a thin `implements HealthProviderStrategy` annotation and a static `capabilities` field. No method-body changes.
- `src/lib/health/normalize.ts` (new) — `pointFromCanonical(metric, value, opts)` accepts canonical or alias name; returns a `HealthDataPoint` partial with the alias as `metric`, correct `unit` + `category`, and `metadata.canonical = <storage name>`.
- `src/lib/health/sync.ts` (modify) — replace inline object literals with `pointFromCanonical(...)`. Behavior identical, modulo `metadata.canonical` now being populated.
- `src/lib/health/providers.ts` (modify) — each `ProviderDefinition` gains a `capabilities: ProviderCapabilities` field. Apple Health gets `{ supportsSDK: true }`, Whoop/Oura/Fitbit/Google Fit get `{ supportsPull: true }`, Terra gets `{ supportsPull: true, supportsPush: true }`.
- `src/lib/health/canonical.test.ts` (new)
- `src/lib/health/normalize.test.ts` (new)
- `src/lib/health/sync.test.ts` (new — characterization)

**Patterns to follow.** Open Wearables' provider-add guide for the strategy interface shape. Existing `HealthDataPoint` shape in [src/types/index.ts](src/types/index.ts). Test idiom from [src/lib/suggestions/rules.test.ts](src/lib/suggestions/rules.test.ts).

**Execution note.** **Characterization-first.** Snapshot the current Whoop + Oura mapper output into `sync.test.ts` *before* editing `sync.ts`, so the refactor proves it didn't drift the rule-engine contract.

**Test scenarios.**
- `canonical.test.ts`: every entry has a non-empty unit + category; no two entries share a canonical name; every alias resolves uniquely; `aliasFor(canonicalFor('hrv'))` returns `'hrv'`.
- `normalize.test.ts`: `pointFromCanonical('hrv', 68, { provider: 'whoop', timestamp })` returns metric `'hrv'`, unit `'ms'`, category `'recovery'`, `metadata.canonical === 'heart_rate_variability_rmssd'`. Same call with `'heart_rate_variability_rmssd'` returns the identical row. Unknown name throws with a useful message including the closest match.
- `sync.test.ts`: feed the existing Whoop + Oura mock payloads; assert canonical points (excluding `metadata`) match the pre-refactor shape exactly. Then assert `metadata.canonical` is now populated for each.
- `strategy.ts`: a structural test that imports each provider client and verifies it satisfies `HealthProviderStrategy` (compile-time check via `const _check: HealthProviderStrategy = new WhoopClient()`).

**Verification.** `npm test` green. `tsc --noEmit` green. The diff to existing client files is metadata-only; no method bodies change.

### Unit 2 — Raw provider payload capture

**Goal.** Capture every raw provider payload before normalization. Makes "LibreLinkUp changed shape and now nothing fires" debuggable in production. Inspired by Open Wearables' `raw-payload-storage` doc; we ship the simplest version (filesystem in dev, DB row in prod), not S3.

**Files.**
- `prisma/schema.prisma` (modify) — add `RawProviderPayload { id, userId, provider, source ('pull'|'push'|'sdk'), receivedAt, sizeBytes, payload (String, JSON), traceId? }` with `@@index([userId, provider, receivedAt])`. Single table, no separate "events" hierarchy.
- `src/lib/health/raw-payload.ts` (new) — `captureRawPayload({ userId, provider, source, payload, traceId? })`. In test mode, no-op. In dev/prod, write to DB and prune rows older than 14 days on a best-effort cron (or just skip pruning for v1 — it's debug data).
- `src/lib/health/sync.ts` (modify) — wrap each `provider.getX()` call so the raw response is captured *before* `pointFromCanonical` runs. If capture throws, log and continue (capture must not break sync).
- `src/lib/health/raw-payload.test.ts` (new)
- `src/app/api/admin/raw-payloads/route.ts` (new — minimal, dev-only) — `GET ?provider=libre&userId=...&limit=10` returns raw payloads. Gated to demo user. Useful for "what did Libre send us at 3am?"

**Patterns to follow.** [src/lib/db.ts](src/lib/db.ts) for Prisma access. Existing demo-user gating from [src/lib/demo-user.ts](src/lib/demo-user.ts).

**Test scenarios.**
- `captureRawPayload` writes a row with `payload` as canonical JSON string and `sizeBytes` matching `Buffer.byteLength`.
- A capture failure (DB unavailable) does not throw to the caller — it logs and returns.
- The admin route returns rows in `receivedAt DESC` order, capped at `limit`.

**Verification.** `npm test`. Manual: trigger a Whoop sync in mock mode → `RawProviderPayload` table contains one row with the recovery-payload JSON.

### Unit 3 — Dexcom OAuth client + sync mapper

**Goal.** Mirror [src/lib/health/whoop.ts](src/lib/health/whoop.ts) for Dexcom. Glucose readings flow into `HealthDataPoint` as `{ category: 'metabolic', metric: 'glucose', unit: 'mg/dL' }`. Add `'metabolic'` to `HealthCategory` in [src/types/index.ts](src/types/index.ts).

**Files.**
- `src/lib/health/dexcom.ts` (new) — class with `getAuthUrl`, `exchangeCode`, `refreshToken`, `getEgvs(startDate, endDate)` (estimated glucose values). Mock mode when `DEXCOM_CLIENT_ID` unset (returns a deterministic 24-hour sample series — same pattern as Whoop's `getRecovery` mock).
- `src/lib/health/providers.ts` (modify) — add `dexcom` definition: `dataCategories: ['metabolic']`, `features: ['glucose', 'glucose_fasting']`.
- `src/lib/health/sync.ts` (modify) — `case 'dexcom':` calls `getEgvs` and writes via `pointFromCanonical`.
- `src/app/api/health/connect/route.ts` (modify) — add `case 'dexcom':` mirroring whoop.
- `src/app/api/health/callback/dexcom/route.ts` (new) — copy [whoop callback](src/app/api/health/callback/whoop) line-for-line, swap client.
- `src/types/index.ts` (modify) — add `'dexcom'` to `HealthProvider`, `'metabolic'` to `HealthCategory`.
- `src/lib/health/dexcom.test.ts` (new)

**Patterns to follow.** [src/lib/health/whoop.ts](src/lib/health/whoop.ts) for OAuth shape. [src/app/api/health/connect/route.ts:46-50](src/app/api/health/connect/route.ts#L46-L50) for connect-route shape.

**Test scenarios.**
- `getAuthUrl` produces a `https://api.dexcom.com/v2/oauth2/login` URL with `client_id`, `redirect_uri`, `scope=offline_access`, `response_type=code`.
- Mock mode (no env): `getEgvs('2026-04-13', '2026-04-14')` returns ≥24 readings, all with finite numeric `value` and ISO `systemTime`.
- Sync mapper: feed one mock `getEgvs` result → produces N canonical points all with `metric: 'glucose'`, `unit: 'mg/dL'`, `category: 'metabolic'`.

**Verification.** `npm test`. Manual: `POST /api/health/connect { provider: 'dexcom' }` returns an `authUrl`; calling the callback in mock mode persists a `HealthConnection` row with `status: 'connected'`.

### Unit 4 — LibreLinkUp client + sync mapper

**Goal.** Same shape as Dexcom but talks to LibreLinkUp. Flag in plan: **LibreLinkUp is unofficial.** Treat its API as best-effort and gate it behind a feature flag.

**Files.**
- `src/lib/health/libre.ts` (new) — class wrapping LibreLinkUp's POST `/llu/auth/login` (email+password, not OAuth) and GET `/llu/connections/{patientId}/graph`. Mock mode by default. Comment at top of file: "LibreLinkUp is an unofficial endpoint that Abbott does not formally support; tolerate breakage."
- `src/lib/health/providers.ts` (modify) — add `libre` definition.
- `src/lib/health/sync.ts` (modify) — `case 'libre':` calls `getGlucoseGraph` and writes glucose points.
- `src/app/api/health/connect/route.ts` (modify) — `case 'libre':` accepts `{ email, password }` in the POST body (no redirect — credential auth). Stores tokens in `HealthConnection.accessToken`. **Do not** persist the user's plaintext password.
- `src/app/(app)/settings/page.tsx` (modify, light) — Libre card surfaces an inline credential prompt instead of a redirect button.
- `src/types/index.ts` (modify) — add `'libre'` to `HealthProvider`.
- `src/lib/health/libre.test.ts` (new)

**Patterns to follow.** Dexcom client from Unit 2 for shape. [src/lib/health/sync.ts](src/lib/health/sync.ts) Whoop case for the mapper.

**Test scenarios.**
- Auth: `login('user@example.com', 'pw')` in mock mode returns `{ accessToken, expiresAt }`.
- Mock graph returns ≥96 readings (15-min cadence × 24h); sync mapper produces canonical glucose points.
- Connect-route rejects `POST /api/health/connect { provider: 'libre' }` without `email` + `password` with HTTP 400.

**Verification.** `npm test`. Manual: connect via settings, see HealthDataPoint rows for `glucose`.

### Unit 5 — Glucose suggestion rule (test-first)

**Goal.** Add two rules to [src/lib/suggestions/rules.ts](src/lib/suggestions/rules.ts) and wire them through [evaluateRules](src/lib/suggestions/rules.ts:161). The diabetic-range string is a user-facing health-safety contract — same test-first posture as the lab rules in Unit 3 of the suggestions plan.

**Files.**
- `src/lib/suggestions/rules.test.ts` (modify — write tests first)
- `src/lib/suggestions/rules.ts` (modify — add `glucoseFastingElevatedRule` and `glucoseFastingDiabeticRule`, append to `rules` array)

**Rules (verbatim contract).**

| Kind | Trigger | Title (verbatim) | Tier |
|---|---|---|---|
| `glucose_fasting_elevated` | Most recent fasting glucose (a `glucose` reading taken 04:00–08:00 local day) is 100–125 mg/dL | `Trim refined carbs at dinner and walk 10 minutes after meals` | moderate |
| `glucose_fasting_diabetic` | Most recent fasting glucose ≥ 126 mg/dL | `Please consult a clinician — morning-form should not be your primary intervention here` | strong (safety) |

Mutual exclusion: if `glucose_fasting_diabetic` fires, suppress `glucose_fasting_elevated`.

**Execution note.** **Test-first.** Write the verbatim title assertions and the threshold-boundary tests in `rules.test.ts` before touching `rules.ts`. The diabetic rule's wording must not drift.

**Test scenarios.**
- Fires `glucose_fasting_elevated` at exactly 100 mg/dL.
- Does not fire at 99 mg/dL.
- Fires `glucose_fasting_diabetic` at exactly 126 mg/dL and suppresses `glucose_fasting_elevated`.
- Does not fire either rule when the only glucose reading is from outside the 04:00–08:00 fasting window (e.g., 14:00).
- Skipped when no `glucose` data exists.
- The diabetic rule's title equals the verbatim string above (`expect(...).toBe(...)`, not `toContain`).
- Triggering metric IDs include the fasting reading's id.

**Verification.** `npm test` green. `ensureTodaysSuggestions` integration test (extend [src/lib/suggestions/engine.test.ts](src/lib/suggestions/engine.test.ts)) inserts a 130 mg/dL glucose reading and asserts a `glucose_fasting_diabetic` row lands.

### Unit 6 — Connection UI for Dexcom + Libre

**Goal.** Surface the new providers in the existing connections list. No design work — copy the existing card pattern.

**Files.**
- `src/app/(app)/settings/page.tsx` (modify) — add Dexcom (redirect) and Libre (credential form) cards.
- `src/components/health/*` (existing card component, name TBD during implementation) — likely reusable; if not, extract to `src/components/health/connection-card.tsx`.

**Patterns to follow.** Whatever the existing settings page does for Whoop/Oura. Keep visual parity.

**Verification.** `npm run dev` on PORT=3847; visit `/settings`; both new cards render and `Connect` triggers the right route.

## Dependencies & Sequencing

```
Unit 1 (canonical + strategy) ─→ Unit 2 (raw payloads) ─┬─→ Unit 3 (Dexcom) ─┐
                                                        └─→ Unit 4 (Libre) ─┴─→ Unit 5 (glucose rule) ─→ Unit 6 (UI)
```

Unit 2 depends on Unit 1 (the strategy interface is where the capture hook attaches). Units 3 and 4 can run in parallel after Unit 2 lands. Unit 5 needs Unit 1 only (uses a manually inserted glucose row in tests). Unit 6 is the last seam.

## Risks

| Risk | Mitigation |
|---|---|
| Refactor of `sync.ts` silently renames a metric the engine reads | Characterization tests in Unit 1 lock the existing canonical names |
| LibreLinkUp endpoint breaks at any time | Treat as best-effort; document in client; mock mode for dev |
| Dexcom partner approval slow | Mock mode is the default path; production credentials are an env-var swap |
| `fastingWindow` definition is fuzzy in different timezones | Use the user's `UserPreferences.timezone` to compute local 04:00–08:00; if absent, fall back to UTC and document |
| Glucose readings without a meal-context label make "post-meal spike" hard | Out of scope — only fasting-glucose rules in this plan |

## Implementation-time Unknowns

- **Exact Dexcom OAuth scope strings** for v2 — confirm at implementation time against [Dexcom Developer Portal](https://developer.dexcom.com/). Mock mode shouldn't care.
- **LibreLinkUp regional base URLs** (US vs EU vs international) — pick one for v1 (likely `api-eu.libreview.io` based on user location) and gate on env var.
- **Whether `HealthConnection.accessToken` for Libre needs encryption at rest** — current schema stores all tokens plaintext; not changing that here, but call it out in the PR description.

## Verification (whole plan)

- `npm test` green; new tests cover canonical registry, normalizer, characterization of refactored `sync.ts`, Dexcom + Libre clients, and both glucose rules.
- `tsc --noEmit` green.
- Manual smoke on `localhost:3847`: connect Dexcom in mock mode → see `HealthDataPoint` rows with `metric: 'glucose'` → `ensureTodaysSuggestions` produces a `glucose_fasting_*` suggestion when a fasting reading is in range.
- Existing rule tests in [src/lib/suggestions/rules.test.ts](src/lib/suggestions/rules.test.ts) still pass — the canonical refactor is invisible to them.

## Open Questions for the User (non-blocking)

1. Should Libre support live in v1, or defer to a v1.1 once Dexcom is real? (LibreLinkUp's unofficial-endpoint risk is meaningful.)
2. Do we want a 30-day glucose chart on `/you` as part of this plan, or wait until the Summary/Event entities land?
