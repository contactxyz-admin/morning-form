---
date: 2026-05-06
topic: acquisition-anchor-pages
window: 12 weeks
target: first 30 signups
audience: men 25-50 (UK)
strategy: 1-2 anchor SEO/GEO pages + light outreach
---

# Acquisition: anchor-page strategy for first 30 signups (12-week window)

## Problem Frame

Morning Form is in private beta with **zero real signups**. The product is built; the funnel script (PR #83) is shipped but has nothing to measure. The bottleneck is distribution, not engineering.

The honest scope for this artifact is the *first 30 signups in ≤90 days* — a window where SEO can plausibly contribute, full-programmatic content cannot, and engineering scope must stay subordinate to acquisition learning. Ten pages, programmatic templates, and measurement infrastructure are correctly scoped for *first 300* in 6 months — that work earns its complexity once one anchor page proves traffic + conversion.

**This brainstorm answers: what's the smallest, safest, highest-leverage acquisition system we can stand up in 12 weeks, that doesn't compromise the regulatory posture and that we can actually learn from?**

## Decision Frame

**Locked decision:** Option B — 1–2 anchor SEO/GEO pages + light founder outreach. Engineering: medium. Programmatic scaling deferred until the anchor proves the loop.

Rejected: Option A (4-week pure outreach) — the brief asks for compound traffic and SEO/GEO surfaces that outlive the launch effort. Option B does outreach AND seeds the anchor; Option A skips the seed. Rejected: Option C (full programmatic system) — multiplying zero, premature scale, and a much larger surface for clinical-safety drift.

## Regulatory Frame (Load-Bearing)

Every page below is gated on G1–G7 ([docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](2026-04-21-regulatory-posture-requirements.md)):

- G1: No specific drug names
- G2: No dose strings
- G3: No imperative treatment ("you should take...", "treat your X with Y")
- G4: Out-of-scope routes to GP-prep
- G5: Classification-driven UI (clinical-safe vs out-of-scope visibly differentiated)
- G6: Topic scoping (no mission creep into untested domains)
- G7: Provenance requirement (every numeric claim cites the user's data or a peer-reviewed/NHS source)

**The framing that stays inside G1–G7:** *"We organize your health data and show you what to discuss with your GP."* Not *"we tell you what's wrong and what to do."*

The brief's "*how to increase testosterone naturally*" page is rejected outright — it crosses G3 and G6. So is any page with supplement rankings, "best protocol for X," or "treat your Y with Z." These pages may rank well on Google but they pull Morning Form onto the SaMD side of the line.

**Operationally:** every page concept below is tagged `safe`, `gated`, or `out-of-scope`. Only `safe` pages ship in the 12-week window. `Gated` pages need explicit clinical-safety review per page. `Out-of-scope` pages don't ship.

## Requirements Trace

- **R1** Anchor page #1 ranks in top-10 organic for at least one high-intent UK query within 12 weeks.
- **R2** Anchor page #1 converts ≥5% of organic visitors into a free data upload.
- **R3** Free uploads convert ≥30% to paid (£39 one-time *or* £19/mo subscription) within 14 days of upload.
- **R4** First 30 paying signups within 90 days from anchor page + outreach combined.
- **R5** Every shipped page passes a clinical-safety review against G1–G7 before publishing. Zero exceptions.
- **R6** Pages are designed for AI-answer-engine surfacing (GEO): question-led headings, direct answers, structured FAQ, sourceable claims.
- **R7** A measurement system tracks (a) organic + AI-engine traffic, (b) page→upload conversion, (c) upload→pay conversion. Internal dashboard, not public-facing.
- **R8** The anchor-page→upload→interpretation→pay flow works end-to-end for at least one query class (`private-blood-test-results`).
- **R9** A second anchor page can be produced from a reusable template in ≤2 days of editorial work.
- **R10** No supplement rankings, no drug-name pages, no imperative-treatment language, no dose strings — across every page.

## Scope Boundaries

**In scope (12 weeks):**
- 1 fully-built anchor page (R1–R3)
- 1 sketch-quality second anchor page (R9 validation, ships in week 8–10)
- The free-upload + interpretation summary + paywall flow (R8)
- A measurement system for organic + AI-engine + conversion (R7)
- A clinical-safety review process the team runs per page (R5)
- A reusable page template + lightweight schema (R9)
- Founder outreach to ≥30 cohort-fit men in network (parallel acquisition channel)

**Not in scope (deferred to follow-up plans):**
- The 10 pages in the brief's initial-priority list — pick 2 from this set, defer the other 8
- Programmatic page generation across biomarkers × symptoms × cohorts
- A full CMS for content authoring
- Per-cohort sub-funnels in the activation funnel script (single funnel for now)
- A subscription product (test £39 one-time first; subscription comes after pricing validation)
- Wearable-signal pages (no "low HRV" page yet — high regulatory ambiguity, defer)
- All `gated` and `out-of-scope` page concepts from the taxonomy below

**Not in scope ever (regulatory):**
- "How to increase X naturally" / treatment recommendations
- Supplement comparisons or rankings
- "Best protocol for X" pages
- Anything that stages MorningForm as a GP replacement rather than a GP-prep tool

---

## Output 1 — Prioritized Taxonomy

Eight cohorts from the brief × three page types (`results-explainer`, `cohort-overview`, `query-direct-answer`) = 24-cell matrix. Ranked by `(R safety) × (R intent) × (R fit-with-upload-loop)` with safety as a hard gate.

| Cohort | Pain | Best page type for first ship | Safety | Intent | Loop fit | Priority |
|---|---|---|---|---|---|---|
| Tired high-performing men 30–45 | "I feel exhausted, what's wrong" | results-explainer ("Ferritin low but Hb normal") | safe | high | ★★★★★ | **P1** |
| Private-test confusion 25–55 | "I have results, help me understand" | results-explainer ("Private blood test results explained UK") | safe | very high | ★★★★★ | **P1** |
| Men over 40 longevity / prevention | "I want early-warning signal" | cohort-overview ("Best blood tests for men over 40") | safe | medium | ★★★★ | **P2** |
| Heart-risk anxious 35–50 | "Should I worry about LDL/ApoB" | results-explainer ("ApoB explained") | safe | medium | ★★★★ | **P2** |
| Metabolic risk / weight gain 30–50 | "Am I insulin resistant" | results-explainer ("HbA1c normal but insulin high") | gated | medium | ★★★ | **P3** (defer) |
| Testosterone / vitality 25–50 | "I don't feel like myself" | results-explainer ("Free vs total testosterone") | gated | very high | ★★★★ | **P3** (defer — high-watch G3) |
| Founder / executive health 30–50 | "I need my body to perform" | cohort-overview ("Founder health check") | safe | low (small TAM) | ★★★ | **P4** (small market) |
| Fertility / preconception 28–45 | "Trying for a baby" | gated; defer | gated | high | ★★ | **defer** (specialist domain) |
| Fitness / overtraining 25–45 | "Not recovering" | wearable-signal pages — gated; defer | gated | medium | ★★ | **defer** |

**Conclusions:**
- Anchor #1: a P1 page that *most directly maps a search query to the upload→interpretation loop* — see Output 2.
- Anchor #2: a P2 cohort-overview that broadens intent and validates the template — see Output 2.
- Defer all `gated` cohorts until the safe anchor proves the loop.

## Output 2 — 10 High-Leverage Landing Page Concepts

Ranked by the same scoring; first two are the actual ship list, others are the template-extension queue.

| # | Page concept | Cohort | Safety | Notes |
|---|---|---|---|---|
| **1** | **"Private blood test results explained — UK guide for men"** | private-test confusion | **safe** | **ANCHOR #1.** Directly maps to upload-loop. Visitor *has* a result they don't understand → upload it → see what it means alongside their context → £39 unlock for full action plan (GP-prep formatted). |
| **2** | **"Best blood tests for men over 40"** | longevity/prevention | **safe** | **ANCHOR #2.** Pure comparison/educational. Drives upload by recommending a panel and offering free interpretation when results come back. Buys time before purchase decision. |
| 3 | "Ferritin low but haemoglobin normal — what it means for men" | tired men 30–45 | safe | Template-fit. Specific result-pattern explainer. |
| 4 | "ApoB vs LDL — which matters more for men 35–50" | heart-risk anxious | safe | Template-fit. Educational comparison. |
| 5 | "Why am I always tired? Blood tests for men 30–45" | tired men 30–45 | safe | Symptom→tests page. Lower clinical risk than symptom→treatment. |
| 6 | "ALT high blood test — what your liver enzyme result means" | metabolic | safe | Result explainer; pure interpretation. |
| 7 | "HbA1c explained — what your number means at 30, 40, 50" | metabolic | safe | Result explainer + age-context. |
| 8 | "Free vs total testosterone — what the numbers mean" | vitality | gated | Defer — needs explicit clinical-safety review for G3 boundary. |
| 9 | "What does my private blood test really mean — a worked example" | private-test confusion | safe | Long-form content using a synthetic-persona walked example. Reinforces #1. |
| 10 | "How Morning Form interprets your blood test results — methodology page" | trust / referer | safe | Trust-building page; cited from every other page; the "show your work" surface that AI engines can quote. |

**Cuts vs the brief:**
- "Low testosterone symptoms" — gated, defer until #8 has clinical review.
- "Why is my HRV low? Wearables, recovery, and labs" — gated wearable signal interpretation.
- "Insulin resistance in men: signs, tests, and next steps" — `next steps` is the G3 problem; reframe as "What insulin resistance means and what to discuss with your GP."
- "Male hormone panel explained" — gated, hormonal advice has tighter G3/G6 boundaries.

## Output 3 — 1 Fully Written Anchor Page + 1 Sketch

### Anchor #1: "Private blood test results explained — UK guide for men"

**Slug:** `/explainers/private-blood-test-results-uk`

**SEO title** (≤60 chars): "Private Blood Test Results Explained — UK Guide"
**Meta description** (≤155 chars): "Just got a private blood test back? Understand what your results mean alongside your wearable data and history. Free upload, plain-English interpretation."
**H1:** "What do my private blood test results actually mean?"

**Above-the-fold direct answer (GEO-optimised, citable by AI engines):**
> A private blood test shows you a snapshot — your number compared to a reference range. But "in range" doesn't always mean "fine for you," and "out of range" rarely means "you have a disease." What changes the meaning is *context*: your symptoms, your trend over time, your wearable data, and the markers you didn't test. This page explains how to read a UK private blood panel (Medichecks, Thriva, Forth, Numan, Randox), what the most common flags actually mean, and how to know when a result is worth bringing to your GP.

**Page outline:**

1. **What you get from a private blood test** (educational, ~250 words)
2. **The five most common flags on UK panels** — table with: marker, reference range, what "high" can mean, what "low" can mean, *not* what to do about it
3. **"In range" doesn't always mean fine, and "out of range" doesn't always mean problem** — explainer with two worked examples using synthetic data (e.g. ferritin 35 → low-normal but symptomatic; LDL 4.0 → high but in healthy 30-year-old context)
4. **Upload section** ("Upload your panel and we'll show you what it means in context — free")
5. **Example interpretation** — synthetic anonymised output from MorningForm's interpretation tier (the demo persona's Apr 2024 panel reading), showing trend + cross-marker pattern + "what to bring to your GP"
6. **What Morning Form does (and doesn't do)** — trust/safety module:
   - We help you understand your data in context
   - We don't replace your GP, prescribe medications, or recommend supplements
   - We surface flags worth discussing and prepare you for that conversation
7. **FAQ block** (GEO-friendly, AI-engine-citable):
   - "Are private blood tests reliable?"
   - "Should I trust the lab's reference range?"
   - "What if my private result disagrees with my NHS test?"
   - "Should I take supplements based on a private blood test result?" (Answer: no — and crucially, *we explain why* without making this a "what supplements should I take" page)
   - "When should I show my private blood test to my GP?"
8. **CTA:** "Upload your panel — see what it means in 60 seconds"

**Trust anchors (cited inline):** NHS reference range guidance, NICE lab interpretation standards, BMJ articles on context-dependent reference ranges, Mayo Clinic on result interpretation.

**Internal links:** to anchor #2 (best blood tests for men over 40) + the methodology page (#10).

**What this page DOES NOT include:**
- Specific drug or supplement names or doses
- "You should take X" or "treat with Y"
- Diagnostic claims ("your high LDL means you have...")
- Pricing comparison of private test providers (regulatory grey zone)

**Conversion flow it triggers:** see Output 6.

---

### Anchor #2 (sketch): "Best blood tests for men over 40"

**Slug:** `/explainers/best-blood-tests-men-over-40-uk`
**Intent:** comparison-shopping, pre-purchase. Visitor hasn't tested yet.

**Page shape:**
1. Direct answer: a comparison table of ~12 markers with: `marker | what it tells you | typical reference range | how often to retest`
2. Tier breakdown: `essentials` (£~50), `recommended` (£~150), `comprehensive` (£~250) — pricing rough, link to providers
3. **CTA:** "Order through any provider, then upload results to Morning Form for plain-English interpretation"
4. **Or:** "Book through us" (deferred — partner-network play, not in 12-week scope)
5. Section: "Why context matters more than the panel choice" — links back to Anchor #1
6. FAQ: GEO-optimised
7. What Morning Form does/doesn't do — same trust block

This page validates that the template ports — same structure, different intent class.

## Output 4 — Reusable Page Template

```
---
slug: /explainers/<topic-slug>
intent: <results-interpretation | comparison | symptom-to-tests | educational>
cohort: <men-25-50-tired | men-over-40-prevention | etc.>
safety: <safe | gated | out-of-scope>
clinical_review: <reviewer-name + date>  ← required before publish
---

# <H1: question-led, what-the-user-typed-into-Google>

[Above-the-fold direct answer — 2-3 paragraphs, GEO-citable.
Designed to be quoted verbatim by ChatGPT / Perplexity / AI Overviews.]

## What this is

[Plain-English explainer of the topic. No jargon without immediate definition.]

## What your result/situation might mean

[Cause/pattern table OR worked examples. Always context-conditional, never deterministic.
Always "this can mean X, Y, or Z" — never "this means X."]

## What to do next

[Always one of three patterns:
 1. "Discuss with your GP" — for any flag worth clinical attention
 2. "Watch this trend over time" — for borderline / monitor signals
 3. "Run the next test" — for cases where the natural follow-up is another diagnostic
NEVER: take supplement X, follow protocol Y, treat with Z]

## How Morning Form helps

[1-paragraph explanation of the upload→interpretation loop, scoped to this topic.]

## Example interpretation (synthetic)

[Anonymised example using the demo-persona data. Shows the loop in action.
Always labelled "Synthetic example" so it's not mistaken for a testimonial.]

## When to speak to a clinician

[Hard list of escalation signals — fevers, severe pain, drastic deviations, etc.
This block is mandatory and ships verbatim from the clinical-safety registry.]

## FAQ

[5-8 questions in natural language ("Should I be worried about my high cholesterol?")
Each answer 2-4 sentences. Designed for AI-engine snippet extraction.]

## What Morning Form is and isn't

[Standardised trust block. Same on every page.]

## CTA

["Upload your data — get a clear read in minutes"]

## Sources

[Inline citations: NHS, NICE, BMJ, Mayo Clinic, peer-reviewed journals.
Schema: <a> tags with rel="cite", structured for SEO + GEO.]
```

## Output 5 — Schema for Programmatic Generation

For the *eventual* programmatic system (deferred until anchors prove out), the data model is:

```
Topic {
  slug: string                      // /explainers/<slug>
  topic_class: 'biomarker' | 'symptom' | 'condition' | 'cohort-overview' | 'panel-comparison' | 'wearable-signal'
  intent: 'results-interpretation' | 'comparison' | 'symptom-to-tests' | 'educational'
  cohort: CohortKey                 // matches /lib/personas
  primary_query: string             // the exact query targeted
  secondary_queries: string[]       // related long-tail
  safety: 'safe' | 'gated' | 'out-of-scope'
  clinical_review: { reviewer, date, version } | null
  trust_anchors: SourceCitation[]   // NHS, NICE, BMJ, ...
  related_topics: TopicSlug[]
  loop_handoff: 'upload' | 'order-test' | 'gp-prep' | 'topic-page'
  paid_unlock_value: 'interpretation-summary' | 'full-action-plan' | 'subscription'
}
```

A topic compiles to:
- One SEO page (`app/explainers/[slug]/page.tsx` — RSC, statically generated)
- Schema.org markup (`MedicalWebPage`, `FAQPage`, `MedicalCondition` where appropriate)
- Internal-link graph to related topics
- Per-page measurement instrumentation (R7)

**This module isn't built in the 12-week window.** Anchor #1 ships hand-authored. Anchor #2 ships hand-authored from the template. The schema lands when there's a third page.

## Output 6 — Conversion Flow (Page → Upload → Interpretation → Payment → Action Plan)

```
[1] Visitor lands on /explainers/private-blood-test-results-uk
       (organic search, AI-engine cite, paid traffic test)
              │
              ▼
[2] Reads above-the-fold + scrolls
        │
        ├──► (drops, ~70% bounce expected on first traffic — normal)
        │
        ▼
[3] CTA: "Upload your panel — see what it means in 60 seconds"
              │
              ▼
[4] Lands on /upload/results
       — minimal-friction, single PDF or photo
       — NO signup gate yet (this is the conversion lever)
       — extracts values, flags markers
              │
              ▼
[5] Free interpretation summary
       "We see 3 flags worth discussing: ferritin (low-normal), 
       LDL (in range, but trending up), ALT (slightly elevated).
       Here's what each can mean in context. Sign up free to see 
       the full action plan + GP-prep document + your trend dashboard."
              │
              ▼
[6] Email-only signup gate (NOT credit card)
       — captures email + name only
       — adds to onboarding sequence
              │
              ▼
[7] Full interpretation page (£0 — included in signup)
       — context-aware reading
       — GP-prep document (downloadable)
       — link to add wearable / second blood test
              │
              ▼
[8] Day 7-14: prompt to upgrade to subscription
       — £19/mo for trend dashboard + quarterly recheck workflow
       — OR £39 one-time for "deeper analysis pack" (more historical context, 
         more cross-marker patterns, downloadable for GP)
              │
              ▼
[9] Activation-funnel script (PR #83) measures progression at each step
```

**Critical regulatory lens on every step:**
- Step 5 must NEVER say "you have X" or "you should take Y." It says "this can mean..." and "consider discussing with your GP."
- Step 7's GP-prep is the existing `route_to_gp_prep` tool's output — already G1–G7 compliant.
- Step 8's "deeper analysis pack" is also GP-prep-flavoured — *not* a treatment plan.

**Engineering required (subordinate to acquisition learning):**
- Public `/upload/results` route (no-auth file upload + extraction)
- Free-tier interpretation summary (~1-paragraph, classified output, scoped to "what to discuss")
- Email-only signup (no card upfront)
- Stripe checkout for £39 / £19/mo (optional in 12-week window — manual invoicing OK for first 30)
- Per-step funnel events feeding the existing activation-funnel script

## Output 7 — Measurement Framework

**Three layers:**

1. **Organic + paid traffic**
   - Google Search Console: page impressions, average position, click-through rate per query
   - Plausible (privacy-respecting, no cookie banner needed in UK): pageviews, referrers, bounce, scroll-depth
   - One paid-traffic spend test on Anchor #1 (£200, 2 weeks, Google Ads on `private blood test results uk` + 3 close variants)

2. **AI-engine visibility (GEO)**
   - Manual weekly check: query the top-3 target queries on ChatGPT, Perplexity, Gemini, Google AI Overviews, Claude.ai. Record whether MorningForm is cited, what's quoted, what surrounding sources are cited
   - Backlink monitoring: ahrefs free tier or Google site:morning-form.vercel.app `linkdomain:` queries
   - GEO-specific signal: do AI engines correctly answer "what does Morning Form do" when asked? Track yes/no monthly.

3. **Page → upload → pay funnel**
   - Use the activation-funnel script (PR #83). Add an `anchor_page_visit` stage at the top of the existing six-stage funnel. Bucket by referrer.
   - Conversion targets per R2/R3: 5% page→upload, 30% upload→pay.
   - Run funnel weekly once anchor ships.

**Internal "is this working" dashboard:** a single page that aggregates the three layers. Built only after Anchor #1 launches — premature otherwise.

## Output 8 — Clinical Safety Framework

Every page passes a checklist before publish. Reviewer is the founder + a clinician advisor (TBD, see Outstanding Questions).

**Per-page checklist (gates publish):**

- [ ] No specific drug names (G1)
- [ ] No dose strings — `mg`, `units/day`, `IU` for any specific compound (G2)
- [ ] No imperative treatment language — search for `you should`, `take`, `treat with`, `start`, `recommend` (G3)
- [ ] All decision-points route to "discuss with your GP," "consider retesting," or "watch the trend" — never "do X" (G3)
- [ ] Out-of-scope language present where appropriate ("if you have severe symptoms, contact your GP urgently") (G4)
- [ ] Page never claims to diagnose, prescribe, or replace clinical care (G5)
- [ ] Topic stays inside Morning Form's scope: longitudinal record + interpretation + GP prep. Not training advice, not nutrition rankings, not supplement selection (G6)
- [ ] Every numeric or clinical claim has a citation: NHS, NICE, BMJ, Mayo, peer-reviewed (G7)
- [ ] FAQ answers don't include unsourced specific recommendations
- [ ] Worked examples labelled "Synthetic example" — never presented as testimonial
- [ ] "What Morning Form is and isn't" trust block present
- [ ] When in doubt: defer the claim, defer the page, escalate

**Safety review process:**
1. Founder drafts page following template
2. Founder runs the checklist solo
3. Clinician advisor reviews — minimum 2 hours per page initially, ~30 min per template-fit page later
4. Page ships only with reviewer + date in frontmatter

**Audit lever:** a quarterly check that the live pages still match what was reviewed. Drift between the template and what's published is the silent-fallback class-of-bug applied to clinical content.

## Output 9 — App-Side Recommendations

What Morning Form needs to ship *in support of* the anchor pages, beyond what already exists:

**Must-have for Anchor #1 to convert (12-week scope):**

1. **Public `/upload/results` route** — no-auth PDF/photo upload, runs the existing intake-extraction pipeline.
2. **Free interpretation summary tier** — a constrained scribe output that returns a classified, GP-prep-style summary (≤4 paragraphs). Reuses existing scribe infrastructure with a `tier=preview` mode.
3. **Email-only signup** — replace any existing signup that requires card-on-file with email-first. Card capture happens at step 8.
4. **GP-prep document download** — already exists via `route_to_gp_prep`; surface it as a downloadable PDF in the post-signup flow.
5. **Per-page measurement events** — extend activation-funnel events with `anchor_page_visit` and `anchor_page_to_upload` stages.
6. **Anchor-page-driven onboarding sequence** — different from the current "general" onboarding; assumes the user arrived with a result-interpretation question.

**Nice-to-have (defer):**
- Stripe checkout (manual invoicing for first 30 paying users)
- Trend dashboard (quarterly recheck workflow)
- "Deeper analysis pack" — additional content tier for the £39 one-time

**Should NOT build for this:**
- A CMS for content authoring (anchor pages can be `app/explainers/[slug]/page.tsx` — TSX directly, hand-authored)
- Programmatic page generation (premature)
- Per-cohort sub-funnels (single funnel, single anchor)

## Outstanding Questions

### Resolved during brainstorm

- **Should we ship 10 pages or fewer?** Fewer (1+1). 10 pages without organic ranking on any single page is a pile of unranked pages.
- **Programmatic now or later?** Later. After Anchor #1 ranks AND converts.
- **Subscription or one-time first?** £39 one-time first. Subscription is a pricing-validation question; test the simpler product first.
- **Which page is Anchor #1?** "Private blood test results explained — UK guide for men." Maps directly to upload-loop, lowest regulatory risk among high-intent options.
- **Which page is Anchor #2?** "Best blood tests for men over 40." Validates the template, broadens intent.

### Resolve before planning

- **Who's the clinician advisor doing G1–G7 review?** No name today. Without a reviewer, no anchor page ships. **This is the blocker** that gates the entire 12-week plan.
- **Do we have UK GMC-registered clinical advisor capacity?** Or do we need to hire/contract one before this work begins?
- **Pricing decision: £39 one-time** — is that the right price? £19/mo subscription — right? These are positioning decisions, not engineering decisions. Worth a 30-min sit before /ce:plan.

### Deferred to implementation

- Exact wording of the "what Morning Form is and isn't" trust block — copy work, ships with the page.
- The synthetic-persona example data on Anchor #1 — reuse from `prisma/fixtures/synthetic/metabolic-persona.ts` if useful, otherwise hand-author.
- Whether `/upload/results` requires bot protection (Cloudflare Turnstile etc.) before launch — likely yes; resolve at engineering time.
- Stripe vs manual invoicing decision for first 30 — defer; whichever is faster to ship.

## Honest Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Clinician advisor not in place — entire plan blocks | **HIGH** | Resolve before /ce:plan. Could outsource to a UK GMC-registered freelancer. ~1-2 hours per page review. |
| Anchor page ranks but doesn't convert (page-quality issue) | medium | Paid traffic test (£200) catches this in 2 weeks before SEO compounds. Iterate on copy before doubling down. |
| Anchor page doesn't rank (SEO competition) | medium | Pick the lowest-competition high-intent query. "Private blood test results UK" has lower competition than "blood test explained" — niche-specific intent + UK gating helps. |
| Regulator reads a page and calls it SaMD | **HIGH** | G1–G7 checklist + clinical review. The framing on every page is GP-prep, not diagnosis. Trust block on every page. |
| £39 / £19/mo wrong price → wrong conversion math | medium | Test the £39 one-time first. If conversion is good, subscription becomes optional. If conversion is bad, pricing is the lever. |
| Founder outreach delivers 30 signups before SEO does, then SEO never gets validated as a channel | low | This is fine. SEO is a 6-month bet anyway; if outreach gets us to 30 first, we have data to fund the SEO play. |
| Programmatic-generation pressure (the brief's full ambition) re-enters scope mid-work | medium | Explicit "deferred to follow-up plans" framing in the plan that comes out of this brainstorm. Re-evaluate after Anchor #1 launches and ranks. |

## Recommended Next Steps

1. **Resolve the clinician-advisor blocker.** ~3-5 days. Without this, no anchor page can ship.
2. **`/ce:plan`** for the engineering work — public upload route, free-tier interpretation, email-only signup, GP-prep download, measurement events. Likely 3-5 implementation units, 1-2 weeks of work.
3. **Parallel: founder outreach** — list 30 men in network, draft personalised invite, start sending. No engineering dependency.
4. **Parallel: write Anchor #1 draft** — content work, can run before engineering finishes.
5. **Week 4-6:** Anchor #1 ships. Run paid traffic test. Measure.
6. **Week 8-10:** Anchor #2 ships if Anchor #1 is converting. Otherwise iterate on Anchor #1.
7. **Week 10-12:** Decide on programmatic scaling based on actual data, not the brief's assumptions.

## Sources & References

- [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](2026-04-21-regulatory-posture-requirements.md) — G1–G7 guardrails, load-bearing
- [docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md](../plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md) — funnel measurement (shipped, PR #83)
- [docs/ideation/2026-05-06-open-ideation.md](../ideation/2026-05-06-open-ideation.md) — origin ideation
- Existing Morning Form surfaces: `/topics/[topicKey]`, `route_to_gp_prep`, intake pipeline
- External (to be cited from pages): NHS, NICE, BMJ, Mayo Clinic, peer-reviewed journals
