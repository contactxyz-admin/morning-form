---
title: "fix: Libre real-path hardening"
status: active
created: 2026-04-15
type: fix
origin: /ce:review on PR #9 (feat/health-libre)
---

# Libre Real-Path Hardening

## Problem

PR #9 shipped LibreLinkUp as a mock-first integration: credentials are
collected, a mock session token is stored, and `syncProvider('libre')`
returns a deterministic 96-point series. `/ce:review` surfaced that the
real path is **unreachable** even with `LIBRE_ENABLED=true` — `syncProvider`
calls `getGlucoseGraph('mock_patient', undefined, ...)` with a hardcoded
patientId and undefined accessToken, so the stored credentials are
inert. The feature as shipped gives users a connect flow that pretends
to work.

Three safe_auto fixes landed directly on PR #9 (log scrubbing, fetch
timeouts, prod-mock warning). This plan covers the remaining gaps.

## Scope

In:
- Wire the real Libre sync path end-to-end
- Encrypt session tokens at rest
- Handle 401 (re-auth required), 429 (rate limit), and 5xx with bounded retry
- Gate re-connect on valid session (don't let mock sync revive an expired connection)
- Require authenticated session on `/api/health/connect`
- Validate LibreLinkUp response shape before persisting
- Tests for all real-path branches

Out:
- Timezone-aware fasting window (still deferred per Unit 5 plan)
- Regional LibreLinkUp endpoint selection (P3, advisory only)
- mmol/L unit conversion (P3, follow-up)

## Requirements Trace

| # | Source | Requirement |
|---|---|---|
| R1 | reliability P0 | `syncProvider('libre')` fetches using stored `patientId` + decrypted `accessToken` |
| R2 | security P1 | `accessToken` is encrypted at rest (match Dexcom refresh-token pattern if present, else AES-GCM with key from env) |
| R3 | correctness P1 | Expired session stays disconnected; subsequent mock sync does not revive |
| R4 | reliability P1 | 401 → clear token, mark `status: 'needs_reauth'`, don't retry |
| R5 | reliability P1 | 429 + 5xx → bounded retry with jitter (max 3), then surface error |
| R6 | reliability P1 | All fetches have timeouts (already landed for login + graph) |
| R7 | security P1 | `/api/health/connect` requires authenticated session |
| R8 | adversarial P1 | Malformed LibreLinkUp response rejected before upsert (zod schema) |
| R9 | testing P1 | Real-path branches covered: login success/failure, graph success/401/429/5xx, mapping to `HealthDataPoint` |

## Implementation Units

### Unit 1 — Storage layer: encrypt + decrypt

Files:
- `src/lib/health/crypto.ts` (new): `encryptToken(plain)` / `decryptToken(cipher)` using AES-256-GCM, key from `HEALTH_TOKEN_ENCRYPTION_KEY` env
- `src/lib/env.ts`: add `HEALTH_TOKEN_ENCRYPTION_KEY` (required in prod, optional in dev with dev-only fallback)
- `src/app/api/health/connect/route.ts`: encrypt before persist

Verification: tokens in DB are ciphertext; round-trip test.

### Unit 2 — Wire real sync path

Files:
- `src/lib/health/sync.ts`: for `libre` case, load `HealthConnection`, parse `patientId` from metadata, decrypt `accessToken`, call `getGlucoseGraph(patientId, accessToken, startDate)`
- `src/lib/health/libre.ts`: add zod schema for response, reject malformed

Execution note: test-first. Add an integration test that stubs the Libre HTTP layer and asserts the engine persists the real mapped readings.

Verification: with `LIBRE_ENABLED=true` and a valid stored session, `syncProvider('libre')` returns the stubbed payload mapped to `HealthDataPoint[]`.

### Unit 3 — Error handling: 401, 429, 5xx

Files:
- `src/lib/health/libre.ts`: typed `LibreAuthError` / `LibreRateLimitError` / `LibreTransientError`; bounded retry with exponential jitter on 429/5xx (max 3)
- `src/lib/health/sync.ts`: on `LibreAuthError`, mark connection `status: 'needs_reauth'` and clear token
- `src/app/(app)/settings/integrations/page.tsx`: surface `needs_reauth` as a re-connect prompt (read-only if UI seam already renders status)

Verification: tests for each error class; UI shows reconnect affordance.

### Unit 4 — Session-gated re-connect

File: `src/lib/health/sync.ts`

Change mock-sync branch to require a non-expired `accessToken` on the `HealthConnection`. If expired, keep `status: 'needs_reauth'` and skip sync.

Verification: disconnect → mock-sync does not flip status back to `connected`.

### Unit 5 — Auth on connect endpoint

File: `src/app/api/health/connect/route.ts`

Use existing session helper (same as other health endpoints) to bind connection to authenticated user instead of `getOrCreateDemoUser`. Demo-user fallback stays behind `NODE_ENV !== 'production'`.

Verification: unauthenticated POST returns 401 in prod.

### Unit 6 — Tests

Files:
- `src/lib/health/libre.test.ts` (new or expand): login ok/401/network-timeout, graph ok/401/429/5xx, response-shape validation
- `src/lib/health/sync.test.ts`: real-path wiring, session-expired gate, needs_reauth transition
- `src/app/api/health/connect/route.test.ts`: auth required, zod rejection

## Dependencies / Sequencing

Unit 1 → Unit 2 (decrypt needed before sync can load token).
Unit 2 and Unit 3 can overlap.
Unit 4 is independent; can land first.
Unit 5 should land before prod exposure.
Unit 6 runs alongside each unit (test-first).

## Risks

- **Unofficial endpoint drift.** Libre may change response shape. zod schema + clear error path contains the blast radius.
- **Encryption key management.** If `HEALTH_TOKEN_ENCRYPTION_KEY` rotates, stored tokens become unreadable. Acceptable — users re-auth. Document in env.
- **Session behavior in browser tests.** Unit 5 may require fixture session; use existing test helpers if present.

## Deferred to Implementation

- Whether to reuse existing Dexcom-style encryption util (if one exists) vs add new
- Whether `needs_reauth` status already exists in the `HealthConnection` enum or needs a migration

## Scope Boundaries

- No UI redesign of settings page
- No refactor of the provider strategy abstraction
- No new telemetry/metrics
- Regional endpoint selection stays mock-only
