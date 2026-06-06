---
title: "feat: From priority marker to blood draw — the get-tested path + concierge booking v1"
type: feat
status: active
date: 2026-06-06
origin: docs/brainstorms/2026-06-05-deck-product-gap-requirements.md
reviewed: 2026-06-06 (4-persona document review; revisions applied incl. two security P0s)
---

# feat: From priority marker to blood draw — the get-tested path + concierge booking v1

## Overview

Every "Next priority" card currently dead-ends at **"Upload a panel →"** — assuming the user already has results. This plan makes the card answer the user's actual question: *what is this test, and how do I get it?* Two stages with independent gates: (1) an honest **"Get this tested"** path on every marker card (what the test involves + the routes to obtain it) shipping with the priorities go-live under `PRIORITY_MARKERS_ENABLED`; (2) **concierge booking v1** (origin Phase C, R10–R14) under its own `CONCIERGE_BOOKING_ENABLED`: the user requests in-app, MorningForm ops arranges via the verified gift-code/voucher mechanic, the user reveals their redemption code **in-app behind their session** (never in email) and books their own draw under their own identity.

## Problem Frame

Trigger: the founder hit the dead-end personally — "02 / Next priority / hs-CRP / …" with no path to action. Verified in code: `src/app/reveal/priorities/priorities-client.tsx` (cards + the fixed "Upload your last blood panel →" form action) and `src/app/(app)/home/page.tsx` ("Upload a panel →" plain link — note: the home card has **no funnel counter today**; only the reveal surface counts) both hardcode `/intake`. No test-mechanics content (sample type, how to obtain) exists anywhere.

This pulls the origin's Phase C entry forward deliberately: the dead-end ships to real users at the priorities flag flip, so stage 1 joins that launch gate. Stage 2 carries the (now precisely characterized) legal gate.

## Requirements Trace

