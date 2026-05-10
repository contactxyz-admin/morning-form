# Brainstorm requirements — Pivot post-assessment deliverable from supplements to priority markers

Created: 2026-05-10
Status: ready-to-plan
Origin: [docs/ideation/2026-05-10-authed-product-finishing.md](docs/ideation/2026-05-10-authed-product-finishing.md) (Move 1)

## Frame

**The problem.** Phase 0 of the SEO/GEO funnel ([docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md](docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md)) is live in production and positions Morning Form as a personal-health-record product (translate your numbers into plain English). It explicitly defers the Supply (supplements) layer of the deck thesis until Supply is launch-ready (DSHEA, fulfillment, refund policy, etc.).

But the authed product surface still ships the previous-gen "personalized supplement protocol" MVP as the climax of onboarding. After consenting to LLM processing on `/onboarding`, every user is routed to `/reveal/protocol` which surfaces named compounds at milligram precision (e.g. `L-Tyrosine + Alpha-GPC, 500mg + 300mg, before breakfast`, with an `evidenceTier: 'strong'` label). The same content powers `/protocol` (a daily-view), `/guide` (a hardcoded keyword-match assistant), and `/setup` (a daily-timeline preview).

This is a regulatory exposure (FDA SaMD criteria around clinical decision support; UK MHRA equivalents; FTC truth-in-claims for health products), a credibility issue (two products glued together: PHR + Supply, with the user landing in the deferred half), and a conversion issue (the onboarding climax routes nowhere — the deliverable IS the destination, not a path to `/intake` where the actual product lives).

**The decision.** Pivot the post-assessment deliverable from supplement protocols to **priority biomarker recommendations** — same surface architecture, same archetype/state-profile assessment system, fundamentally different output. The user lands on a personalized list of "the markers worth measuring for someone like you" with a primary CTA into `/intake` to upload an existing panel or order a new one.

**Why now.** A paying customer in week 4 of channels-1+2 outreach lands on the current onboarding flow today. Tier-1 of the authed-product finishing list ([docs/ideation/2026-05-10-authed-product-finishing.md](docs/ideation/2026-05-10-authed-product-finishing.md)) cannot proceed until this product-identity question is answered.

## Strategic context (carried forward)

- The deck thesis — Form Intelligence + Supply + Care — sequences Form Intelligence as the wedge.
- Phase 0 + Phase 1 marketing/funnel work is built around Form Intelligence.
- Supply is a real product line that Morning Form intends to launch eventually, with proper DSHEA review and fulfillment infrastructure. **This brainstorm is about removing it from the user-facing surface during the pre-launch period, not killing it as a long-term product line.**
- Care is similarly deferred (Path A regulatory posture: tech-first, no public clinician).

## Decisions

### D1 — `/reveal/protocol` becomes a priority-markers output
The post-assessment deliverable is a personalized list of biomarkers worth measuring, ordered by impact-on-symptom for the user's archetype. **No compounds, no dosages, no supplement names.** The output reads as data-acquisition guidance, not intervention guidance.

### D2 — Output format (3–5 markers, ranked, one-sentence rationale each)
Each priority marker carries:
- Marker name (e.g. "Ferritin", "Free testosterone", "ApoB")
- One-sentence "why this matters for someone like you" tied to assessment answers
- A category tag (e.g. "iron", "hormones", "cardiovascular") for grouping
- An indication of whether a typical UK or US private-blood-test panel includes it (helps users decide which provider to use)

3–5 markers is the right cardinality: short enough to feel digestible, long enough to feel personalized. Ordering by impact-on-symptom (not alphabetically) signals the priority recommendation.

### D3 — Primary CTA drives `/intake`
The post-reveal action is "Upload your last blood panel" (if user has one) or "Order one of these panels" (with links to UK and US private-test providers — Medichecks, Thriva, Quest, LabCorp, etc.). Routes directly to `/intake`. **The deliverable is no longer the destination; it's the on-ramp to data upload.**

### D4 — Reuse the existing assessment + archetype system
Don't throw away the `AssessmentResponse` → `StateProfile` → archetype mapping. The assessment questions still produce useful signal about the user's likely concerns (energy, hormones, longevity, recovery, etc.). What changes is the OUTPUT mapping: archetypes map to priority-marker sets instead of compound stacks. The assessment itself does not change.

### D5 — Schema: rename `Protocol` → `Priorities`, `ProtocolItem` → `PriorityMarker`
The existing tables have the right shape (per-user, versioned, rationale string, items list). Rename + repurpose rather than throw away. `ProtocolItem.compounds` becomes `PriorityMarker.markerName`; `dosage` field deleted; `timeSlot`/`timeLabel` deleted; new fields `category` + `panelAvailability`. **Implementation detail belongs in the plan; the decision is "reuse the table shape."**

### D6 — Retire `/guide` (redirect to `/ask`)
The `/guide` surface is a hardcoded keyword-match assistant pushing the same supplement content. Redirect `/guide` → `/ask`. Update the home gear icon's link from `/guide` to `/settings` (the obvious target). Update `/reveal/begin`'s "Talk to our guide" CTA to "Open your record" or similar.

### D7 — `/protocol` is repurposed, not deleted
`/protocol` becomes "your priority markers over time" — a versioned history of the user's priority-marker recommendations as the assessment is updated or new panels arrive. **Concrete shape and timing belong in the plan.** The route stays in IA; the page content rewrites.

### D8 — Clinical review is required before shipping
The priority-marker output is the kind of personalized health interpretation that — even though it's data-acquisition guidance, not intervention guidance — should be reviewed by a UK GP and a US-licensed PCP before shipping to real users. Two questions for each reviewer:
1. Are the priority markers per archetype clinically sensible?
2. Is anything in the rationale copy that an FDA / MHRA / FTC reviewer might consider "providing medical advice"?

