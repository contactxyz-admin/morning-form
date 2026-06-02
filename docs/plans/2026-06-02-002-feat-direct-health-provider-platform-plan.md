---
title: "feat: Replace Terra aggregation with direct health-provider platform"
type: feat
status: active
date: 2026-06-02
origin: "User decision after Terra pricing review: skip Terra paid plan and pursue direct provider access"
---

# feat: Replace Terra aggregation with direct health-provider platform

## Summary

Move Morning Form away from a paid wearable aggregator as the default strategy. Keep the useful architecture we built during the Terra/Garmin pass - connection lifecycle, raw payload retention, canonical normalization, provider status states, webhook reconciliation - but make the provider layer vendor-neutral and prepare Garmin for official direct access through the Garmin Connect Developer Program.

This plan intentionally does not reverse-engineer private Garmin Connect behavior or scrape consumer endpoints. The direct route must use official vendor APIs, mobile OS health bridges, or explicit user uploads.

## Problem Frame

Terra's entry plan is too expensive for the current stage. We have no production users depending on the Garmin path, so there is no need for an urgent production hotfix. The next valuable work is to remove Terra as the strategic dependency, apply for Garmin direct access, and reshape the code so future direct integrations do not inherit Terra-specific names or assumptions.

The shipped Terra work was not wasted. It proved the integration shape we need:

- provider connection starts from a server-owned intent
- vendor identity must reconcile back to a Morning Form user
- callback/query parameters are not the trust boundary
- webhook events need signature verification and idempotent handling
- raw payloads must be retained before normalization
- canonical metrics should stay stable across providers
- production must fail loud instead of silently using mocks

## External Constraints

- Garmin's Health API is part of the Garmin Connect Developer Program and covers all-day metrics including steps, heart rate, sleep, stress, Pulse Ox, Body Battery, body composition, respiration, and blood pressure. Garmin documents both push and pull style integration patterns, JSON payloads, backfill/sample data, and an evaluation environment after approval. Source: https://developer.garmin.com/gc-developer-program/health-api/
- Garmin's FAQ says the program is for business use, uses OAuth 2.0, approval status is usually confirmed within two business days, and a typical integration takes one to four weeks. It also says there are no general licensing or maintenance fees for program access, but some metrics or commercial use may require a license fee or minimum device order quantity. Source: https://developer.garmin.com/gc-developer-program/program-faq/
- Garmin can share a subset of data to Apple Health on iOS and Health Connect on Android. These are useful fallbacks but require native mobile access and have data limitations. Sources: https://support.garmin.com/en-US/?faq=lK5FPB9iPF5PXFkIpFlFPA and https://support.garmin.com/en-US/?faq=JToBEy0jfe6pIygark2Ui5
- Google says Google Fit APIs are supported until the end of 2026 and points developers to Health Connect migration paths, so new Android health work should target Health Connect rather than expanding Google Fit. Source: https://developer.android.com/health-and-fitness/health-connect

## Requirements

### Provider Strategy

- R1. New health-provider work must use official direct APIs, HealthKit, Health Connect, or explicit user uploads. Do not build against private consumer endpoints.
- R2. Terra must remain an optional/deferred adapter, not the default architecture for Garmin or Apple Health.
- R3. The provider registry must express access state separately from product visibility: available, application-required, native-required, unavailable, or deprecated.
- R4. Garmin must have an application packet ready before engineering depends on unavailable credentials.

### Vendor-Neutral Architecture

- R5. Replace Terra-specific concepts in active architecture with generic names such as external user id, provider subject id, vendor event, provider webhook, and provider credential.
- R6. Preserve existing data during migration. `HealthConnection.terraUserId` can remain as a compatibility field in the first pass, but new code should read/write a vendor-neutral identifier.
- R7. Provider clients should share a common shape for auth start, callback exchange, refresh, disconnect, webhook handling, historical pull, and optional native ingestion.
- R8. Raw provider payload capture must remain provider-agnostic and happen before normalization.
- R9. Canonical metric names and units consumed by the suggestions engine must not drift while provider internals change.

### Garmin Direct

- R10. Prepare for Garmin Health API first, with Activity API as a likely follow-up if workout/training detail is needed.
- R11. Garmin direct code must not ship as "available" until Garmin approval, credentials, callback URLs, and webhook/pull mode are confirmed.
- R12. Garmin direct implementation must support OAuth 2.0 callback, token storage/refresh if applicable, user deauthorization/disconnect, webhook or ping/pull processing, historical backfill, and raw payload capture.
- R13. Garmin direct sync must map at least the current Garmin/Terra canonical surface: steps, sleep duration/stages, resting heart rate, average/max heart rate where available, HRV where available, respiration, stress, calories, active minutes, and recovery-adjacent metrics when available.

### Mobile OS Bridges

- R14. Apple Health must be handled through native iOS HealthKit or user export upload, not Terra by default.
- R15. Android health aggregation should use Health Connect, not new Google Fit investment.
- R16. Garmin via Apple Health/Health Connect should be documented as a fallback with explicit limitations, not marketed as equivalent to direct Garmin.

