---
title: "fix: Dexcom real-path hardening (mirror of Libre #12)"
type: fix
status: active
created: 2026-04-15
---

## Problem

`DexcomClient.getEgvs` falls back to `generateMockEgvs` whenever `clientId`, `clientSecret`, or `accessToken` is missing. `HealthSyncService.syncProvider('dexcom', ...)` calls `this.dexcom.getEgvs(startDate, endDate)` — note the two-arg call — so the stored token is **never plumbed through**. A connected user with a real Dexcom session will still silently receive mock glucose data, and downstream suggestion rules fire against fake values.

This is the same class of bug #12 fixed for Libre. That PR established the pattern; this plan applies it to Dexcom.

## Scope Boundaries

- **In scope:** real-path wiring, token decryption, typed errors, bounded retry, session-gated re-connect, auth-failure handling in `syncConnection`, tests for each.
- **Out of scope:** Dexcom sandbox vs prod URL switching, V3 API migration, device-info endpoints, webhook push path.

## Requirements Trace

| # | Requirement | Comes from |
|---|---|---|
| R1 | `syncProvider('dexcom')` uses decrypted stored token + real `baseUrl` when `connection` is provided | /ce:review finding, #12 pattern |
| R2 | Expired / mock / undecryptable tokens fall back to mock (don't pretend-connect) | #12 Unit 4 |
| R3 | Bounded retry (max 3, jittered backoff, 10s per-attempt timeout) for 429/5xx | #12 Unit 3 |
| R4 | Typed errors: `DexcomAuthError`, `DexcomRateLimitError`, `DexcomTransientError` | #12 Unit 3 |
| R5 | Malformed response bodies rejected via zod schema | #12 Unit 3 |
| R6 | `LibreAuthError` parity: `syncConnection` catches `DexcomAuthError`, clears token, sets `status: 'needs_reauth'` | #12 Unit 4 |
| R7 | Real-path tests: login/refresh 401, EGV 401/429/5xx/malformed/happy-path, wiring, mock/expired fallback, auth-error propagation | #12 Unit 6 |

## Implementation Units

### Unit 1 — Typed errors + zod schemas + fetchWithRetry
**Files:** `src/lib/health/dexcom.ts`
**Patterns to follow:** `src/lib/health/libre.ts` (verbatim structure for `LibreAuthError` / `fetchWithRetry` / `backoff`).
**Verification:** Unit tests pass; `tsc --noEmit` clean.

### Unit 2 — Wire `exchangeCode` / `refreshToken` / `getEgvs` through `fetchWithRetry`
**Files:** `src/lib/health/dexcom.ts`
**Approach:** 401 → `DexcomAuthError`; retry-after-aware 429 → `DexcomRateLimitError`; other non-ok → `DexcomTransientError`; schema-fail → `DexcomTransientError('malformed')`.
**Verification:** Existing mock-path tests still pass; new real-path tests (Unit 4) pass.

### Unit 3 — Plumb token through `syncProvider` + session-gated creds
**Files:** `src/lib/health/sync.ts`
**Approach:** Add `resolveDexcomCredentials(connection)` (parallel to `resolveLibreCredentials`). Dexcom case uses decrypted token + real client when resolvable; falls back to mock client otherwise. `getEgvs` called with token.
**Verification:** New sync.test scenarios (Unit 5) pass.

### Unit 4 — `dexcom.test.ts` real-path coverage
**Files:** `src/lib/health/dexcom.test.ts` (new describe block)
**Test scenarios (happy + error + edge):**
- exchange 401 → `DexcomAuthError`
- refresh 401 → `DexcomAuthError`
- getEgvs 401 → `DexcomAuthError`
- getEgvs 429 w/ Retry-After → `DexcomRateLimitError` with `retryAfterSeconds`
- getEgvs 5xx (transient) → retries, eventually succeeds
- getEgvs malformed body → `DexcomTransientError`
- getEgvs happy-path → asserts Bearer header + URL contains `users/self/egvs`

### Unit 5 — `sync.test.ts` Dexcom real-path coverage
**Files:** `src/lib/health/sync.test.ts` (new describe block, mirror `Libre real path`)
**Test scenarios:**
- uses stored decrypted token when `connection` provided
- mock_access_ token prefix → falls back to mock client
- expired `expiresAt` → falls back to mock client
- `DexcomAuthError` from client → sets `status: 'needs_reauth'`, clears token

### Unit 6 — `syncConnection` auth-error handling
**Files:** `src/lib/health/sync.ts`
**Approach:** Extend the existing `LibreAuthError` catch block to also handle `DexcomAuthError` (or refactor to a shared `HealthAuthError` base — decide at implementation). Clears `accessToken` + `expiresAt`, writes `syncError: 'dexcom_session_expired_reconnect_required'`.
**Verification:** Unit 5 auth-error scenario passes.

## Dependencies

None — lands on main as an independent fix.

## Risks

- **Dexcom sandbox vs production endpoints:** Dexcom has separate `api.dexcom.com` and `sandbox-api.dexcom.com` hosts. This plan does **not** add host switching — callers currently hit prod. Flag for a followup.
- **V2 → V3 migration:** Dexcom V3 deprecates some fields. Out of scope here; lock the V2 zod shape now and migrate later.

## Execution note

Mirror #12 closely. This should be a mechanical port — if something diverges materially from the Libre pattern, stop and justify.