Cheap insurance. Same review pattern as the [Anchor #1 fatigue-in-men](content/marketing/uk/fatigue-in-men.ts) content.

### D9 — Editorial-QA gate (existing) catches the regulatory line
The forbidden-phrases scanner ([src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts)) and the static-copy test ([src/lib/compliance/static-copy.test.ts](src/lib/compliance/static-copy.test.ts)) already catch drug names, dose strings, and imperative-treatment language. Extend the test's scan to cover the new priority-markers content + the rewritten `/reveal/*` pages. CI gates on this.

### D10 — Migration: backfill or accept loss
There is 1 production `Protocol` row and effectively zero real users with active protocols (Phase 0 just shipped). Accept the data loss as part of the rename — i.e., truncate the table, run the schema rename, no migration script. **Deferred to plan.** If the production count is non-zero on the day of the rename, revisit.

## Scope boundaries — NOT in scope

- **Building Supply as a real launched product.** DSHEA review, fulfillment, supplier contracts, refund policy. That's a future Phase, not Move 1. This brainstorm removes Supply from the user-facing surface during pre-launch; it does not retire the product line.
- **A new clinical-recommendation engine.** Reuse the existing assessment + archetype taxonomy. Output mapping is the only thing changing.
- **Per-user clinician feedback loop on priority markers.** Path A regulatory posture stays — no public clinician advisor on the page itself.
- **Marketing-page changes.** Phase 0 marketing pages are correct as-shipped (they already position Morning Form as the data company). No copy edits to `content/marketing/uk/fatigue-in-men.ts` or `content/marketing/us/fatigue-in-men.ts`.
- **Phase 1 work (U5–U9).** Stripe Subscription, preview tier, lifecycle emails are still gated on Phase 0 traffic data. Move 1 is authed-product polish, not Phase 1 build.
- **Daily-protocol-tracking UX.** No "did you take your supplements today?" check-in. The existing `/check-in` morning/evening flow stays as it is.

## Success criteria

1. **Regulatory.** Zero compound names, zero dose strings, zero supplement product names anywhere in the post-assessment surface. Editorial-QA gate green on every commit.
2. **Coherence.** A user landing post-assessment can answer "what is this product for me?" with "data — they're going to translate my biomarker values once I upload some" within 30 seconds of viewing `/reveal/priorities` (the new surface).
3. **Conversion.** Onboarding-completion-to-intake conversion stays at or above the current rate (we don't have data yet, so this is a forward-looking commitment to monitor; instrumentation should land alongside the change).
4. **Clinical sign-off.** UK GP review + US PCP review of the priority-marker output complete before production deploy. Both reviewers' notes addressed.
5. **Migration.** The single existing Protocol row is either backfilled or explicitly accepted as discarded with a one-line audit log.
6. **No regressions.** Existing routes (`/intake`, `/record`, `/topics`, `/graph`, `/ask`) untouched. Marketing surfaces (`/uk`, `/us`, `/uk/fatigue-in-men`, `/us/fatigue-in-men`) untouched.

## Open questions (deferred to plan)

- **Exact mapping of archetypes to priority-marker sets.** Eight archetypes in the current `protocol-engine.ts`; we need the 3–5 marker recommendation per archetype. This is content/clinical work, not engineering. **Owner: founder + clinical reviewer.**
- **`/protocol` repurpose detail.** "Priority markers over time" is the direction; what does the page actually show on day 1, when there's only one snapshot? Does it default-redirect to `/reveal/priorities` until a second snapshot exists? **Owner: design.**
- **Provider links from priority markers.** Which UK and US lab providers do we link to? Affiliate vs neutral? This is a small business-decision-with-product-implications. **Owner: founder.**
- **Naming.** "Priority markers" vs "priorities" vs "next markers" vs "your test panel." Plan time. **Owner: copy.**
- **Whether `/setup` (daily timeline preview) survives.** It's tied to the supplement-protocol UX and would render an empty/awkward state under priority-markers. My instinct: retire `/setup` from onboarding entirely, fold the wake/wind-down preference into `/settings` (where it already partially lives via F2). **Owner: design.**

## Linked artifacts

- Authed-product finishing ideation: [docs/ideation/2026-05-10-authed-product-finishing.md](docs/ideation/2026-05-10-authed-product-finishing.md) — this brainstorm closes Move 1 of the seven-move list.
- Phase 0 SEO/GEO plan: [docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md](docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md) — provides the strategic positioning this aligns with.
- Phase 0 marketing brainstorm: [docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md](docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md) — establishes the Form Intelligence wedge.
- Existing supplement-protocol surfaces (to retire / rewrite):
  - [src/lib/protocol-engine.ts](src/lib/protocol-engine.ts) — archetype-to-stack mapping
  - [src/lib/mock-data.ts](src/lib/mock-data.ts) — `mockProtocolItems` + `guideResponses`
  - [src/app/reveal/protocol/page.tsx](src/app/reveal/protocol/page.tsx) — current reveal climax
  - [src/app/(app)/protocol/page.tsx](src/app/%28app%29/protocol/page.tsx) — daily-view
  - [src/app/(app)/guide/page.tsx](src/app/%28app%29/guide/page.tsx) — keyword-match assistant
  - [src/app/setup/page.tsx](src/app/setup/page.tsx) — daily-timeline preview

## Recommended next move

**`/ce:plan` to turn this brainstorm into an implementation plan.** Open questions above + the "concrete shape and timing" deferrals are exactly what planning is for. The plan should also surface the dependency chain across the broader authed-product finishing list (Tier 1 Moves 2 + 3 + 4 land cleanly only after Move 1 is locked).