- R-A. Every priority-marker surface offers "How to get this tested" — that it's a blood test, the sample type, and the per-market routes — with upload demoted to the secondary action. Ships with `PRIORITY_MARKERS_ENABLED`.
- R-B (origin R10/R11). Concierge v1: in-app request (market confirmed, partner(s) **named on the form before submission** — Article 13 disclosure at collection) → ops arranges → user reveals the redemption code in-app → user books their own draw → status visible. User can **cancel any `requested` booking** before it's arranged.
- R-C (origin R12). Requests link the user's open `measure` Action when one exists; marker names always carried and **validated against the canonical marker set**.
- R-D (origin R13). No in-app payments; ops purchases. Money-from-user is out of product scope in v1.
- R-E (origin R14, precisely lightened). **No user-identifying data crosses to the lab** under the voucher mechanic — but the ops→partner boundary is characterized, not waved away: the partner learns MorningForm buys codes (and the test type, if codes are test-specific — prefer denomination codes where offered; verify Ulta's "de-identified only" claim in writing). Gate items before the concierge flag flips: legal confirmation of this analysis · DPIA data-category addendum (BookingRequest = health-intent data) · the five-item privacy-page update (below) · US state-law assessment (WA MHMDA etc.).
- R-F. US users in blocked states (NY/NJ/RI; AZ/HI per provider) get the honest fallback (GP + self-order guidance), never a broken request — and their state input is **validated then discarded, never persisted or logged**.

## Scope Boundaries

- No partner APIs, white-label checkout, or in-app payments. The Thriva-for-Partners CSV path (which WOULD send user data to a partner) is explicitly out — choosing it later reopens the full R14 gate, no precedent created here.
- The in-app status block is a **named Phase B timeline seed**: read-only list of the user's booking requests, no new nav entry, no state affordances beyond cancel + reveal-code; it collapses INTO the Decisions timeline when Phase B builds it, never beside it.
- `delivered` is **manual only** (ops or user marks it) — no upload-event matching (origin R9 territory; don't build).
- No admin UI; ops loop is reference-email + authenticated mechanism + runbook.
- Marketing panel pages, pricing display, studios presentation: out.

## Context & Research

### Relevant Code and Patterns
- Card surfaces: `src/app/reveal/priorities/priorities-client.tsx` (PANEL_LABEL, `trackIntakeClickAndRedirect` — counter semantics preserved on the upload path), `src/app/(app)/home/page.tsx` (`getTopPriorityMarker`; client component, no counter).
- Content: `content/priority-markers/{archetype}.ts` via `defineArchetypePriorities()` (Zod at import); `PriorityMarker` has no test-mechanics fields. **Static-copy QA scan roots are an allowlist** (`src/lib/compliance/static-copy.test.ts` SCAN_ROOTS) — new content locations must be ADDED to it or they're silently unscanned (review catch).
- Market: `User.signupMarket` nullable/attribution-scoped — confirm on the form, never trust.
- No sheet/modal primitive. **Detail view should be a route** (e.g. under the reveal segment) — it must serve both surfaces, and the home card lives in a large client component where inline expansion bloats (review recommendation upgraded from "decide later").
- Email: `sendEmail`; the delete-request route is the transactional pattern — note it creates the row BEFORE emailing, so its 502 leaves a row; booking chooses row-then-email-then-**delete-row-on-email-failure** + 502 (no orphan, ops always learns of every surviving row).
- Action linkage: `Action` model (`verb 'measure'`, `markerName?`); BookingRequest's optional `actionId` FK SetNull mirrors `Action.chatMessageId`'s pattern.
- GDPR guards: DMMF export completeness + deletion residue scans WILL trip on a new userId-bearing model — updating them means real export/erase coverage, not test-list edits (verified).
- `OPS_EMAIL`: new env; add to the production assert (fail-closed — a silently unset ops address means silently dropped bookings).

### External References (verified 2026-06-06; flags noted)
- **UK — Medichecks e-gift card**: official buy-for-someone-else mechanic (account-unbound codes, 12-month validity); free finger-prick / +£35 clinic / +£59 nurse; ~2-day turnaround; ~£19–£45 per marker; B2B affiliate program. Thriva-for-Partners = scale-up path (out of scope, see boundaries).
- **US — Ulta Lab Tests vouchers**: company buys, user redeems at 2,100+ centers, billing at redemption, purchaser sees de-identified data (**verify in writing before relying** — review). Quest blocks adult buy-on-behalf (home-kit ship is the fallback); Labcorp likely account-bound (flag).
- **US state blocks**: NY/NJ/RI all providers; AZ/HI provider-dependent. Platforms handle physician authorization.
- Re-verify at build: Thriva consumer gifting, Superdrug, Labcorp third-party, marketplace state lists, **whether each partner's codes are test-specific or denomination-based** (affects what the partner learns at redemption — review).

## Key Technical Decisions

- **Gift-code/voucher concierge, precisely characterized**: ops buys a code; the user redeems under their own identity. No user-identifying data flows MorningForm→lab. What DOES flow: the partner knows MorningForm purchases codes, and — if codes are test-specific — which tests MorningForm's users seek in aggregate. Prefer denomination codes; characterize the rest in the Unit 5 analysis. Results stay user↔lab until the user uploads them (closing the loop through intake).
- **Two independent flags, stated plainly**: Units 1–2 ship under `PRIORITY_MARKERS_ENABLED` (the detail view internally checks `CONCIERGE_BOOKING_ENABLED === 'true'` to show/hide route 1 — two independent flags by design). Units 3–4 are behind `CONCIERGE_BOOKING_ENABLED`, whose production flip is gated by Unit 5. Risk handled: if the concierge flag were flipped before Unit 3 deploys, the CTA would 404 — the flip checklist includes "Unit 3 deployed" and the CTA targets a stable route.
- **Three routes per marker**: (1) *MorningForm arranges it* (flag-on + market supported), (2) *through your GP/clinician* (always), (3) *order it yourself* (named partners + ballpark prices; **suppressed when `panelAvailability: 'neither'`** — GP route only). Upload becomes the secondary link (reveal-surface counter rides it unchanged; home never had one).
- **The ops channel carries no health data** (review P0): the ops email contains a **booking reference only**. Marker, market, and user identity are read by ops through the authenticated ops mechanism. Resend's documented "no health data content" invariant holds; the ops inbox stores nothing erasure-relevant.
- **The redemption code is never in email** (review P0): the "it's ready" email links to the in-app status block; the code reveals once behind the user's session (the export-download posture applied consistently). Runbook covers partner-side revocation if an account is compromised with an unredeemed code outstanding.
- **Ops auth has a defined floor**: a dedicated credential — either a CLI script using a server-side `OPS_SECRET`, or an endpoint gated on a DB-set ops-role flag that cannot be self-served. Never "any authenticated session". The status-update abuse case (any user arranging bookings / triggering code emails) is structurally excluded and tested.
- **Test-mechanics in the content layer**: additive Zod fields + a `content/test-routes/` module **added to SCAN_ROOTS** (review: the scan is an allowlist; unlisted = unscanned). All new copy enters the clinical-advisor packet.
- **BookingRequest model, minimized**: `userId` (Cascade), `markerNames` (canonical-validated), `market`, `status: requested|arranged|delivered|cancelled` (delivered = manual), optional `actionId` (SetNull), timestamps. **No `usState` column** — state is validated for blocking then discarded (review). **Retention**: `markerNames` nullified when a request reaches `delivered`/`cancelled` (status/market/timestamps retained for ops history); stated on the privacy page; legal confirms the schedule.
- **Terminology**: user-facing artifact = **redemption code**, everywhere (emails, UI, runbook); "gift card/voucher" is the ops-side purchase term only.

## Open Questions

### Resolved During Planning
- Concierge mechanic per market → verified gift-code/voucher patterns (above).
- Sub-processor/DPA question → no user-identifying data crosses; boundary characterized in Unit 5; no DPA, but DPIA addendum + named-partner disclosure required.
- Ops notification content → reference-only email + authenticated detail read (above).
- Code delivery → in-app authenticated reveal (above).
- Detail view form → a route serving both surfaces (above).
- Email-failure semantics → row deleted + 502 on ops-email failure (no orphan; tested).

### Deferred to Implementation
- Exact `content/test-routes/` copy (prices ballpark; advisors review register).
- Ops mechanism: CLI-with-OPS_SECRET vs ops-role endpoint — either, within the auth floor above.
- Blocked-state list per provider (re-verify at build; quarterly check noted in runbook).

### Deferred to Legal (Unit 5 packet)
- Legal basis for BookingRequest processing: Article 6(1)(b) performance-of-contract vs 6(1)(a) consent (determines whether the form needs a consent capture).
- Confirmation of the boundary analysis + the retention schedule + WA-MHMDA-class state-law assessment.

## Implementation Units

- [x] **Unit 1: Test-mechanics content layer**

**Goal:** Every marker knows what the test involves and how to obtain it per market.

**Requirements:** R-A

**Dependencies:** None

**Files:**
- Modify: `src/lib/priority-markers-schema.ts` (additive: sample type, fasting note, obtain-route keys), `src/types/index.ts`, all `content/priority-markers/*.ts` (backfill), `src/lib/compliance/static-copy.test.ts` (**add `content/test-routes` to SCAN_ROOTS** + a planted-phrase characterization test for the new root)
- Create: `content/test-routes/` module (per-market partner copy: Medichecks/Thriva UK; Ulta/Quest-home-kit US; GP route; blocked-state copy)
- Test: content schema tests; scan stays green over the new copy

**Approach:** Additive Zod fields with defaults (no migration churn); descriptive register only ("a standard venous blood draw; no fasting needed") — never directive; pricing copy is ballpark by construction. All of it joins the clinical-advisor packet.

**Test scenarios:**
- Happy path: every archetype validates; every marker resolves guidance for both markets.
- Error path: missing required field fails at import (build-time).
- Edge case: `panelAvailability: 'neither'` → GP route only (route 3 suppressed: no partner offers it).
- Integration: scan covers the new root (planted forbidden phrase in a fixture is caught).

**Verification:** A test prints the full get-tested sheet for hs-CRP in both markets.

- [x] **Unit 2: "Get this tested" surface + CTA rewrite (joins the priorities go-live gate)**

**Goal:** The dead-end becomes the path on both surfaces.

**Requirements:** R-A, R-F

**Dependencies:** Unit 1

**Files:**
- Modify: `src/app/reveal/priorities/priorities-client.tsx`, `src/app/reveal/priorities/actions.ts` (reveal counter semantics preserved), `src/app/(app)/home/page.tsx` (plain link → detail route; no counter existed, none claimed)
- Create: the marker detail **route** + components (serves both surfaces; home is a client component where inline expansion bloats)
- Test: server-action/funnel test updates; content-to-view resolution test

**Approach:** Primary CTA → "How to get this tested →" (detail route). View renders: the marker's rationale, what the test involves, then the routes in order — route 1 only when `CONCIERGE_BOOKING_ENABLED === 'true'` and market supported; route 2 always; route 3 unless `neither`. Secondary: "Already have recent results? Upload them →" → `/intake`. Blocked-state copy is explicit and kind.

**Test scenarios:**
- Happy path: hs-CRP detail shows blood-draw copy + UK routes for a UK user.
- Edge case: concierge flag off → route 1 absent, layout intact.
- Edge case: `neither` marker → GP route only.
- Integration: reveal counter still increments on the upload path.

**Verification:** Visual audit (institutional gate) of card + detail, both markets, both flag states. **This unit is on the priorities go-live checklist.**

- [x] **Unit 3: Booking request flow (`CONCIERGE_BOOKING_ENABLED`)**

**Goal:** "MorningForm arranges it" works to the ops hand-off, with disclosure and minimization built in.

**Requirements:** R-B, R-C, R-D, R-F

**Dependencies:** Units 1–2

**Files:**
- Modify: `prisma/schema.prisma` (BookingRequest per the minimized decision — no usState), `src/lib/account/export.ts` + `src/lib/account/delete.ts` (real domain + sweep coverage), both structural guard tests, `src/lib/env.ts` (`OPS_EMAIL` + production assert)
- Create: request form (on the detail route), cancel affordance, `src/app/api/booking/request/route.ts` (+ cancel endpoint or method) + colocated tests
- Test: mirrors the delete-request pattern + the specifics below

**Approach:** Form: marker(s) pre-filled (canonical-validated server-side), market confirm (pre-fill `signupMarket`), **partner(s) for the market named on the form** ("we arrange this via Medichecks" / "one of our partner labs: Ulta Lab Tests") — Article 13 at collection; US flow asks state, blocks NY/NJ/RI(+) inline with guidance, and **discards the state value** (never persisted, never logged, never emailed). POST: flag-gated, auth, rate-limited (failures don't consume slots), create `requested` row → **ops email with booking reference ONLY** → user confirmation email (no code promises; names the partner; links the status block; mentions cancel). Ops-email failure → row deleted + 502 (no orphan). Cancel: `requested → cancelled`, user-initiated, idempotent.

**Test scenarios:**
- Happy path: UK request → row created, ops email contains the reference and NO marker/identity, user confirmation sent, open measure Action linked.
- Error path: flag off → 404; unauthenticated → 401; non-canonical marker → 400; blocked state → 422 + guidance, no row/emails/logs of the state.
- Error path: ops email fails → 502, zero rows.
- Happy path: cancel before arranged → `cancelled`, visible; cancel after arranged → rejected (409).
- Integration: GDPR — seeded BookingRequest exports in its domain and erases in the sweep.

**Verification:** Dev request produces a reference-only ops email; the authenticated ops read shows the full details.

- [x] **Unit 4: Ops fulfillment loop + status (the Phase B timeline seed)**

**Goal:** The redemption code reaches the user safely; state is visible; ops works from a runbook.

**Requirements:** R-B, R-F (runbook documents blocked-state handling)

**Dependencies:** Unit 3

**Files:**
- Create: ops mechanism (CLI/OPS_SECRET or ops-role endpoint — within the auth floor) covering: read request details, mark `arranged` (storing a code **reference**; raw code encrypted-at-rest or held only for the one-time reveal — named decision at build, documented), mark `delivered`/`cancelled`; `docs/runbooks/concierge-booking-fulfillment.md` (per-partner purchase steps, denomination-code preference, SLA, blocked states, **revocation steps**, and the markerNames-nullification retention step)
- Create/Modify: the status block on the detail route ("Your test requests" — read-only seed of Phase B's timeline: list + cancel + one-time authenticated **code reveal**; no nav entry), "ready" email (links in-app, carries NO code)
- Test: transitions (requested→arranged→delivered; requested→cancelled; delivered→requested rejected; arranged→cancelled rejected or defined), **non-ops authenticated user attempting a status update → rejected**, code reveal requires the owning session

**Approach:** Ops marks `arranged`; the user's "ready" email links to the status block; the code reveals once in-app. `delivered` is manual (ops or user). markerNames nullified at terminal states per the retention decision.

**Test scenarios:** (as in Files/Test above — transitions incl. cancel, ops-auth floor, owner-only reveal, retention nullification on terminal state)

**Verification:** Full dry-run: request → reference email → ops reads details via the mechanism → (sandbox) code purchase → arranged → user reveals code in-app → manual delivered → markerNames nullified.

- [ ] **Unit 5: Legal/disclosure packet item (gates the concierge flip)**

**Goal:** The precisely-lightened R14 gate is satisfied before `CONCIERGE_BOOKING_ENABLED` flips in production.

**Requirements:** R-E

**Dependencies:** None (parallel; hard-gates Units 3–4's production flip)

**Files:**
- Create/Modify: compliance note (the boundary analysis: what the partner learns incl. the test-specific-code question; what MorningForm retains + the retention schedule; the reference-only ops channel; the in-app code-reveal posture), DPIA data-category addendum (BookingRequest markerNames = health-intent data), privacy page — **five enumerated items**: (1) the new processing purpose, (2) the legal basis (per the deferred-legal determination), (3) the new data category, (4) partners named as recipients, (5) the retention schedule
- Plus: WA-MHMDA-class state-law assessment for US concierge

**Approach:** One packet, one legal cycle, shared with the DPIA/consent and clinical-review material already in flight. The concierge flip checklist requires every item signed.

**Test expectation: none** — process unit; enforcement is the flip checklist.

**Verification:** Written confirmations recorded before the flag flips.

## System-Wide Impact

- **Interaction graph:** two priority surfaces + intake (secondary) + Action linkage; reveal funnel counter unchanged on the upload path.
- **Error propagation:** blocked states and unsupported markets degrade to guidance; ops-email failure deletes the row + 502; cancel is always available pre-arranged.
- **State lifecycle risks:** raw codes never in email or logs; reference-only ops channel; markerNames nullified at terminal states; the seed status block reads the same rows Phase B's timeline will.
- **API surface parity:** MCP unaffected (allowlist).
- **Unchanged invariants:** Resend carries no health data content (preserved by design); priorities content review flow; intake; Action semantics.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Partner policy/price drift (gift terms, state lists, code specificity) | Ballpark copy; runbook owns specifics; build-time re-verification of all research flags; quarterly check |
| Concierge flag flipped before Unit 3 deploys | Flip checklist includes "Unit 3 live"; CTA targets a stable route that 404s harmlessly in the gap |
| Guidance copy drifts directive | Descriptive register + scan root added + advisor review; pricing/redemption copy gets explicit scan attention |
| Ops bottleneck at volume | Accepted at current scale; Thriva-for-Partners documented as the (gate-reopening) scale-up |
| Unredeemed code outstanding after account compromise/deletion | Runbook revocation steps with the partner; code held for one-time reveal only |
| Unit 2 misses the priorities go-live | Units 1–2 are content-led and small; sequence first; go-live checklist gains the item |

## Sources & References

- **Origin:** docs/brainstorms/2026-06-05-deck-product-gap-requirements.md (R10–R14)
- Related: docs/plans/2026-06-05-clinical-review-go-live-plan.md (advisor packet), docs/plans/2026-06-05-001-feat-ask-deep-phase-a-plan.md (Action model), docs/compliance/ (DPIA, sub-processor register, data-rights note)
- Code: src/app/reveal/priorities/, src/app/(app)/home/page.tsx, src/lib/priority-markers-schema.ts, src/lib/compliance/static-copy.test.ts, content/priority-markers/
- External: Medichecks gift-card/B2B docs, Thriva for Partners, Ulta employer vouchers, Quest FAQs, NY/NJ/RI direct-access restrictions, WA MHMDA
