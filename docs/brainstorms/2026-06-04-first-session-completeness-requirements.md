---
date: 2026-06-04
topic: first-session-completeness
---

# First-Session Completeness — finish what's already in users' hands

## Problem Frame

The Phase 0 SEO/GEO funnel is live and routes real visitors into the authed product. The health-record spine (assessment → intake → record → ask) works end-to-end, and the May priority-markers pivot removed the supplement-protocol legacy. But three verified gaps mean a first paying customer still hits half-built surfaces in their first week:

1. **The assessment payoff is gated off.** `/reveal/priorities` — the payoff promised to users who take the 8-minute assessment — shows an interstitial because `PRIORITY_MARKERS_ENABLED` is off. Since the May lead-gen redesign the funnel is signup-first and the assessment is optional personalisation, so this affects the assessment-opt-in cohort rather than every new user — but for that cohort it is an 8-minute investment ending in a "coming soon" wall. Content for all 6 archetypes is authored (`content/priority-markers/`) but has only internal editorial review (`reviewerKey: 'morning-form-editorial'`, 2026-05-10). The plan's hard gate — UK GP + US PCP review — has not started.
2. **Check-ins never reach the server.** `src/app/(app)/check-in/page.tsx` writes only to `localStorage`; the existing `POST /api/check-in` is never called. `/insights` is therefore permanently empty for every real user, and check-in data is lost across devices. (Finding F6 from the 2026-05-10 authed-product audit, still open.)
3. **GDPR data rights are absent.** No `/api/account` routes exist. Settings → Data renders export/delete affordances with no backing implementation — UK GDPR Articles 15 and 17 obligations we visually imply but cannot deliver.

This brainstorm scopes the work to close all three. It is deliberately "finishing what's already in users' hands" — no new product directions.

## Requirements

**Priorities Reveal Go-Live**

- R1. Founder engages the UK GP and US PCP reviewers now (week of 2026-06-04) against the existing `content/priority-markers/*.ts` files. The hard gate from the pivot plan (R11) stays: no production flag flip before both sign-offs.
- R2. Reviewer notes are addressed in the content files; sign-off is documented (per-archetype `lastReviewedAt`/`reviewerKey` updated, sign-off recorded in the flag-flip PR).
- R3. Once both sign-offs land, `PRIORITY_MARKERS_ENABLED=true` is set in Vercel production and the interstitial path is retired. The flag flip is verified with a real production assessment run showing priority markers, not just the env change.

**Daily-Use Loop: Persist Check-ins**

- R4. Submitting a morning/evening check-in saves to the user's account server-side (the existing check-in API), so data survives across devices and sessions. LocalStorage may remain as an optimistic cache, but the server is the source of truth. The server validates submissions (e.g., rejects implausibly future/past dates) so insights data cannot be poisoned by a buggy or malicious client.
- R5. `/insights` renders from real persisted check-in data for any user who has checked in, on any device. The read path already exists (`src/lib/hooks/use-insights-data.ts` fetches the check-in, weekly-review, and health-history APIs), so R5 is largely satisfied once R4 lands — the remaining work is verifying `/insights` renders gracefully for a check-in-only user whose wearable/health-history arms are empty.
- R6. No migration of historical `localStorage` check-ins — no real users depend on them.
- R10. Settings preferences (notifications, protocol timing / wake–wind-down) persist server-side via the existing `UserPreferences` model instead of localStorage-only, so preferences survive across devices like the rest of the account.

**GDPR Data Rights**

- R7. "Export my data" produces a complete downloadable archive of the user's data: account, assessment responses, state profile, check-ins, chat messages, health connections and synced health data points, shared-view tokens, uploaded documents, and record/graph content (intake essentials are ingested into the record at submit time, not stored separately — they are covered by the record/graph content, not a distinct category). The export must not silently deliver a partial archive: empty domains are explicitly empty, and any failure to assemble a domain is surfaced rather than omitted. The endpoint is rate-limited.
- R8. "Delete my account" fully erases the user's data and records an auditable deletion event that survives the deletion. Deletion requires explicit re-confirmation beyond an active session (mechanism chosen in planning). Erasure covers: database rows; uploaded files in Vercel Blob (enumerated before row deletion — blob-deletion failures must not be silently swallowed); derived artifacts (embeddings and graph nodes — embeddings are only reachable transitively via source documents); and PII held in analytics rows with no User foreign key (`FunnelEvent.userId`, `LandingPageVisit.email`). The audit event must live in a table that does not cascade with the User row (the existing audit models do) and retains minimal proof that consent was held and erasure completed.
- R9. Settings contains no dead controls in the touched sections: export and delete (Data section) are wired to the real implementations, and any affordance that cannot apply (e.g., "Change password" in the Account section under passwordless magic-link auth) is removed rather than left inert.

