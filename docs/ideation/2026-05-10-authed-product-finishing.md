# Ideation — what needs to be finished when logged in as a user

Created: 2026-05-10
Status: open
Trigger: post-Phase 0 SEO/GEO ship; founder asked "what needs to be finished when logged in as a user" before first paying customer arrives.

## Frame

Phase 0 of the SEO/GEO funnel is live in production. Marketing surfaces send visitors → `/onboarding` → `/assessment` → `/reveal` → `/setup` → `/home`. If channels 1+2 deliver a paying customer in week 4, that customer lands in this product. The question is: will they hit something confusing, regulatory, or visibly half-built within their first session?

Honest read: **yes, several things, and one is strategic-not-tactical.**

## The strategic finding

The authed product is **two products glued together**.

- The **personal-health-record spine** — `/intake → /record → /topics → /graph → /ask` — is real, polished, and in line with the brand voice the marketing pages establish ("see what your numbers actually mean").
- The **previous-gen "personalized supplement protocol" MVP** still owns the onboarding climax. `/reveal/protocol` and `/protocol` surface compounds and milligrams as the user's first deliverable (e.g. `L-Tyrosine + Alpha-GPC, 500mg + 300mg, before breakfast`, with `evidenceTier: 'strong'`). `/guide` is a hardcoded keyword-match pseudo-assistant pushing the same content. The home-page header gear icon links to `/guide`. The `/reveal/begin` "next step" button says "Talk to our guide →".

Either we are the personal-health-record company or the personalized-protocol company. The marketing chose the former; the reveal flow says the latter. **Whichever the founder picks, the other side has to be removed**, not left for a future cleanup pass.

Same architectural mismatch shows up in the regulatory exposure that originally warranted the Phase 1 legal review: the supplement-protocol output is already shipped, and the SEO funnel now drives visitors into it.

## Raw findings (16)

Inventory by an authed-surface scanner agent on 2026-05-10. Severity calibrated against "would a paying customer notice in their first session" (Blocker / Major / Minor).

### Pre-app onboarding flow