## Key Technical Decisions

- **KTD1. Do not buy Terra now.** At this stage, fixed aggregator cost is not justified. Vendor access uncertainty is a better use of founder time than recurring spend.
- **KTD2. Keep the normalization and lifecycle work.** The Terra PR created useful primitives. We should refactor them into provider-neutral surfaces rather than deleting them wholesale.
- **KTD3. Apply to Garmin before coding the final adapter.** Garmin's official API shape and commercial terms are approval-gated. Build only stable scaffolding until access is granted.
- **KTD4. Native bridges are fallback channels.** Apple Health and Health Connect can unblock some users, especially Garmin owners, but they are device/OS mediated and not a replacement for direct Garmin.
- **KTD5. Separate product availability from adapter implementation.** A provider can be listed as planned or application-required even when code exists behind a flag. The UI should not imply working access before credentials are real.

## Scope Boundaries

### In Scope

- Garmin Connect Developer Program application packet.
- Vendor-neutral provider lifecycle and access-status planning.
- Compatibility strategy for moving away from `terraUserId`.
- Implementation plan for direct Garmin and OS health bridges.
- Documentation updates that prevent accidental Terra provisioning as the long-term path.

### Out of Scope

- Submitting Garmin's application without business/legal answers from the operator.
- Reverse-engineering Garmin Connect private endpoints, scraping, or credential replay.
- Building a full native iOS/Android app in this pass.
- Removing Terra code immediately. There are no production users, but deletion should still be staged so tests and docs move coherently.
- Reworking the clinical graph, suggestions engine, or source document model beyond preserving health metric contracts.

## Existing Code References

- `src/lib/health/providers.ts` defines provider metadata and capability flags. It currently marks Garmin and Apple Health as `TERRA_AGGREGATED`.
- `src/lib/health/strategy.ts` defines a thin provider strategy contract, but it intentionally omits lifecycle methods.
- `src/app/api/health/connect/route.ts` owns provider connection start and currently routes Garmin through `TerraClient.generateWidgetSession`.
- `src/app/api/health/callback/[provider]/route.ts` owns OAuth/provider callback reconciliation.
- `src/app/api/health/terra/webhook/route.ts` is the strongest existing example of signed webhook ingestion and should be generalized, not copied provider by provider.
- `src/lib/health/sync.ts` owns provider pulls and canonical normalization.
- `prisma/schema.prisma` has `HealthConnection.terraUserId`; that is the main persistence-level Terra naming leak.
- `src/lib/health/raw-payload.ts` and `RawProviderPayload` already provide the raw-payload retention primitive we want.

## Implementation Units

### U1. Garmin application packet and operator checklist

**Goal:** Make Garmin application submission a business task, not an engineering guessing exercise.

**Create/modify:**

- `docs/runbooks/garmin-connect-developer-program-application.md`
- `docs/HEALTH_PROVIDER_SETUP.md`

**Approach:**

- Capture official Garmin facts, requested APIs, data categories, architecture, callback/webhook URLs, privacy/security posture, and missing operator answers.
- Keep the packet truthful: Morning Form is not reselling Garmin devices unless the business chooses that route; it is seeking read-only user-consented health data for health insights.

**Test scenarios:**

- Documentation includes every operator answer needed before Garmin submission.
- Documentation names the official source URLs and does not imply private API use.
- Documentation distinguishes Health API from Activity API follow-up.

**Verification:** Doc review only.

### U2. Provider access-status model

**Goal:** Represent "visible in UI" separately from "connectable now" so Garmin can be planned without throwing runtime config errors.

**Modify:**

- `src/lib/health/providers.ts`
- `src/types/index.ts`
- `src/app/(app)/settings/integrations/page.tsx`
- `src/app/api/health/connect/route.ts`
- Tests near `src/app/api/health/connect/route.test.ts`

**Approach:**

- Add a provider access status such as `available`, `application_required`, `native_required`, `deprecated`, and `disabled`.
- Mark Garmin as `application_required` until Garmin approval is complete.
- Mark Apple Health as `native_required`.
- Mark Google Fit as `deprecated` or `migration_required` for new work, while preserving existing code until Health Connect exists.
- Return a structured 400/409 response for unavailable providers rather than attempting missing credentials.

**Test scenarios:**

- Garmin connect returns a planned/application-required response while access status is not available.
- Existing available providers still start OAuth or credential flows.
- UI renders clear non-error copy for planned/native-required providers.

**Verification:** Focused connect-route and integrations-page tests.

### U3. Vendor-neutral connection identity compatibility layer

**Goal:** Stop new code from depending on `terraUserId` while avoiding a risky schema migration before direct Garmin access is known.

**Modify:**

- `src/lib/health/connection-identity.ts` (new)
- `src/lib/health/sync.ts`
- `src/app/api/health/callback/[provider]/route.ts`
- `src/app/api/health/terra/webhook/route.ts`
- `src/app/api/health/connections/route.ts`
- Related tests

**Approach:**