## Success Criteria

- A new production user who signs up and skips the assessment can: upload a document → check in → see `/insights` populate — with no dead buttons or data loss across devices.
- A user who opts into the assessment additionally sees real priority markers at the reveal — no interstitial.
- Clinical sign-off (UK GP + US PCP) is documented before the flag flips; the flip is verified in production per the "fixed means verified in prod" standard.
- A user can self-serve a complete data export and a full account deletion from Settings.

## Scope Boundaries

- **No new features or directions** — this is completion work on existing surfaces.
- **Wearables follow-through is out of scope** (Whoop/Oura/Fitbit credential testing, Garmin direct approval, Apple Health iOS path) — separate workstream already planned in the direct-provider platform plan.
- **Stripe / preview tier / lifecycle emails stay paused** per the standing eng pause pending Phase 0 traffic data.
- **IA cleanup (Tier 3 of the May audit)** stays deferred until usage data exists.
- Open issues #90 (demo narrative coherence) and #84 (activation funnel design questions) are not bundled here.

## Key Decisions

- **Keep the clinical review gate hard; start the review now**: engineering (R4–R9) proceeds in parallel so the flag flips the moment sign-off lands. Chosen over a UK-only partial release or ship-then-review — the gate exists for regulatory exposure reasons and the parallel track removes most of its schedule cost.
- **Consent is already solved** — the lazy-consent redesign (`User.llmConsentAcceptedAt`, 412 + `requiresConsent` on LLM routes) closed the May audit's F5/F14 findings; no consent work in this scope.
- **R1–R3 stay in scope despite the opt-in funnel**: the assessment is optional since the May lead-gen redesign, so the reveal gate affects the opt-in cohort, not every user — but anyone who invests 8 minutes must get a real payoff, and starting the clinical review costs little founder time. Decision 2026-06-04.
- **Settings preferences persistence (R10) included**: pure completion work — the `UserPreferences` model already exists; the Settings page just doesn't use it. Decision 2026-06-04.
- **Deletion is hard deletion with an audit event**, not soft-delete/retention — the posture that honestly delivers Article 17. Note it is not mechanically simple today: ~13 User relations in `prisma/schema.prisma` have no `onDelete: Cascade`, so a naive `user.delete()` fails on foreign-key constraints — planning must choose between a cascade migration and an explicit ordered delete transaction.

## Dependencies / Assumptions

- Clinical reviewer availability is the schedule risk for R1–R3; it is founder-owned and does not block the engineering requirements.
- Assumption (verified 2026-06-04): no real production users have meaningful localStorage-only check-in history worth migrating. Re-verify at R4 ship time — the live funnel can create such users at any moment.
- Prior plan `docs/plans/2026-04-18-001-feat-insights-real-data-plan.md` already specifies check-in persistence; planning for R4–R5 should start from it rather than re-invent.

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Technical] Export archive format and delivery (synchronous download vs. emailed link) — pick whatever the existing stack supports simply, mindful that raw PDFs may exceed serverless response limits.
- [Affects R7][Product] Are derived vector embeddings in-scope for the data-subject export, or only user-supplied and directly attributable data?
- [Affects R8][Technical] Cascade-migration vs. explicit ordered delete transaction; exact erasure order across Postgres, Vercel Blob, and pgvector embeddings.
- [Affects R8][Technical] Which identifying fields may legally remain on the surviving deletion-audit record (hashed email? opaque id?) to satisfy GDPR accountability after Article 17 erasure.
- [Affects R8][Technical] Authoritative source for a user's complete blob-key list — intake PDF paths are not all recorded in `SourceDocument.storagePath`.
- [Affects R4][Technical] Whether check-in writes stay optimistic-local-first with background sync or go server-first, and how stale local entries are reconciled or cleared after server sync.

## Next Steps

→ `/ce:plan` for structured implementation planning (engineering track R4–R9 can start immediately; R1 runs in parallel as a founder action).
