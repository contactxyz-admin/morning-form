---
date: 2026-04-21
topic: mvp-validation
audience: Morning Form team, prospective investors/advisors
---

# Morning Form — Narrow MVP + Validation Metric

## Problem Frame

Jonathan Selby's 16 April 2026 feedback (R1, R6) argues the business as pitched is too broad — app, marketplace, studios, supplement brand, wearable brand, B2B — and that there is no hard evidence yet of market size, willingness to pay, or retention. He recommends narrowing to a bite-sized MVP and modelling unit economics from real data.

The narrow MVP already exists in code. What does not yet exist is a **falsifiable definition of "working"** — a small set of metrics that, measured against a specific cohort, would tell us the narrow MVP is worth expanding behind. This memo defines that MVP statement and the validation metrics.

## What the MVP Actually Is (today, in code)

Morning Form v1 is: *a private health record that turns a user's own wearable and lab data into specialist AI conversations, with every claim traceable back to the user's own data, and automatic handoff to their GP for anything outside scope.*

Surfaces in production:
- Intake (lab PDFs, medical history, essentials) — `src/app/(app)/intake/*`
- Wearable ingestion (Oura, Whoop, Fitbit, Apple Health, Terra aggregator) — `src/lib/health/*`
- Health knowledge graph (typed nodes + edges, provenance) — `src/lib/graph/*`
- Specialist chat with per-topic scribes (iron, sleep-recovery, energy-fatigue) — `src/lib/scribe/*`
- Topic pages and insights — `src/lib/topics/*`, `src/app/(app)/topics/*`, `src/app/(app)/insights/*`
- Citations as navigable chips into the record — `src/components/mention/*`

Explicitly **not** in code (and not in MVP scope): marketplace, physical studios, Morning Form supplements, Morning Form wearables, B2B corporate wellness. These stay on the vision deck, not in the codebase, until the metrics below pass.

## Requirements — MVP Definition

- **M1.** MVP target user: a digitally-engaged adult (initial focus: men under 40, matching the pitch's early-adopter hypothesis) who already has (a) a connected wearable with ≥30 days of data and (b) at least one recent blood panel PDF. This is the population the product is actually differentiated for.
- **M2.** MVP value promise: "Bring your data in once; get specialist-grade conversations grounded in it, and know when to see a GP instead." No promise of recommendations, optimisation protocols, or supplement advice. The wellness positioning (see `docs/brainstorms/2026-04-21-regulatory-posture-requirements.md`) is load-bearing.
- **M3.** MVP deliberately excludes: any affiliate commerce, any Morning Form-branded product, any B2B surface, any clinician-facing features, any UK-patient-record API integration beyond patient-held exports.

## Requirements — Validation Metrics

Two metrics, sequenced. B2 is a precondition for B1 being interpretable.

**B2 — Data-grounded answer rate (product-quality gate)**

- **V1.** Instrument the citation rate of specialist answers: percentage of non-out-of-scope, non-rejected answers that cite at least one graph node from the user's own record.
- **V2.** Target: ≥70% of specialist answers carry ≥1 user-specific citation within the first 4 weeks of a cohort's enrolment.
- **V3.** Rationale: below this, the product is a chatbot whose answers could have come from ChatGPT. The distinctive claim is "specialist conversation about MY data." The metric checks that claim directly.
- **V4.** Instrumentation relies on the `citations` field already carried through `BubbleModel` and the chat turn log. No new data model required.

**B1 — Paid-conversion cohort (commercial gate)**

- **V5.** Recruit an early-adopter cohort of 30-50 users matching M1. Recruitment channel: targeted outreach (not broad social), because the economics Jonathan is skeptical of are channel-dependent and we want a clean first read.
- **V6.** Headline metric: proportion of the cohort that starts a paid subscription within 30 days of completing 3+ specialist conversations grounded in their own data. Threshold hypothesis: **≥20% conversion.**
- **V7.** Supplementary metrics (tracked, not hurdle): 30-day activation rate (% completing the onboarding-to-first-specialist-answer funnel), weekly active specialist conversations per converted user, 60-day retention of converted cohort. These feed Jonathan's R7 unit-economics model if/when we build it.
- **V8.** Pricing point is a tested variable, not a decision to make up front. Start with one price anchor (TBD; £9-£15/mo band is the default to test against) and vary only if conversion is ambiguous.

**Sequencing.** B2 runs first on the current user base (no new recruitment required; data exists). B1 runs after B2 clears V2, not in parallel. If B2 fails, B1 is uninterpretable — we would be measuring conversion of a product that is not yet differentiated.

## Requirements — What We Are *Not* Measuring in MVP

- **NM1.** We are not measuring "engagement" (DAU, session length, messages sent). Engagement without the data-grounded answer rate is ChatGPT with extra steps.
- **NM2.** We are not measuring supplement attach rate, AOV, or referral rate. None of those surfaces are in code, and they can't be commercially validated from a product that doesn't have them.
- **NM3.** We are not yet producing a full three-year cost/revenue model (R7). That is a follow-on artifact once B1 and B2 give it real assumptions to stand on. Modelling unit economics against invented numbers is the exact thing Jonathan criticised.

## Decisions

- **D1.** The MVP is the narrow specialist-record product as it stands in April 2026. No broadening until metrics pass.
- **D2.** Validation runs B2 → B1 in sequence, not in parallel.
- **D3.** Recruitment for B1 is targeted, not broad social. CAC experiments come after conversion is proven on the warm cohort.
- **D4.** Pricing and channel economics are downstream of B1 clearing. Jonathan's R7 unit-economics model becomes a committed artifact the day B1 reports out.

## Open Questions (deferred to implementation / next review)

- Q1. Does B2 measure citation rate at the turn level or the answer-level? Definition needs to survive cases where a single specialist answer references multiple nodes.
- Q2. Who is the right recruitment source for the B1 cohort? (Candidates: personal network among early-adopter segment; paid Oura/Whoop user communities; existing Morning Form beta list.) Choice affects how cleanly B1 reads.
- Q3. At what cohort size and elapsed time does a B1 miss become a real "no" vs. noise? Pre-commit the stopping rule before recruitment starts to avoid post-hoc rationalisation.
- Q4. Do we need an opt-in usage-analytics pipeline before B2 can report? (If all chat turns are already persisted to the chat history store, the answer is no and instrumentation is a query; if not, there's a small build.)

## References

- MVP surfaces: `src/app/(app)/intake/*`, `src/app/(app)/topics/*`, `src/app/(app)/insights/*`, `src/app/api/chat/send/route.ts`
- Specialist + citations pipeline: `src/lib/scribe/execute.ts`, `src/lib/topics/compile.ts`, `src/components/mention/mention.tsx`
- Regulatory posture that defines the product promise: `docs/brainstorms/2026-04-21-regulatory-posture-requirements.md`
- Original pivot framing: `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`