- Introduce helper functions that read/write provider external ids through metadata first, with `terraUserId` fallback for existing rows.
- Store new identifiers in metadata using keys like `externalUserId`, `externalSubjectId`, `credentialProvider`, and `vendor`.
- Leave the Prisma field in place for compatibility until a later migration can add a first-class `externalUserId` column or child `ProviderCredential` table.

**Test scenarios:**

- Existing Garmin/Terra rows with only `terraUserId` still sync/disconnect.
- New rows with metadata `externalUserId` are resolved without using Terra naming in callers.
- Malformed metadata does not crash connection rendering or sync.

**Verification:** Focused health connection, sync, webhook, and callback tests.

### U4. Provider lifecycle contract

**Goal:** Make the sync layer consume provider adapters through a stable lifecycle shape instead of accumulating switch cases.

**Modify:**

- `src/lib/health/strategy.ts`
- `src/lib/health/providers.ts`
- `src/lib/health/sync.ts`
- Provider clients under `src/lib/health/*.ts`
- Tests in `src/lib/health/sync.test.ts`

**Approach:**

- Extend the strategy contract with optional methods for auth URL/session creation, callback exchange, refresh, disconnect, historical pull, and webhook processing.
- Move provider-specific data pulls behind adapter methods incrementally, starting with one low-risk direct provider such as Oura or Whoop.
- Keep canonical mapping near provider adapters or in small mapper files so `sync.ts` shrinks rather than becoming the integration nexus.

**Test scenarios:**

- Existing direct provider still emits identical canonical metrics after moving behind the adapter contract.
- A provider without a lifecycle method gets a typed "unsupported" result, not an unhandled switch fall-through.
- Raw payload capture still wraps the provider call before canonical mapping.

**Verification:** Characterization tests for moved provider plus full health sync tests.

### U5. Direct Garmin adapter placeholder behind approval gate

**Goal:** Prepare the code shape for Garmin without pretending access exists.

**Modify:**

- `src/lib/health/garmin.ts`
- `src/lib/health/providers.ts`
- `src/app/api/health/connect/route.ts`
- `src/lib/health/sync.ts`
- Tests under `src/lib/health/garmin.test.ts` and connect/sync route tests

**Approach:**

- Replace the old stub with an explicit approval-gated client shell.
- Define the expected inputs and outputs based on official Garmin docs, but do not hardcode unverified endpoint paths or payload shapes until portal access is granted.
- Add environment variable placeholders only after Garmin approval provides names/values.

**Test scenarios:**

- Without Garmin approval/config, Garmin direct returns a typed `garmin_access_pending` result.
- No production mock data is emitted for Garmin.
- Once fixture payloads are available from Garmin evaluation, parser tests cover each requested metric family.

**Verification:** Placeholder tests now; parser and live client tests after approval.

### U6. HealthKit and Health Connect bridge plan

**Goal:** Define the mobile bridge path so Garmin users are not blocked forever while Garmin direct approval is pending.

**Modify:**

- `docs/IOS_APP_SETUP.md`
- `docs/HEALTH_PROVIDER_SETUP.md`
- Later: `morning-form-mobile` native modules and upload API routes

**Approach:**

- iOS: native HealthKit permission/read flow uploads normalized snapshots to existing `src/app/api/health/apple-health/route.ts` or a successor endpoint.
- Android: Health Connect read flow uploads normalized snapshots to a new endpoint.
- Treat Garmin-originated HealthKit/Health Connect records as sourced from the OS bridge, with original source metadata retained when available.

**Test scenarios:**

- OS bridge uploads require authenticated users and reject malformed payloads.
- Garmin-origin source metadata is retained in raw payload or metadata.
- Duplicate OS bridge uploads for the same window do not create unbounded duplicates.

**Verification:** API route tests first; device tests when native app work begins.

## Sequencing

1. Submit or prepare Garmin application using `docs/runbooks/garmin-connect-developer-program-application.md`.
2. Implement U2 so the product can show Garmin as pending/direct-access without Terra config errors.
3. Implement U3 to remove Terra naming from new code paths while preserving merged Terra rows.
4. Implement U4 by moving one existing direct provider behind a richer adapter contract.
5. After Garmin approval, implement U5 against official evaluation docs and sample payloads.
6. In parallel or after Garmin uncertainty clears, plan/build U6 for HealthKit and Health Connect.

## Risks

- Garmin approval or commercial terms may still block direct access. Mitigation: keep OS bridge fallback alive and do not market Garmin as available until approval.
- Refactoring provider lifecycle can regress already-working direct providers. Mitigation: characterization tests before moving each provider.
- `HealthConnection.terraUserId` migration can lose existing state if rushed. Mitigation: compatibility helpers first, schema migration later.
- HealthKit/Health Connect require native app work and store review/policy compliance. Mitigation: keep web product honest about native-required status.

## Open Questions

- What legal entity, website, support email, privacy policy URL, and expected user/device count should be used in the Garmin application?
- Is Garmin Health API enough for v1, or do we also need Activity API for workout detail and training load?
- Do we want native mobile bridge work before Garmin approval, or only if Garmin approval is delayed?
- Should Terra remain in compliance docs as a dormant sub-processor until code is removed, or should it be removed only after a de-Terra PR lands?

