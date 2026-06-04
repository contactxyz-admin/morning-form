---
title: "feat: First-session completeness — check-in persistence, GDPR data rights, settings finish"
type: feat
status: active
date: 2026-06-04
origin: docs/brainstorms/2026-06-04-first-session-completeness-requirements.md
deepened: 2026-06-04
---

# feat: First-session completeness — check-in persistence, GDPR data rights, settings finish

## Overview

Finish the three verified gaps that a first paying customer would hit in their first week: check-ins that never reach the server (so `/insights` is permanently empty), missing GDPR export/delete (Settings buttons promise rights we can't deliver), and localStorage-only settings preferences. Plus the engineering tail of the priorities-reveal go-live (flag flip + prod verification) once the founder-owned clinical review signs off.

This is completion work on existing surfaces — no new product directions (see origin doc).

## Problem Frame

See origin: `docs/brainstorms/2026-06-04-first-session-completeness-requirements.md`. Summary:

1. `/check-in` writes only to `localStorage`; the fully-implemented `POST /api/check-in` is never called, so `/insights` is empty for every real user and data is lost across devices.
2. No `/api/account` routes exist; Settings → Data renders export/delete affordances with no backing — UK GDPR Articles 15/17 obligations we visually imply but cannot deliver.
3. Settings preferences (wake/wind-down, notifications) are localStorage-only despite an existing (unused) `UserPreferences` model; the Account section shows a dead "Change password" button and a hardcoded `demo@morningform.com` email.
4. `/reveal/priorities` is gated behind `PRIORITY_MARKERS_ENABLED` pending UK GP + US PCP review (founder-owned, runs in parallel). This plan covers only the flip + verification tail.

## Requirements Trace

- R3 (tail). Flag flip in Vercel production + real prod assessment verification once clinical sign-off lands.
- R4. Check-ins persist server-side; server validates date plausibility; localStorage may remain as optimistic cache.
- R5. `/insights` renders from persisted check-ins on any device; graceful for check-in-only users (empty wearable/history arms).
- R6. No migration of historical localStorage check-ins (re-verify no real users depend on them at ship time).
- R7. Complete data export — all user data domains, no silent partial archives, rate-limited.
- R8. Hard account deletion — DB rows, blob files, derived artifacts, analytics-row PII — with re-confirmation beyond an active session and a surviving audit (tombstone) record retaining proof of consent + erasure.
- R9. No dead controls in touched Settings sections (wire export/delete, remove Change password, show the real session email).
- R10. Settings preferences persist via the existing `UserPreferences` model.

## Scope Boundaries

- No wearables work (Whoop/Oura/Fitbit/Garmin/Apple Health) — separate active plan (`docs/plans/2026-06-02-002-feat-direct-health-provider-platform-plan.md`).
- No Stripe / preview tier / lifecycle emails (standing eng pause).
- No IA cleanup beyond the touched Settings sections.
- R1–R2 (clinical content review) are founder-owned and not engineering work.
- No deletion grace period (see Key Technical Decisions).

### Deferred to Separate Tasks

- Issues #90 (demo narrative coherence) and #84 (activation funnel design questions): existing open issues, not bundled here.
- `ce:compound` writeup of the deletion-cascade ordering and blob cleanup after this ships (no institutional doc exists yet).

## Context & Research

### Relevant Code and Patterns

- `src/app/api/check-in/route.ts` — already complete: auth via `getCurrentUser()`, `upsert` on `userId_date_type` (idempotent), `YYYY-MM-DD` regex (format only — no plausibility check). The canonical route-test harness lives in `src/app/api/check-in/route.test.ts` (`vi.mock('@/lib/db')` + `getTestPrisma()`, `vi.mock('@/lib/session')`, helpers from `@/lib/graph/test-db`). Mirror it for all new routes.
- `src/app/(app)/check-in/page.tsx` — submit path writes `mf_checkin_{type}_{dateKey}` to localStorage only (auto-submit effects); never fetches.
- `src/lib/hooks/use-insights-data.ts` — fetches `/api/insights/weekly`, `/api/check-in`, `/api/insights/health-history` in parallel; empty check-ins is already a `ready` state (not error), but any non-ok arm → whole-page `error`.
- `src/app/(app)/settings/page.tsx` — sections 01 Protocol timing / 02 Notifications (localStorage key `mf_preferences`, toggles in `useState` only), 04 Account (dead "Change password", hardcoded `demo@morningform.com`), 05 Data (dead "Export my data" / "Delete account").
- `UserPreferences` model (prisma/schema.prisma) — `wakeTime`, `windDownTime`, `timezone`, `notifyMorning/Protocol/Evening/Weekly` — exists, referenced nowhere in `src/`.
- Rate limiting — DB fixed-window pattern in `src/lib/auth/magic-link.ts` (`checkAndIncrementRateLimits`, `MagicLinkRateLimit`, `$transaction` check-then-increment). Mirror for export.
- Token issuance/hashing — HMAC-SHA256 with domain-separation prefixes (`hashToken` in magic-link lib). Reuse pattern for the deletion-confirmation token.
- Blob — `storePdf(userId, contentHash, buf)` → `uploads/<userId>/<contentHash>.pdf`, `put(..., { access: 'private' })` in `src/lib/intake/storage.ts`. **No `del` usage exists anywhere yet.**
- Feature flag — `PRIORITY_MARKERS_ENABLED` read once in `src/app/reveal/priorities/page.tsx` (server component). Flip = Vercel env var; no code change.
- Schema changes ride `prisma db push` (this repo has **no Prisma migration chain**; raw SQL only for extensions, in `docs/migrations/` run on both Neon replicas — not needed here, all additions are Prisma-native).
- Email — Resend already wired for magic links; reuse for export links and deletion confirmation.

### Deletion blast-radius (verified against prisma/schema.prisma)

- Cascade-with-User already: `MagicLinkToken`, `Session`, `GraphNodeLayout`, `SharedView`, `Scribe`, `ScribeTopicLink`, `ScribeAudit`, `MCPToken`, `MCPAuditEvent`.
- **No onDelete (block naive delete; must be handled explicitly):** `AssessmentResponse`, `StateProfile`, `Priorities`, `CheckIn`, `ChatMessage`, `HealthConnection`, `HealthDataPoint`, `Suggestion`, `UserPreferences`, `SourceDocument`, `GraphNode`, `GraphEdge`, `TopicPage`.
- **Grandchildren with no cascade (P0 — must delete before their parent):** `PriorityMarker` and `PrioritiesAdjustment` relate to `Priorities` with NO `onDelete` and have no `userId`/`email` column of their own — delete both (scoped via `prioritiesId`) before `Priorities`, inside the same transaction. Re-derive this inventory mechanically from the schema at implementation time rather than trusting any hand list (including this one).
- Embedding chain: `SourceDocument` → `SourceChunk` (Cascade) → `VectorEmbedding` (Cascade); deleting SourceDocuments cascades chunks + embeddings.
- `EmbeddingBackfillState` has a User relation with `onDelete: SetNull` — it neither blocks `user.delete()` nor gets swept; rows survive with `userId = NULL` (no residual PII). List it as explicitly handled so the residue test doesn't flag it.
- **PII without a User FK (must be scrubbed, not cascaded):** `FunnelEvent.userId`, `LandingPageVisit.email`, `RawProviderPayload.userId`.
- The 13 no-cascade User relations are direct children — but NOT all order-free: `Priorities` owns the `PriorityMarker`/`PrioritiesAdjustment` subtree (above), which must be deleted first. The rule is: grandchild subtrees → the 13 children → `user.delete()`.
- `@vercel/blob` **2.3.3** (installed): `put({access:'private'})`, `del()` (URL or pathname, array-capable, no-op on missing — retry-safe), `list({prefix, cursor})` (1000/page — paginate), and server-side `get(..., {access:'private'})` for streaming. **No signed/expiring URLs in 2.3.3** (shipped in 2.4.0) — private blobs can only be served through our own authenticated route.

### Institutional Learnings

- `docs/solutions/best-practices/server-action-shared-cta-instrumentation-2026-05-11.md` — the `priorities-to-intake-click` funnel counter must keep working across the `PRIORITY_MARKERS_ENABLED` flip (interstitial and real page share one Server Action).
- `docs/solutions/runtime-errors/vercel-env-add-stdin-silent-failure-2026-05-16.md` — set env vars with `--value … --yes` and verify via `vercel env ls`; stdin piping silently fails.
- `docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md` — build-green ≠ runtime-green; cold-walk every new route in prod.
- Visual-audit gate learning — check-in/settings/insights are user-facing UI; verify visually, not just by tests.

### External References

- ICO right-of-access + portability guidance: derived/inferred data is in scope for access only when intelligible; raw vector embeddings are internal technical representations — export the source content instead. One-month response window; no fee.
- Vercel limits: 4.5 MB response body cap → multi-PDF archives don't fit a synchronous response; build → Blob → expiring link is the standard pattern.
- Deletion accountability (Art. 5(2)): tombstone with opaque ID, timestamps, and proof consent was held; salted email hash only for duplicate-request detection.

## Key Technical Decisions

- **Export is async-ish, delivered via an authenticated download proxy**: `POST /api/account/export` creates an `ExportRequest` row, builds the archive (zip: one JSON file per data domain + `files/` with original PDFs + `manifest.json`), uploads it to private Blob under `uploads/<userId>/exports/`, emails a link via Resend, marks the request complete. **The emailed link is NOT a bare blob URL** — it points to `GET /api/account/export/download` which requires an authenticated session (`getCurrentUser()`), asserts ownership of the ExportRequest, checks `expiresAt` (24 h), and streams the archive via blob `get(..., {access:'private'})`. Two reasons: a bare capability URL to a full PHI archive sitting in email is the wrong threat posture (mailbox compromise = full health record), and @vercel/blob 2.3.3 has no signed URLs anyway. Failure marks the request `failed` and is surfaced in Settings — never a silent partial archive (origin R7). Every export request also triggers an unconditional "a data export was requested" notice to the registered email, so a hijacked-session export is visible to the real owner.
- **Embeddings are excluded from export; source content is included**: ICO expects intelligible data; vectors are opaque internal representations of text we already export. Documented in the manifest. (Resolves origin deferred question.)
- **Deletion = explicit ordered `$transaction`, not cascade migration**: for health data we want a deliberate, auditable erasure with explicit table coverage, and it avoids schema churn on 13 relations. (Resolves origin deferred question.)
- **Blob-first, retryable deletion ordering with a single atomic DB transaction**: write tombstone (status `pending`) → enumerate + delete blob objects → one Prisma `$transaction` containing: the grandchild `deleteMany`s (`PriorityMarker`/`PrioritiesAdjustment` before `Priorities`), the 13 explicit child `deleteMany`s, `user.delete()` (sweeps cascade-annotated models), the no-FK PII scrub (`FunnelEvent`/`LandingPageVisit`/`RawProviderPayload` — nulling the PII fields, not deleting rows, so analytics continuity survives), **and the tombstone flip to `completed` as the last statement** — so erasure and its audit record commit atomically. The PII scrub must be *inside* the transaction: if it ran after commit and failed, the email needed to find `LandingPageVisit` rows would already be gone. Any blob failure aborts before the DB transaction (tombstone stays `pending`, retry-safe: `del()` no-ops on already-deleted blobs, `SourceDocument` rows still exist on rollback). The transaction needs an explicit generous `timeout` (~20–30 s; Prisma defaults to 5 s, which a seeded user's embedding cascade will blow on Neon) and a matching route `maxDuration`. Blob enumeration = union of `SourceDocument.storagePath` values, `ExportRequest.blobPath` values (queried **before** the transaction deletes those rows), and a paginated Blob `list()` on the `uploads/<userId>/` prefix (which also catches `exports/`) — resolves origin deferred question.
- **Deletion re-confirmation = fresh single-use email token AND an active session, POST-only**: under passwordless auth, an active session alone is not enough (origin R8) — and a token alone is not enough either (a single mailbox read must not equal irreversible erasure). The emailed link lands on a side-effect-free confirmation page (GET); actual erasure runs on an explicit POST requiring both the token and an authenticated session matching the token's user. GET must never delete — email scanners and link-preview bots fire GETs. Token mirrors the magic-link pattern: distinct domain-separation prefix, ~15 min expiry, **atomic single-use consume** (the `updateMany(... consumedAt: null)` guard) so a raced/reused token cannot double-fire erasure; a confirm against an already-`completed` tombstone is a no-op success. No grace period — the brainstorm chose prompt hard deletion; dual-factor confirmation covers the account-takeover risk (alternative considered below).
- **Tombstone fields**: opaque ID, salted email hash (duplicate-request detection only), salted IP hash of the confirming request (abuse forensics — existing `ipHash` convention; raw IP would be fresh PII about a just-erased subject), `consentHeldAt` snapshot, requested/confirmed/completed timestamps, per-domain deleted-row counts. No User FK — survives erasure by construction. (Resolves origin deferred question on surviving fields; flag the retention reasoning for the privacy-lawyer skim.)
- **Check-in writes are server-first with optimistic local echo**: submit POSTs `/api/check-in`; localStorage mirrors success for instant "done" state on revisit; on POST failure the UI shows an error and does not record local success. Stale local keys are cleared when the server confirms. (Resolves origin deferred question.)
- **Export rate limit is DB-backed and counts deliveries, not attempts**: max 2 non-`failed` requests per user per 24 h against the `ExportRequest` table (mirrors the magic-link fixed-window pattern); 429 with `Retry-After`. A `failed` request does not consume a slot — a transient blob/timeout failure must never lock a user out of an Article 15 right for 24 h. No new infra.
- **Date plausibility window**: server rejects check-in dates > 1 day in the future or > 365 days in the past (400). The ±1-day tolerance is deliberate — client date keys are UTC (`getDateKey()` uses `toISOString()`), so edge-of-day submissions far from UTC legitimately differ from the server's UTC "today" by a day. Do not tighten to ±0.

## Open Questions

### Resolved During Planning

- Export format/delivery → zip via Blob + emailed 24 h link (above).
- Embeddings in export scope → excluded, with manifest note (above).
- Cascade migration vs ordered transaction → ordered transaction (above).
- Surviving audit-record fields → tombstone spec (above).
- Authoritative blob-key list → `storagePath` ∪ prefix list (above).
- Check-in local/server reconciliation → server-first with optimistic echo (above).

### Deferred to Implementation

- Zip assembly library choice (or store-only zip writer) — pick whatever runs cleanly in the Vercel runtime; no repo precedent. Use blob `multipart: true` for large uploads to avoid buffering the archive in function memory.
- Export route `maxDuration` value (Hobby caps at 60 s, Pro at 300 s — check the project's plan tier) and whether a retry path (cron or manual re-trigger) is needed for `pending` ExportRequests — depends on observed archive build time with real data volumes.
- Exact `timeout`/`maxWait` values for the deletion `$transaction` (start ~20–30 s) — tune against a fully-seeded user on a Neon branch. Ordering inside is settled: the 13 children have no inter-dependencies (any order), then `user.delete()`, then scrub, then tombstone flip.
- Whether the deletion confirmation email and goodbye page need copy review — content task, not blocking.

## Implementation Units

Phase A (daily-use + settings) and Phase B (GDPR) are independent; Unit 4 gates Units 5–6. Unit 8 is calendar-gated on clinical sign-off, not on other units.

### Phase A — daily-use loop and settings

- [ ] **Unit 1: Wire check-in submission to the server + date plausibility validation**

**Goal:** Check-ins persist to Postgres (R4); server rejects implausible dates.

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Modify: `src/app/(app)/check-in/page.tsx`
- Modify: `src/app/api/check-in/route.ts`
- Test: `src/app/api/check-in/route.test.ts`

**Approach:**
- Submit path POSTs `{ type, date, responses }` to the existing endpoint; on success, mirror to localStorage (existing keys) for the instant done-state; on failure, show an inline error and do not mark done. "Clearing stale keys" means exactly the same `type+date` key (`mf_checkin_{type}_{dateKey}`) is rewritten on server confirmation — other types/dates are untouched.
- Add the plausibility window (reject > +1 day / > −365 days) to the route alongside the existing format regex.
- No localStorage migration (R6) — re-verify the no-real-users assumption at ship time per origin.

**Patterns to follow:** existing fetch+state handling in `src/lib/hooks/use-insights-data.ts`; route validation style already in `src/app/api/check-in/route.ts`.

**Test scenarios:**
- Happy path: morning submit persists a CheckIn row; evening submit same date persists second row; GET returns both.
- Happy path: re-submit same type+date upserts (no duplicate row) — existing behavior still holds with new validation.
- Edge case: date exactly today+1 accepted; today+2 rejected 400; date 366 days old rejected 400.
- Error path: unauthenticated POST → 401 (existing, keep covered).
- Error path (client): failed POST → error state shown, localStorage done-key NOT written.
- Happy path (client): successful POST rewrites the same `type+date` local key; other keys untouched.
- Integration: after POST succeeds, `/api/check-in` GET (as used by insights) includes the new row.

**Verification:** Check in on device A, see the check-in reflected in `/insights` and on device B under the same account.

- [ ] **Unit 2: Insights resilience for check-in-only users**

**Goal:** `/insights` renders real check-in data gracefully when wearable/health-history arms are empty (R5).

**Requirements:** R5

**Dependencies:** Unit 1 (to verify end-to-end)

**Files:**
- Modify: `src/lib/hooks/use-insights-data.ts` (only if hardening needed)
- Test: `src/lib/hooks/use-insights-data.test.ts` (create if absent)
- Verify: `src/app/(app)/insights/page.tsx`

**Approach:**
- The read path already exists; empty check-ins is already a `ready` state. The verified gap: any non-ok arm fails the whole page. Decide per-arm: weekly + check-in arms remain required; a failed `health-history` arm (plausible for a user with no wearable) should degrade to an empty section rather than a page-level error.

**Test scenarios:**
- Happy path: check-ins present + empty weekly/history payloads → page renders check-in content with empty wearable sections.
- Error path: health-history arm returns 500 → page still renders check-in content (degraded), not the error state.
- Error path: check-in arm returns 500 → page-level error (unchanged).
- Edge case: brand-new user, all arms empty → existing empty state unchanged.

**Verification:** A user with only check-ins (no wearable) sees a populated `/insights`.

- [ ] **Unit 3: Settings preferences persist via UserPreferences (R10)**

**Goal:** Wake/wind-down, timezone, and notification toggles persist server-side and survive across devices.

**Requirements:** R10

**Dependencies:** None

**Files:**
- Create: `src/app/api/user/preferences/route.ts`
- Test: `src/app/api/user/preferences/route.test.ts`
- Modify: `src/app/(app)/settings/page.tsx`

**Approach:**
- GET returns the user's `UserPreferences` (defaults when no row); PUT upserts with an explicit field allowlist (only the known model fields are writable — a future schema addition must not become silently writable through this endpoint). Settings page loads from the API, writes through on change, drops the `mf_preferences` localStorage source of truth (a local echo is acceptable).
- One-time migration: on Settings load, if no server row exists but a local `mf_preferences` exists, PUT it once — preserves any pre-existing per-device preferences at near-zero cost.
- Model already has every needed field — no schema change.

**Patterns to follow:** `src/app/api/check-in/route.ts` (auth + upsert + validation shape); its test harness.

**Test scenarios:**
- Happy path: PUT persists wake/wind-down + toggles; GET returns them.
- Happy path: GET with no row returns defaults (matches current UI defaults).
- Edge case: invalid time format → 400.
- Error path: unauthenticated GET/PUT → 401.
- Integration: settings saved on device A render on device B (GET after PUT round-trip).

**Verification:** Change wake time, reload on a second session — value persists.

### Phase B — GDPR data rights

- [ ] **Unit 4: Schema additions — ExportRequest, DeletionTombstone, deletion-confirmation token**

**Goal:** Persistence for export lifecycle, surviving deletion audit, and deletion re-confirmation.

**Requirements:** R7, R8

**Dependencies:** None (gates Units 5–6)

**Files:**
- Modify: `prisma/schema.prisma`

**Approach:**
- `ExportRequest`: userId FK (Cascade — export history dies with the user), status (`pending|complete|failed`), blobPath (must be non-null for `complete` rows — the deletion sweep depends on it; the pre-transaction read filters nulls), expiresAt, timestamps. Doubles as the rate-limit window source (non-`failed` rows only).
- `AccountDeletionTombstone`: **no User FK** — opaque id, salted email hash, `consentHeldAt`, requested/confirmed/completed timestamps, status (`pending|completed`), per-domain deleted-counts JSON.
- Deletion confirmation token: either a purpose-discriminated reuse of the magic-link token model or a small dedicated model — implementer's call; must be single-use, HMAC-hashed (domain-separation prefix), ~15 min expiry, and **bound to the issuing userId at creation** — the confirm route verifies the token's userId matches the session user before any erasure (explicit guard against confused-deputy submission of user A's token in user B's session).
- Ships via `prisma db push` (no migration chain in this repo); additive only.

**Test expectation: none** — schema-only; behavior covered by Units 5–6 tests against the test DB (global setup force-pushes schema).

**Verification:** `prisma db push` clean on the test DB; Units 5–6 compile against generated client.

- [ ] **Unit 5: Data export endpoint + delivery (R7)**

**Goal:** Complete, rate-limited data export delivered as an emailed expiring link.

**Requirements:** R7, R9 (button wiring lands in Unit 7)

**Dependencies:** Unit 4

**Files:**
- Create: `src/app/api/account/export/route.ts`
- Create: `src/app/api/account/export/download/route.ts`
- Create: `src/lib/account/export.ts`
- Test: `src/app/api/account/export/route.test.ts`
- Test: `src/app/api/account/export/download/route.test.ts`
- Test: `src/lib/account/export.test.ts`

**Approach:**
- POST: auth → rate-limit check (2 non-failed/24 h, 429 + `Retry-After`) → create `pending` request → send the unconditional "export requested" notice → assemble archive → upload to private Blob under `uploads/<userId>/exports/` (`multipart: true`) → email the download link → mark `complete`. Any assembly/upload failure marks `failed` with a user-visible reason — never a partial archive presented as complete. A `pending` row older than the route's `maxDuration` is treated as failed by the Settings status display (a timeout kill can't mark its own row), and a failed/stale request is retryable without consuming a rate-limit slot. No IP capture on ExportRequest — `requestedAt` + userId is trail enough; adding ipHash would be fresh PII collection beyond the origin requirements (data minimization).
- Download proxy: GET requires `getCurrentUser()`, asserts the session user owns the ExportRequest, checks status + `expiresAt` (24 h), streams via blob `get(..., {access:'private'})`. `get()` returns null when the blob is absent despite a `complete` row (swept, expired-cleaned) — respond 410 and mark the request stale, never a 500. The raw blob path is never exposed.
- Email sending: `src/lib/auth/email.ts` exposes only the bespoke `sendMagicLinkEmail` (hardcoded subject/copy) — extract a small generic sender for the export notice, download link, and deletion confirmation emails rather than assuming drop-in reuse. Note: in any env without `RESEND_API_KEY` the sender console-logs and returns `{sent:false}` — the "owner notice" control is real only where the key is set.
- Archive: one JSON per domain — account, preferences, assessment responses, state profile, priorities + markers, check-ins, chat messages, scribes, health connections + data points, shared-view tokens, suggestions, record/graph content (nodes/edges/source chunks' text; intake essentials are part of this per origin) — plus `files/` with original uploaded PDFs and `manifest.json` listing domains, counts, explicit empties, and exclusions with reasoning (vector embeddings, session/token rows, internal audit logs).
- Export completeness gets the same structural guard as deletion: a test scans the Prisma schema for user-owned models and asserts each is either exported or on the documented exclusion list — a new table added later must fail this test, not silently fall out of the archive.
- GET (same route or settings payload): current export status for Settings UI.

**Execution note:** Implement the archive assembler test-first against a seeded multi-domain user — completeness is the legal requirement; the test enumerates every domain.

**Patterns to follow:** rate-limit transaction shape from `src/lib/auth/magic-link.ts`; Resend send path from magic-link delivery; blob `put` usage from `src/lib/intake/storage.ts`.

**Test scenarios:**
- Happy path: seeded user with every domain populated → archive contains every domain file with correct counts + manifest.
- Happy path: brand-new user → archive with explicitly-empty domains (present, empty, listed in manifest) — not missing files.
- Edge case: user with uploaded PDFs → `files/` contains the original blobs referenced by manifest.
- Error path: third export within 24 h → 429 with `Retry-After`.
- Error path: blob upload failure → request marked `failed`, no download email sent, error surfaced.
- Error path: unauthenticated POST or download GET → 401.
- Error path: download GET by a different authenticated user → 403/404 (no ownership leak).
- Edge case: download after `expiresAt` → 410/expired state, archive not served.
- Integration: completed request row carries blobPath + expiresAt; the "export requested" notice email fires even when assembly later fails.

**Verification:** Real account in a prod-like env receives an email; the downloaded zip opens and contains every populated domain plus the manifest.

- [ ] **Unit 6: Account deletion — re-confirmation flow + ordered erasure (R8)**

**Goal:** Irreversible, complete, auditable account erasure with email re-confirmation.

**Requirements:** R8

**Dependencies:** Unit 4

**Files:**
- Create: `src/app/api/account/delete/request/route.ts`
- Create: `src/app/api/account/delete/confirm/route.ts`
- Create: `src/app/account/delete/confirm/page.tsx` (side-effect-free landing page for the email link)
- Create: `src/lib/account/delete.ts`
- Modify: `src/lib/auth/email.ts` (extract generic sender — see Unit 5)
- Test: `src/lib/account/delete.test.ts`
- Test: `src/app/api/account/delete/confirm/route.test.ts`
- Test: `src/app/account/delete/confirm/page.test.tsx` (shallow: GET renders confirm button, triggers no mutation)

**Approach:**
- Request route (POST): auth + typed-confirmation check → issue single-use deletion token (15 min, distinct HMAC domain-separation prefix) → email a link to the confirmation **page**. The page (GET) renders a final confirm button and performs no side effects — email scanners and preview bots fire GETs. The confirm **route** (POST) requires BOTH the token (atomic single-use consume, mirroring `verifyMagicLink`'s `updateMany(... consumedAt: null)` guard) AND an active authenticated session matching the token's user → executes erasure → clears the `mf_session` cookie in the response → goodbye state. Confirm against an already-`completed` tombstone is a no-op success (idempotent retry/double-click).
- Erasure (in `src/lib/account/delete.ts`): write `pending` tombstone → enumerate blobs (`SourceDocument.storagePath` ∪ non-null `ExportRequest.blobPath` — read before the transaction deletes those rows — ∪ paginated Blob `list()` on `uploads/<userId>/`, cursor loop for >1000; note `storagePath` holds full blob URLs while `list()` returns pathnames — `del()` accepts both, but don't compare the two namespaces directly) → `del()` each (first `del` usage in repo — add it; no-op on missing, so retry-safe) → on full blob success, one `$transaction` (explicit `timeout` ~20–30 s): grandchild deletes first (`PriorityMarker`, `PrioritiesAdjustment` via the user's `Priorities` ids), then the 13 no-cascade child deletes (SourceDocument delete cascades chunks + embeddings), then `user.delete()` (sweeps cascade-annotated models including Sessions), then the no-FK PII scrub (null the fields on `FunnelEvent.userId`, `LandingPageVisit.email`, `RawProviderPayload.userId` — keep the rows), then tombstone → `completed` with per-domain counts as the final statement.
- Session invalidation is achieved by the Session cascade (no separate delete); the route must clear the cookie and must not run any `getCurrentUser()`-dependent work after the transaction commits — the caller's session is dead mid-request.
- Any blob failure aborts before the DB transaction; tombstone stays `pending` (retryable); user sees an honest error.

**Execution note:** Test-first against a fully-seeded user — the completeness assertion is "zero rows referencing the userId in any table, zero blobs under the prefix, tombstone completed".

**Patterns to follow:** token issuance/verification in `src/lib/auth/magic-link.ts`; transaction style from `checkAndIncrementRateLimits`.

**Test scenarios:**
- Happy path: fully-seeded user (all 13+ relations, blobs, funnel rows, a completed ExportRequest with blob) → after confirm, residue assertion passes (below); tombstone `completed` with counts; PII scrubbed from FunnelEvent/LandingPageVisit/RawProviderPayload; export blob deleted.
- Happy path: tombstone survives — user row gone, tombstone row queryable with consentHeldAt + timestamps + ipHash.
- **Residue assertion (the completeness invariant):** an automated test against the real test DB (the harness already supports `$queryRaw` + `getTestPrisma`): post-deletion, (a) scan `information_schema` for every column named `userId`/`email` and assert zero rows match the deleted id/email (with an explicit carve-out for `EmbeddingBackfillState`, whose userId legitimately nulls); (b) scan FKs targeting `User.id` and assert each is cascade-covered or explicitly deleted; (c) walk FK chains one level deeper — tables whose only link to the user is via an intermediate (like `PriorityMarker` → `Priorities`) are invisible to (a)/(b), so the fully-seeded fixture must include every such grandchild and assert zero residue by direct count. Honest limitation: (a)/(b) are structural; (c) depends on the seed staying complete — the seed builder should derive from the schema, not a hand list.
- Error path: expired or already-consumed deletion token → 4xx, nothing deleted (atomic consume — a raced double-POST fires erasure exactly once).
- Error path: confirm POST with valid token but no active session (or session for a different user) → 401/403, nothing deleted.
- Error path: GET on the confirmation page/link → renders page, deletes nothing.
- Error path: blob `del` failure (mock) → DB untouched, tombstone `pending`, error surfaced; retry after blob success completes erasure.
- Error path: confirm without prior request → 4xx.
- Edge case: user with no documents/blobs → erasure completes (empty blob set is not a failure).
- Edge case: confirm when tombstone already `completed` → no-op success.
- Integration: confirmed deletion destroys the session via cascade and clears the cookie (subsequent authed call → 401).

**Verification:** Delete a seeded account in a prod-like env; verify zero residual rows/blobs and a surviving tombstone; sign-in afterwards behaves as a brand-new email.

- [ ] **Unit 7: Settings wiring + dead-control cleanup (R9)**

**Goal:** Settings Data section drives real export/delete; Account section shows the real email and no dead controls.

**Requirements:** R9, R7, R8

**Dependencies:** Units 5–6

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Test: existing route tests cover the APIs; add component-level coverage only if a harness already exists (none today — rely on the visual audit gate)

**Approach:**
- "Export my data" → POST export + status display (pending/complete-check-email/failed + retry). "Delete account" → typed-confirmation modal → request route → "check your email" state. Remove "Change password". Replace hardcoded `demo@morningform.com` with the session user's email.

**Test scenarios:**
- Covered at the API layer by Units 5–6. UI: visual audit (institutional gate) of all four states — idle, export pending, export failed, deletion-email-sent.

**Verification:** Visual walkthrough of Settings: every visible control does something real.

### Phase C — priorities reveal tail (calendar-gated)

- [ ] **Unit 8: PRIORITY_MARKERS_ENABLED flip + production verification (R3)**

**Goal:** The reveal goes live the moment clinical sign-off lands, verified in production.

**Requirements:** R3

**Dependencies:** Founder-owned R1–R2 (UK GP + US PCP sign-off documented; content `reviewerKey`/`lastReviewedAt` updated)

**Files:**
- Verify only: `src/app/reveal/priorities/page.tsx`, `content/priority-markers/*.ts` (reviewer fields updated as part of R2 content changes)

**Approach:**
- Set the env var with `vercel env add PRIORITY_MARKERS_ENABLED --value true --yes` (stdin piping silently fails — institutional learning) and confirm via `vercel env ls`; redeploy.
- Production verification per the "fixed means verified in prod" standard: complete a real assessment, confirm `/reveal/priorities` renders archetype markers (not the interstitial), and confirm the `priorities-to-intake-click` funnel counter still increments (shared Server Action across both variants).
- Rollback = unset the flag (interstitial returns; no data impact).

**Test expectation: none** — env-flip + manual prod verification; the page's flag branching is existing covered behavior.

**Verification:** Real prod assessment run shows priority markers; funnel event recorded; sign-off documented in the PR/notes.

## System-Wide Impact

- **Interaction graph:** Unit 1 makes `/home`'s check-in status and `/insights` reflect server state; Unit 6 is the first code path that deletes blobs or users — touches session handling (must destroy sessions) and every user-owned table.
- **Error propagation:** export/delete failures must surface to Settings honestly (failed states), never silent success; blob failure must abort DB deletion (no half-deleted accounts).
- **State lifecycle risks:** partial deletion is the top risk — mitigated by blob-first ordering + tombstone status + single `$transaction` for DB rows. Export archives in Blob are themselves user data: expire and clean them up (24 h), and include export blobs in the deletion sweep.
- **API surface parity:** Settings is the only UI consumer of the new endpoints; the external MCP server (`docs/plans/2026-05-12-002`) exposes user data — deletion removes the underlying rows and MCP tokens (cascade), which is the correct behavior.
- **Integration coverage:** the deletion completeness test (zero residual rows/blobs) is the one scenario unit mocks cannot prove — it runs against the real test DB per the existing harness.
- **Unchanged invariants:** `POST /api/check-in`'s contract is unchanged (additive validation only); `/reveal/priorities` flag branching is unchanged; magic-link sign-in flow is untouched (the deletion token reuses the pattern, not the route).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Deletion misses a table added later (schema drift) | Post-deletion residue assertion against information_schema (userId/email columns + FKs targeting User.id) — catches new tables structurally, including PII keyed on email with no userId column |
| Blob `list()` by prefix misses files written outside `uploads/<userId>/` | Union with `SourceDocument.storagePath` and `ExportRequest.blobPath` (read pre-transaction); deletion test asserts all three sources are swept |
| Deletion `$transaction` exceeds timeout on Neon (embedding cascades) | Explicit `timeout` ~20–30 s + matching route `maxDuration`; tune against a fully-seeded Neon branch; tombstone stays `pending` on rollback (clean retry) |
| Export archive too large / function timeout with many PDFs | `multipart: true` upload; set `maxDuration` (Hobby 60 s / Pro 300 s — check plan tier); observe real build time; add a retry path for `pending` requests if needed |
| Leaked export email exposes PHI archive | Download is a session-gated proxy (owner-only, 24 h expiry) — the email link alone grants nothing |
| Clinical sign-off slips (Unit 8) | Calendar-gated, zero coupling to Units 1–7; flag flip is a 10-minute task whenever sign-off lands |
| New prod routes 500 despite green build (bundling/runtime) | Cold-walk export + deletion + check-in POST in prod after deploy (institutional learning) |
| A real user checks in via localStorage-only path before Unit 1 ships | Ship Unit 1 first (it's the smallest); re-verify the no-users assumption at ship time (origin R6) |

## Documentation / Operational Notes

- Update `README.md` health-of-product notes if they mention check-ins/insights being local-only.
- After ship: `ce:compound` writeup of deletion ordering + blob cleanup (no institutional doc exists).
- Privacy posture: tombstone retention reasoning (Art. 5(2), incl. the salted IP hash on the tombstone) and embeddings-exclusion reasoning go in `docs/compliance/` as a short note **written in Unit 6's PR, as a merge gate** — not post-ship. The privacy-lawyer skim can follow, but the reasoning must exist before tombstones with an ipHash land in prod.
- Operational note: rotating `SESSION_SECRET` invalidates in-flight deletion-confirmation tokens (HMAC design inherited from magic-link) — users mid-flow must restart; acceptable, but worth knowing during any secret rotation.
- Visual audit gate applies to check-in, insights, and settings changes.

## Alternative Approaches Considered

- **`onDelete: Cascade` migration across all relations + naive `user.delete()`**: less code, but hides what was removed, complicates per-domain audit counts, and silently extends to future tables without review. Rejected for health data.
- **Deletion grace period (7–30 days `pending_deletion`)**: standard for consumer apps, but conflicts with the origin's prompt-hard-deletion decision; email re-confirmation covers the takeover risk at this scale. Rejected for now; revisit if support volume suggests accidental deletions.
- **Synchronous export download**: simplest, but multi-PDF archives can exceed serverless response limits and long builds risk timeouts mid-response. Rejected in favor of Blob + emailed link.

## Sources & References

- **Origin document:** docs/brainstorms/2026-06-04-first-session-completeness-requirements.md
- Related code: `src/app/api/check-in/route.ts`, `src/lib/auth/magic-link.ts`, `src/lib/intake/storage.ts`, `src/app/(app)/settings/page.tsx`, `prisma/schema.prisma`
- Related plans: `docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md` (R1–R3 gate), `docs/plans/2026-04-18-001-feat-insights-real-data-plan.md` (prior check-in persistence spec — superseded by this plan's Units 1–2)
- Institutional: `docs/solutions/best-practices/server-action-shared-cta-instrumentation-2026-05-11.md`, `docs/solutions/runtime-errors/vercel-env-add-stdin-silent-failure-2026-05-16.md`, `docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md`
- External: ICO right-of-access / portability guidance; Vercel function body-size limits
