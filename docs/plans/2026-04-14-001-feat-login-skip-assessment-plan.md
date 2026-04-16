---
title: Login that skips the self-assessment
type: feat
status: active
date: 2026-04-14
---

# Login that skips the self-assessment

## Overview

Add a lightweight email-based "login" that signs the user in as the pre-seeded `demo@morningform.com` account (already carrying a full `AssessmentResponse`, `StateProfile`, and `Protocol`) and routes them directly into the authenticated app shell at `/home`, bypassing `/onboarding` and `/assessment`.

This is deliberately a **dev-grade sign-in**, not a production auth system. It's meant to let the developer (and soon, demo viewers) skip the 8-minute intake when returning to the running app.

## Problem Frame

Today the landing page ([src/app/page.tsx](src/app/page.tsx)) routes every visitor into `/onboarding` → `/assessment`, even though the seeded demo user has a completed assessment in the database. All server routes already resolve the current user via `getOrCreateDemoUser()` ([src/lib/demo-user.ts](src/lib/demo-user.ts)) — there is no session concept. The only thing missing is a UI entry point that says "I already have an account, take me straight to the app."

## Requirements Trace

- R1. A user can reach `/home` from the landing page without going through `/onboarding` or `/assessment`.
- R2. The flow uses the existing seeded demo user and its assessment/profile/protocol — no re-seeding, no new data.
- R3. If an account with the submitted email does not have a completed assessment, the user is routed through the existing assessment flow instead of landing on `/home`.
- R4. Nothing in the existing authenticated routes needs to change to resolve the "current user" — the single-tenant `getOrCreateDemoUser()` pattern keeps working.

## Scope Boundaries

- No password, no OAuth, no magic links. Email-only, trusted-on-input.
- No NextAuth / Auth.js integration.
- No multi-user support in downstream routes (the 11 API routes that call `getOrCreateDemoUser()` stay as-is for now).
- No changes to the assessment, protocol, or check-in flows themselves.

### Deferred to Separate Tasks

- Real authentication (password / magic link / OAuth): **superseded by `docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md` U0a (magic-link via Resend) + U0b (signed session cookie + `Session` table + middleware).**
- Migrating `getOrCreateDemoUser()` call sites to a session-aware `getCurrentUser()` helper: **also covered by U0b**, which introduces `getCurrentUser()` on signed-session lookup and adds an ESLint rule forbidding re-importing the demo helper in `src/app/api/**`.

### Composition with the health-graph pivot (U0a, U0b, U17)

Once the pivot plan begins, this plan's redirect logic is **not deleted but re-ordered** to compose with real auth + the first-login migration. After the pivot:

- The current `/api/auth/login` handler is replaced by `/api/auth/verify` (U0a magic-link verify route).
- The signed-session cookie `mf_session_email` is replaced by the U0b signed session backed by the `Session` table.
- The post-verify handler evaluates in this order (see deepened-plan System-Wide Impact → "First-login migration composes with assessment-gating cookie"):
  1. **Session creation** (U0b): `createSession(userId)` sets the signed cookie.
  2. **U17 new-user predicate**: `isNewUser(userId)` returns true iff zero rows in `HealthDataPoint`, `CheckIn`, `ProtocolItem`, `ProtocolAdjustment`, and `AssessmentResponse`. New users skip migration enqueue entirely (their `GraphMigrationState` rows are written with instant `completedAt`).
  3. **This plan's redirect** (data-driven): `user.assessment && user.stateProfile` → `/home` else `/assessment`. Unchanged semantics; still R3.
  4. **Migration-banner suffix** (U17): if step 2 enqueued jobs, append `?migrating=1` to whatever step 3 chose. The banner appears on both `/home?migrating=1` and `/assessment?migrating=1` — it never overrides the assessment-gating decision.

**Consequence.** This plan's contract (data-driven redirect) survives the pivot. What changes: (a) the cookie/token implementation switches from plain-string to HMAC-signed + DB-backed; (b) the demo-fallback in `getCurrentUser()` is removed — unauthenticated ingestion routes hard-fail with 401 rather than silently resolving to the demo user; (c) the redirect logic runs **after** the U17 predicate rather than before. No new R-requirements; R1–R4 remain intact.

## Context & Research

### Relevant Code and Patterns