- **F1 — Pre-app routes are unauthenticated and ungated.** [src/app/onboarding/page.tsx](src/app/onboarding/page.tsx), [src/app/assessment/page.tsx](src/app/assessment/page.tsx), [src/app/setup/page.tsx](src/app/setup/page.tsx). No session check; logged-out users can fill assessment to completion and only fail at submission. Major / Eng.
- **F2 — `/setup` renders mock protocol items, persists wake/wind-down only to `localStorage`.** Hardcoded against `mockProtocolItems`; no `/api/preferences` POST; same in `/settings`. Notifications + protocol-timing settings are fictional. Major / Eng. Evidence: [src/app/setup/page.tsx:9](src/app/setup/page.tsx#L9), [src/app/(app)/settings/page.tsx:27-29](src/app/(app)/settings/page.tsx#L27).
- **F3 — Reveal stack recommends specific supplements + dosages by default.** Every new user lands on `/reveal/protocol` naming compounds and milligrams. Combined with the consent screen on `/onboarding`, reads as a clinical recommendation. **Blocker / Strategy → Content + Eng.** Evidence: [src/lib/protocol-engine.ts:14-58](src/lib/protocol-engine.ts#L14), [src/app/reveal/protocol/page.tsx:53-67](src/app/reveal/protocol/page.tsx#L53).
- **F4 — "View alternative protocol" CTA is a permanent disabled stub.** [src/app/reveal/begin/page.tsx:28-30](src/app/reveal/begin/page.tsx#L28). Minor / Design.
- **F5 — Consent acceptance recorded only client-side.** `mf_consent_llm_accepted_at` in `localStorage`. No `User.acceptedConsentAt` column. "Withdraw consent" in Settings → Privacy has no row to flip. No auditable consent record. Major / Eng. Evidence: [src/app/onboarding/page.tsx:10-15](src/app/onboarding/page.tsx#L10).

### Daily-use surfaces

- **F6 — Check-ins never reach the server.** `/check-in` writes to `localStorage`; the existing `POST /api/check-in` is never called. `/insights` GETs the same endpoint and is therefore empty for every real user. Blocker / Eng. Evidence: [src/app/(app)/check-in/page.tsx:72-86](src/app/(app)/check-in/page.tsx#L72).
- **F7 — `/you` Connected Devices badges are hardcoded fiction.** Whoop and Oura always render with green "connected" dots regardless of `health_connections`. Major / Eng. Evidence: [src/app/(app)/you/page.tsx:51-61](src/app/(app)/you/page.tsx#L51).
- **F8 — `/you` "Sign Out" button has no `onClick`.** The terminal alert-styled button users will reach for first does nothing; working sign-out is buried at `/settings`. Major / Eng. Evidence: [src/app/(app)/you/page.tsx:87-89](src/app/(app)/you/page.tsx#L87).
- **F9 — Settings → Account: Change password / Export my data / Delete account are no-op buttons.** Pure visual; no handlers, no API. GDPR Article 15 + 17 affordances are absent. Major (regulatory) / Eng. Evidence: [src/app/(app)/settings/page.tsx:143-145, 168-173](src/app/(app)/settings/page.tsx#L143).
- **F10 — `/guide` is a hardcoded keyword-match Eliza recommending compounds, while `/ask` is the real assistant.** Three canned responses about "L-tyrosine + Alpha-GPC". Home gear icon and `/reveal/begin` route to `/guide`. Two products in one nav, one is a fake. Blocker / Strategy + Eng. Evidence: [src/app/(app)/guide/page.tsx:34-52](src/app/(app)/guide/page.tsx#L34).
- **F11 — Intake "staged documents drop on reload" is exposed to the user.** Documents staged via drag-and-drop live as `File` objects in non-persisted Zustand. Refresh = lost PDFs. No per-doc upload progress on the FinishBar either. Major / Eng. Evidence: [src/lib/intake/store.ts:6-10](src/lib/intake/store.ts#L6), [src/components/intake/finish-bar.tsx:22-80](src/components/intake/finish-bar.tsx#L22).

### Cross-cutting

- **F12 — Bottom-nav IA mismatch.** `/topics/*` activates the **record** tab, but topics are reached primarily from `/graph`. Tab goes inactive on tap. `/intake` and `/ask` have no nav surface; only home seed-bar entries. Major / Design. Evidence: [src/app/(app)/path-to-tab.ts:8-19](src/app/(app)/path-to-tab.ts#L8).
- **F13 — `/insights` is a half-orphaned route.** No nav entry. Only entrance is a conditional home card that depends on HRV data which depends on F6 being fixed. Calls itself "Week in review" — a third name for the surface. Major / Strategy → Eng. Evidence: [src/app/(app)/insights/page.tsx:97-99](src/app/(app)/insights/page.tsx#L97).
- **F14 — Verify-link sign-in skips consent + setup.** Verify route redirects onboarded users to `/record` and un-onboarded users to `/assessment`, bypassing `/onboarding` (consent) and `/setup` (preferences). On a second device a user never sees the consent screen. Major / Eng. Evidence: [src/app/api/auth/verify/route.ts:62-66](src/app/api/auth/verify/route.ts#L62).

### Polish

- **F15 — Topic stub state has no path forward beyond "add a lab".** Empty-state prose with no link to `/intake` or `/check-in`. Minor / Design + Eng. Evidence: [src/app/(app)/topics/[topicKey]/page.tsx:248-261](src/app/(app)/topics/%5BtopicKey%5D/page.tsx#L248).
- **F16 — `/settings/integrations` polls every 5 seconds while open.** ~720 fetches/hour per backgrounded tab. Minor / Eng. Evidence: [src/app/(app)/settings/integrations/page.tsx:88-109](src/app/(app)/settings/integrations/page.tsx#L88).

## Survivors (7 moves)

After clustering and adversarial filtering, seven moves cover the 16 findings. Tiered by "what blocks first paying customer."

### Tier 1 — must finish before first paying customer (~9 days eng)

- **Move 1 — Strip the supplement-protocol legacy.** Delete `/reveal/protocol`, `/protocol`, `/guide`, `src/lib/protocol-engine.ts`, `src/lib/mock-data.ts`. Replace `/reveal` climax with the honest health-record framing. Route `/guide` → `/ask`. **Strategic call first**: kill the supplement-protocol product line OR keep it as a real product (with Phase-1-style legal review). Cannot be finessed by engineering alone. Fixes F3 + F4 + F10 + part of F12. ~4–5 days incl. content. Owner: founder strategy decision → eng + content.
- **Move 2 — DB-persist check-ins, consent, preferences.** Move `mf_consent_llm_accepted_at`, `mf_checkin_*`, `mf_preferences` from `localStorage` to Postgres via existing models or new ones. Restores `/insights` to real data. Closes the DPIA consent-trail gap. Fixes F2 + F5 + F6. ~3 days eng.
- **Move 3 — GDPR right-to-export + right-to-delete.** Implement `POST /api/account/export` (zip of user data) and `POST /api/account/delete` (cascade + audit log). Wire dead Settings buttons. Fixes F9. ~3 days eng. **Depends on Move 2** — no point exporting `localStorage` data.

### Tier 2 — visible polish that signals "we shipped this carefully" (~3 days eng)

- **Move 4 — First-paint credibility pass.** Wire `/you` Sign Out + Whoop/Oura badges to real data. Fix verify route to land on `/onboarding` (not skip consent + setup). Improve intake staged-docs UX (warn before navigation; consider draft persistence). Fixes F7 + F8 + F11 + F14. ~2 days eng.
- **Move 5 — Auth-gate pre-app pages.** Add session check to `/onboarding`, `/assessment`, `/setup`, `/reveal/*`. Currently logged-out users can fill assessment to completion and fail at submission. Fixes F1. ~half day eng. **Cheapest win on the list.**

### Tier 3 — defer until traffic data tells us where users actually go

- **Move 6 — IA cleanup.** Decide `/insights` (kill or restore + persist). Decide `/topics` nav-tab assignment. Decide `/intake` + `/ask` discoverability beyond home cards. Fixes F12 + F13. **Worth deferring** because the right answer depends on usage data we don't have.
- **Move 7 — Topic stub affordance.** Link from topic stub state to `/intake`. Fixes F15. Trivial; can roll into next IA pass.

## Adversarial filter — what survived and why

- **Why Move 1 is Tier 1, not Tier 2:** the supplement-protocol legacy is the single thing on this list that exposes the company regulatorily AND reads as "two products" to a careful customer. It's also the move with the most architectural reach (deletes 3 routes + 2 lib files). Cannot be deferred without accepting that risk publicly.
- **Why Move 2 is Tier 1:** without it, `/insights` is a permanent empty state for every paying customer, AND there's no auditable consent trail. Either alone would justify Tier 1.
- **Why Move 3 is Tier 1, not Tier 2:** UK-GDPR Articles 15 (right of access) and 17 (right to erasure) are compulsory for any service collecting personal data. The current state — buttons that exist visually but do nothing — is worse than not having them, because it implies we offer rights we don't.
- **Why Move 5 is Tier 2 not Tier 1 even though it's a half-day fix:** auth-gating pre-app routes hardens against a user accidentally filling out the assessment logged out, but doesn't break for the common case. Cheap, visible, lands soon, but doesn't block first paying customer the way Move 1–3 do.
- **Why Tier 3 is deferred:** Move 6 (IA cleanup) is real but the right call depends on data we don't have. Decide after we see whether `/insights` actually gets traffic via the home card. Move 7 is a one-liner that rolls into the next IA pass.

## What I rejected

Several lower-leverage findings I considered but did not surface as ideas:

- **F16 (settings/integrations 5s polling)** — real perf nit, not customer-facing, defer until we have actual users to show the load.
- **"Add a daily-streak badge to /home"** — kind of idea that pads a list. No real customer pain; pure decoration.
- **"Add a brand-color customization in Settings"** — speculative; ignore.

## Recommended next move

**Brainstorm Move 1 next.** The supplement-protocol legacy is the strategic call that gates everything else in Tier 1. Until the founder commits to "we are the personal-health-record company, the protocol stack is gone" OR "we are the personalized-protocol company, the SEO funnel is wrong," every other authed-product fix is fixing the wrong half.

Once Move 1 is decided, Moves 2 + 3 + 4 + 5 fall out as a clean engineering plan that runs in parallel with founder distribution (channels 1+2). The pause on Phase 1 (U5–U9 Stripe / preview tier / lifecycle emails) stays in effect.

## Linked artifacts

- Phase 0 SEO/GEO plan: [docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md](docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md)
- Phase 0 ship: PR #96 (`bf99540`), PR #97 (`5d9631c`)
- Brainstorm acquisition: [docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md](docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md)