- Landing CTA: [src/app/page.tsx:22-29](src/app/page.tsx#L22-L29) — today hard-links to `/onboarding`.
- Onboarding: [src/app/onboarding/page.tsx](src/app/onboarding/page.tsx) — 3-slide intro then `/assessment`.
- Demo user resolver: [src/lib/demo-user.ts](src/lib/demo-user.ts) — upserts by email.
- Seed: [prisma/seed.ts](prisma/seed.ts) — creates `demo@morningform.com` with assessment + profile + protocol.
- Settings page displays the current email: [src/app/(app)/settings/page.tsx:149](src/app/(app)/settings/page.tsx#L149).
- 11 API routes currently call `getOrCreateDemoUser()` (see grep in planning notes).

### Institutional Learnings

- None in `docs/solutions/` yet (directory is empty).

## Key Technical Decisions

- **Cookie-based "session" holding the logged-in email.** Signed-in state is a single `httpOnly` cookie (`mf_session_email`) set by a POST to `/api/auth/login`. Keeps the implementation ~50 lines and removes no future optionality — a real auth layer can replace this cookie with a real session token later.
- **Reuse `getOrCreateDemoUser()` shape, swap in `getCurrentUser()` only at the entry points that matter (login, landing redirect).** Don't churn all 11 API routes in this plan. The new `getCurrentUser()` helper reads the cookie and falls back to the demo user when absent, so existing callers that imported the demo helper keep working.
- **Post-login routing is data-driven, not flag-driven.** After login, check `user.assessment` and `user.stateProfile`. If both exist, redirect to `/home`. Otherwise redirect to `/assessment`. This satisfies R3 without a new "onboardingComplete" column.
- **Landing page shows both CTAs.** "Begin assessment" (new user) and "Sign in" (returning). Keeps the existing hero copy intact.
- **No password field.** Email-only, pre-filled with `demo@morningform.com`. Reason: this is a dev login and every public instance is currently single-tenant.

## Open Questions

### Resolved During Planning

- Should we introduce NextAuth? → No. Scope is a bypass, not real auth.
- Do we need a new DB column? → No. Existence of `AssessmentResponse` + `StateProfile` already encodes "onboarded."

### Deferred to Implementation

- Exact copy for the sign-in page (headline, helper text). Use the existing landing voice.
- Whether the sign-in link lives in the header or below the hero CTA — decide visually against the live design.

## Implementation Units

- [ ] **Unit 1: Session helper and cookie**

**Goal:** Centralize "who is the current user" behind a helper that reads a cookie, falling back to the demo user.

**Requirements:** R2, R4

**Dependencies:** None.

**Files:**
- Create: `src/lib/session.ts`
- Modify: `src/lib/demo-user.ts` (re-export `getCurrentUser` as the preferred helper; keep `getOrCreateDemoUser` for now)

**Approach:**
- `getCurrentUser()` reads `mf_session_email` from `cookies()` (Next 14 server helper). If present, find-or-upsert a user with that email. If absent, call `getOrCreateDemoUser()`.
- Export `setSessionCookie(email)` and `clearSessionCookie()` as thin wrappers around `cookies().set/delete` with `httpOnly`, `sameSite: 'lax'`, `secure` in production, 30-day expiry.

**Patterns to follow:**
- Mirror the upsert shape already in [src/lib/demo-user.ts](src/lib/demo-user.ts).

**Test scenarios:**
- Happy path: cookie set to `demo@morningform.com` → `getCurrentUser()` returns the seeded user with relations resolvable.
- Edge case: cookie absent → `getCurrentUser()` returns the demo user (backwards-compatible with current callers).
- Edge case: cookie holds an unknown email → user is created (matches existing upsert semantics) and returned.

**Verification:**
- Unit-level smoke via a temporary route or a `tsx` script; no call-site churn yet.

- [ ] **Unit 2: `/api/auth/login` and `/api/auth/logout` routes**

**Goal:** Provide the POST endpoints the sign-in UI will call.

**Requirements:** R1, R3

**Dependencies:** Unit 1.

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`

**Approach:**
- `POST /api/auth/login` accepts `{ email: string }`, validates with `zod` (already a dep), upserts the user, sets the session cookie, and returns `{ redirectTo: '/home' | '/assessment' }` based on whether `assessment` and `stateProfile` exist.
- `POST /api/auth/logout` clears the cookie and returns `{ redirectTo: '/' }`.

**Patterns to follow:**
- Existing API route style in `src/app/api/health/connect/route.ts` (zod + `NextResponse.json`).

**Test scenarios:**
- Happy path: POST with `demo@morningform.com` → cookie set, response `redirectTo: '/home'`.
- Integration: POST with a fresh email → user created, response `redirectTo: '/assessment'` (no assessment yet).
- Error path: POST without email or with malformed body → 400.
- Happy path: POST to `/logout` → cookie cleared, response `redirectTo: '/'`.

**Verification:**
- `curl` round-trip against the dev server on port 3847 confirms cookie set/clear and correct redirect targets.

- [ ] **Unit 3: `/sign-in` page**

**Goal:** Minimal UI entry point matching the existing landing aesthetic.

**Requirements:** R1

**Dependencies:** Unit 2.

**Files:**
- Create: `src/app/sign-in/page.tsx`

**Approach:**
- Client component. Single email `<input>` pre-filled with `demo@morningform.com`, one submit button, one "Back" link. On submit: `fetch('/api/auth/login', ...)`, then `router.push(redirectTo)`.
- Use existing `Button` and typography tokens from `src/components/ui/` and `globals.css`.

**Patterns to follow:**
- Layout and motion echo [src/app/onboarding/page.tsx](src/app/onboarding/page.tsx).

**Test scenarios:**
- Happy path: submit with prefilled demo email → lands on `/home` with full protocol visible.
- Edge case: submit an empty email → button disabled or inline error, no network call.
- Error path: server returns 400/500 → inline error message, no redirect.

**Verification:**
- In-browser run on [http://localhost:3847/sign-in](http://localhost:3847/sign-in): fill, submit, land on `/home` without passing through `/assessment`.

- [ ] **Unit 4: Landing page entry point + Settings sign-out**

**Goal:** Make the new flow discoverable and reversible.

**Requirements:** R1

**Dependencies:** Unit 3.

**Files:**
- Modify: `src/app/page.tsx` (add a secondary "Sign in" link near the primary CTA)
- Modify: `src/app/(app)/settings/page.tsx` (add a "Sign out" button that POSTs to `/api/auth/logout` and routes to `/`)

**Approach:**
- Landing: a subtle text link under the "8 minutes · free · no commitment" caption, e.g. "Already have an account? Sign in." Link to `/sign-in`.
- Settings: a small danger-styled button at the bottom of the existing account section.

**Patterns to follow:**
- Existing typography scales (`text-caption`, `text-body`) and `Button` component.

**Test scenarios:**
- Happy path: from `/`, click "Sign in" → `/sign-in` → `/home`.
- Happy path: from `/settings`, click "Sign out" → cookie cleared, router lands on `/`, refreshing `/home` redirects back to landing (or proceeds as demo user, depending on Unit 1 fallback — confirm observed behavior matches the fallback decision).

**Verification:**
- Manual browser walkthrough on port 3847 covering: landing → sign-in → home → settings → sign-out → landing.

## System-Wide Impact

- **Interaction graph:** All 11 API routes keep calling `getOrCreateDemoUser()` unchanged. The new `getCurrentUser()` only runs inside the auth routes and the sign-in page for now.
- **Error propagation:** Login failures stay local to `/sign-in` (inline error). Cookie absence is a non-error (fallback to demo).
- **State lifecycle risks:** None — no new persistent state. Cookie is self-expiring.
- **API surface parity:** Two new routes under `/api/auth/*`. No existing routes change shape.
- **Unchanged invariants:** Single-tenant behavior of the app is preserved. The demo user remains the default identity when no session cookie is present.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Someone mistakes this for real auth. | Name the cookie `mf_session_email`, document in code comments that this is a dev bypass; add a TODO in `src/lib/session.ts` pointing to the future real-auth plan. |
| Future real-auth work has to rip this out. | `getCurrentUser()` is the seam — real auth swaps its implementation, the call sites don't change. |
| A fresh email routes to `/assessment` but the user expected to land in demo. | Pre-fill the sign-in field with `demo@morningform.com` and keep the landing link copy explicit ("Sign in as demo"). |

## Documentation / Operational Notes

- Update [README.md](README.md) "Local development" section with the shortcut: after `npm run db:seed`, visit `/sign-in` to skip the intake.
- Note the port change: the project is now running on [http://localhost:3847](http://localhost:3847) in the running session; README still references 3000 — worth updating in the same PR.

## Sources & References

- Landing page: [src/app/page.tsx](src/app/page.tsx)
- Onboarding: [src/app/onboarding/page.tsx](src/app/onboarding/page.tsx)
- Demo user helper: [src/lib/demo-user.ts](src/lib/demo-user.ts)
- Seed: [prisma/seed.ts](prisma/seed.ts)
- Schema: [prisma/schema.prisma](prisma/schema.prisma)
