---
date: 2026-05-06
revised: 2026-05-06
topic: acquisition-anchor-pages
window: months 1–6 (digital channel; pre-Studio)
target: 500 paying customers by month 6 (deck milestone); 50 paying via digital channel by month 2 as page-validation milestone
audience: men 30–50 (US, premium spenders)
strategy: 1–2 anchor SEO/GEO pages → upload → translation → Supply subscription
out_of_scope: founder outreach, premium-gym/concierge partnerships, Studio rollout — all separate channels
supersedes: prior 2026-05-06 draft (UK/£/GP-prep framing) — re-aligned with pre-seed deck (US/$/Supply-led)
---

# Acquisition: anchor-page strategy for the US digital channel

## Problem Frame

Per the [pre-seed deck](../../../MorningForm-PreSeed-Deck-US.pdf), the milestone for the next 12 months is **500 paying customers via direct channel and digital membership in months 1–6**, before the Studio pilot launches at month 9. Three acquisition channels are in play:

1. **Premium-gym / concierge / performance-clinic partnerships** — 3 LOIs in hand, NYC/LA/Austin/Miami warm. Channel.
2. **Founder-network and PR** — Reuben + Joe's contact graph. Channel.
3. **Digital — SEO + GEO + paid traffic + onsite conversion.** ← **This artifact.**

Channels 1 and 2 are people-led and live alongside this work. This brainstorm is **only** about channel 3: a system of search-and-AI-engine landing pages that funnel high-intent visitors into the upload → translation → Supply-protocol loop.

The honest scope: stand up enough digital infrastructure in 12 weeks that, by month 2, channel 3 has converted **≥50 paying customers** — proving the page→Supply funnel can carry its share of the 500-by-month-6 number. If channel 3 hits ≥10% of the milestone in months 1–2 with one or two anchor pages, it earns programmatic scale-up. If it doesn't, channels 1 and 2 carry months 1–6, and digital re-anchors as a slower compounding play.

## Decision Frame

Locked: **option B from the strategic re-framing — 1–2 anchor SEO/GEO pages, US-framed, ending in Supply subscription.** Engineering: medium. Programmatic scaling deferred until anchors prove the funnel.

Rejected:
- Option A (4-week pure outreach) — already happening as channel 2; not a digital-channel bet.
- Option C (full programmatic 10-page system in 12 weeks) — multiplying zero, premature scale, larger surface for clinical-safety drift.

## Regulatory Frame (Two Surfaces, Two Frameworks)

The [existing regulatory-posture brainstorm](2026-04-21-regulatory-posture-requirements.md) (G1–G7) was written with a UK/NHS posture. The deck pivots to US and makes Supply (personalized supplements) the HERO product. This isn't a contradiction once the surfaces are split:

### Informational surfaces (pages + Form Intelligence translation layer)
Govern by **G1–G7-equivalent US wellness posture:**
- No specific drug names (Rx)
- No dose strings ("take X mg of Y")
- No imperative-treatment language ("treat your X with Y")
- No diagnostic claims ("you have X")
- Decision-points route to "discuss with your physician," "consider retesting," "watch the trend," or "see your personalized protocol" — never "do X to cure Y"
- Every numeric/clinical claim cites a US-trusted source (Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed)

### Supply product
Govern by **DSHEA 1994** (US Dietary Supplement Health and Education Act):
- Personalized formulations based on bloodwork are permitted
- Structure/function claims permitted with the standard FDA disclaimer
- **No disease/treatment claims.** "Supports healthy testosterone levels," not "treats low testosterone."
- FDA-registered manufacturer, GMP-compliant facility (Supply chain prerequisite — separate from this brainstorm)

### The seam between them

The page never says *"you should take 5,000 IU Vitamin D."* The translation says *"your Vitamin D is 22 ng/mL — below optimal for someone with your demographic and activity level."* The CTA says *"Get your personalized Supply protocol — $69/mo"* — and inside Supply, DSHEA-compliant product copy and a personalized formulation take over.

**The CTA can also offer:** *"Or download a summary to take to your own physician"* — secondary path for users who don't want the Supply subscription. Reuses the existing GP-prep tier.

## Requirements Trace

- **R1** Anchor page #1 ranks in top-10 organic for at least one high-intent US query within 12 weeks.
- **R2** Anchor page #1 converts ≥5% of organic visitors into a free data upload.
- **R3** Free uploads convert ≥30% to paid (**Supply subscription $69/mo, primary; or one-time Studio visit $299 once Studio is live**) within 14 days.
- **R4** Channel 3 contributes ≥50 paying customers by end of month 2 — the validation gate for further investment in the digital channel.
- **R5** Every shipped page passes a clinical-safety review (US framing, G1–G7-equivalent) before publishing. Zero exceptions.
- **R6** Pages are designed for AI-answer-engine surfacing (GEO): question-led headings, direct answers, structured FAQ, sourceable claims, schema.org `MedicalWebPage` + `FAQPage` markup.
- **R7** A measurement system tracks (a) organic + AI-engine traffic, (b) page→upload conversion, (c) upload→Supply conversion. Internal dashboard.
- **R8** The page → upload → translation → Supply checkout flow works end-to-end for at least one query class.
- **R9** A second anchor page can be produced from a reusable template in ≤2 days of editorial work.
- **R10** No pages with: specific Rx drug names, dose strings, imperative-treatment language, disease/treatment claims about supplements, or rankings of competing products. (Supply product copy is a separate surface with its own DSHEA-compliant guidelines.)

## Scope Boundaries

**In scope (12 weeks, channel 3 only):**
- 1 fully-built anchor page (R1–R3)
- 1 sketch-quality second anchor page that ships in week 8–10 (R9)
- The free-upload → translation → Supply checkout flow (R8)
- Measurement system for organic + AI-engine + conversion (R7)
- Clinical-safety review process per page (R5)
- Reusable page template + lightweight schema (R9)

**Not in scope (separate channels or separate plans):**
- Founder-network outreach — channel 2, separate
- Premium-gym / concierge / performance-clinic partnerships — channel 1, separate
- Studio rollout (deck month 9) — out of window
- The Supply product itself: formulation logic, manufacturing partner, fulfillment, subscription billing — separate plan, prerequisite to this one
- Form Intelligence translation layer's clinical depth — assumed working at the level the deck describes; tightening it is a separate plan
- 8 of the 10 page concepts in the brief's initial-priority list (defer to post-validation)
- Programmatic page generation across biomarkers × symptoms × cohorts (defer)
- Per-cohort sub-funnels in activation funnel script (single funnel for now)

**Not in scope ever (regulatory):**
- Disease/treatment claims about Supply ("treats low testosterone" — never)
- Specific Rx drug recommendations
- Competing-product rankings ("AG1 vs Supply") on the informational surface
- Any framing that positions MorningForm as a physician replacement

---

## Output 1 — Prioritized Taxonomy (US, deck-aligned)

Eight cohorts × three page types (`results-explainer`, `cohort-overview`, `query-direct-answer`), ranked by `(safety) × (intent) × (Supply-loop fit)`.

| Cohort | Pain | Best page type for first ship | Safety | Intent | Supply fit | Priority |
|---|---|---|---|---|---|---|
| Tired high-performing men 30–45 | "I feel exhausted, what's wrong" | results-explainer ("Ferritin low but normal hemoglobin") | safe | high | ★★★★★ | **P1** |
| Private-test confusion 30–50 | "I have results from Quest/LabCorp, help me understand" | results-explainer ("Quest blood test results explained — what your numbers mean") | safe | very high | ★★★★★ | **P1** |
| Men over 40 longevity / prevention | "I want early-warning signal" | cohort-overview ("Best blood tests for men over 40 — US guide") | safe | medium | ★★★★ | **P2** |
| Heart-risk anxious 35–50 | "Should I worry about LDL/ApoB" | results-explainer ("ApoB explained — the marker your doctor isn't testing") | safe | medium | ★★★★ | **P2** |
| Metabolic risk / weight gain 30–50 | "Am I insulin resistant" | results-explainer ("HbA1c normal but fasting insulin high") | gated | medium | ★★★ | **P3** (defer) |
| Testosterone / vitality 30–50 | "I don't feel like myself" | results-explainer ("Free vs total testosterone explained") | gated | very high | ★★★★ | **P3** (defer — high-watch G3-equivalent) |
| Founder / executive health 30–50 | "I need my body to perform" | cohort-overview ("Founder health check — what to test") | safe | low (small TAM) | ★★★ | **P4** (small market) |
| Fitness / overtraining 30–45 | "Not recovering" | wearable-signal — gated | gated | medium | ★★ | **defer** |

**Conclusions:**
- Anchor #1: **"Quest blood test results explained — what your numbers mean as a man 30–50"** — direct intent, US lab partner alignment with deck, lowest regulatory risk.
- Anchor #2: **"Best blood tests for men over 40 — US guide"** — pure educational, broadens intent, validates template ports.
- Defer all `gated` cohorts until anchors prove out.

## Output 2 — 10 High-Leverage Landing Page Concepts (US-framed)

| # | Page | Cohort | Safety | Notes |
|---|---|---|---|---|
| **1** | **"Quest blood test results explained — what your numbers mean for men 30–50"** | private-test confusion | **safe** | **ANCHOR #1.** Visitor *has* results from Quest (or LabCorp / BioReference — partners per deck) → upload → translation → personalized Supply protocol. Direct loop. |
| **2** | **"Best blood tests for men over 40 — US guide"** | longevity/prevention | **safe** | **ANCHOR #2.** Pre-test comparison/educational. Drives ordering through partners + free interpretation when results return. |
| 3 | "Ferritin low but hemoglobin normal — what it means for men" | tired men 30–45 | safe | Template-fit. Specific result-pattern explainer. |
| 4 | "ApoB vs LDL — which matters more for men 35–50" | heart-risk anxious | safe | Template-fit. Educational comparison. |
| 5 | "Why am I always tired? Blood tests for men 30–45" | tired men 30–45 | safe | Symptom→tests page. |
| 6 | "ALT high blood test — what your liver enzyme result means" | metabolic | safe | Result explainer. |
| 7 | "HbA1c explained — what your number means at 30, 40, 50" | metabolic | safe | Result explainer + age-context. |
| 8 | "Free vs total testosterone explained" | vitality | gated | Defer — needs explicit clinical-safety review. |
| 9 | "Read your blood test like a doctor — a worked example for men 30–50" | private-test confusion | safe | Long-form using a synthetic-persona walked example. Reinforces #1. |
| 10 | "How MorningForm interprets your blood test results — methodology page" | trust / referer | safe | Trust-building; cited from every other page; AI-engine-quotable explanation of Form Intelligence. |

**Cuts vs the original brief:**
- "How to increase testosterone naturally" — disease-claim adjacent; rejected outright.
- "Why is my HRV low?" — gated wearable-signal interpretation.
- "Insulin resistance in men: signs, tests, and *next steps*" — `next steps` is the imperative-treatment problem; reframe as "what insulin resistance can mean and what to discuss with your physician."
- "Male hormone panel explained" — gated (G3-equivalent boundaries).

## Output 3 — 1 Fully Written Anchor Page + 1 Sketch

### Anchor #1: "Quest blood test results explained — what your numbers mean for men 30–50"

**Slug:** `/explainers/quest-blood-test-results-explained`

**SEO title** (≤60 chars): "Quest Blood Test Results Explained — Men's Guide"
**Meta description** (≤155 chars): "Just got Quest, LabCorp, or BioReference results? Understand what your numbers mean alongside your wearable data. Free upload, plain-English read."
**H1:** "Quest blood test results — what your numbers actually mean"

**Above-the-fold direct answer (GEO-citable):**
> A private blood panel shows your numbers compared to a reference range. But "in range" doesn't always mean "fine for you," and "out of range" rarely means "you have a disease." What changes the meaning is *context*: your symptoms, your trend over time, your wearable data, and the markers you didn't test. This page explains how to read a Quest, LabCorp, or BioReference panel as a man 30–50 — what the most common flags mean, why your "in range" testosterone might still be sub-optimal, and how to turn your results into a personalized daily protocol.

**Page outline:**

1. **What you get from a private panel** (~250 words; non-promotional educational)
2. **The 8 most common flags on US panels for men 30–50** — table: marker, reference range, what "high" can mean, what "low" can mean, *what context shifts the meaning* — never "what to do about it"
3. **Why "in range" can still be sub-optimal for performance** — explainer with two synthetic worked examples (e.g. testosterone 380 ng/dL — in range but bottom-quintile for a 35-year-old; HbA1c 5.6 — in range but trending up YoY)
4. **Upload section:** *"Upload your Quest, LabCorp, or BioReference PDF and we'll show you what it means in context — free."*
5. **Example translation** — synthetic anonymized output from Form Intelligence, showing trend + cross-marker pattern + the personalized Supply protocol that emerges from those numbers
6. **What MorningForm does (and doesn't do)** — trust block:
   - We translate your data into plain English and a personalized daily protocol
   - We don't replace your physician, prescribe medications, or claim to treat any disease
   - For severe or unexplained results, we say so clearly and route to your physician
7. **CTA primary:** *"Get your personalized Supply protocol — $69/mo (cancel anytime)"*
8. **CTA secondary:** *"Or download a summary to take to your physician — free"*
9. **FAQ block** (GEO-friendly):
   - "Are private blood tests as accurate as my doctor's?"
   - "What if my Quest result disagrees with my last clinic test?"
   - "Should I take supplements based on a private blood test?" (DSHEA-compliant answer: yes, when personalized to your bloodwork — never as a generic regimen. Explain the difference.)
   - "When should I show my private results to my doctor?"
   - "What's MorningForm's relationship with Quest / LabCorp / BioReference?" (Per deck: partners.)

**Trust anchors (cited inline):** Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed journals.

**Internal links:** to anchor #2 (best blood tests for men over 40) + the methodology page (#10) + the Supply product page.

**What this page DOES NOT include:**
- Specific Rx drug names or doses
- Dose recommendations for any supplement on the informational surface
- "You should take X" or "treat with Y"
- Disease claims about Supply
- Comparison rankings of test providers (Quest vs LabCorp price wars are off-message)

**Conversion flow it triggers:** see Output 6.

---

### Anchor #2 (sketch): "Best blood tests for men over 40 — US guide"

**Slug:** `/explainers/best-blood-tests-men-over-40`
**Intent:** comparison-shopping, pre-purchase. Visitor hasn't tested yet.

**Page shape:**
1. Direct answer: comparison table of ~12 markers — `marker | what it tells you | typical reference range | how often to retest | why it matters more after 40`
2. Tier breakdown: `essentials`, `recommended`, `comprehensive` — link to ordering through MorningForm Studio (when live) or partner labs
3. **CTA primary:** *"Order your panel through MorningForm — get translation + Supply protocol included"*
4. **CTA secondary:** *"Already tested? Upload your results — free"*
5. Section: "Why context matters more than panel choice" — links back to Anchor #1
6. FAQ: GEO-optimized
7. Trust block (same as #1)

This page validates the template ports — same structure, different intent class.

## Output 4 — Reusable Page Template

```
---
slug: /explainers/<topic-slug>
intent: <results-interpretation | comparison | symptom-to-tests | educational>
cohort: <men-30-45-tired | men-over-40-prevention | etc.>
safety: <safe | gated | out-of-scope>
clinical_review: <reviewer-name + date>  ← required before publish
---

# <H1: question-led, what the user typed into Google>

[Above-the-fold direct answer — 2-3 paragraphs, GEO-citable.
Designed to be quoted verbatim by ChatGPT / Perplexity / Google AI Overviews / Claude / Gemini.]

## What this is

[Plain-English explainer. No jargon without definition.]

## What your result/situation can mean

[Cause/pattern table OR worked examples. Always context-conditional.
"This can mean X, Y, or Z" — never "this means X."]

## Why context matters

[Explainer of how MorningForm reads YOUR data — bloods + wearable + symptoms.
The Form Intelligence pitch in 2-3 paragraphs.]

## What to consider next

[Always one of three patterns:
 1. "Get a personalized Supply protocol" — for cases where bloodwork suggests a personalized supplement formulation
 2. "Discuss with your physician" — for any flag worth clinical attention
 3. "Watch this trend over time" — for borderline / monitor signals
NEVER: "treat with drug X," "follow protocol Y for disease Z"]

## How MorningForm helps

[1-paragraph upload→translation→Supply scope, scoped to this topic.]

## Example translation (synthetic)

[Anonymized example using demo-persona data. Always labeled "Synthetic example."]

## When to speak to a physician

[Hard list of escalation signals. Mandatory block from clinical-safety registry.]

## FAQ

[5-8 questions in natural user language. Each answer 2-4 sentences.
Designed for AI-engine snippet extraction.]

## What MorningForm is and isn't

[Standardized trust block — same on every page.]

## CTAs

Primary:  "Get your personalized Supply protocol — $69/mo"
Secondary: "Or download a summary to take to your physician — free"

## Sources

[Inline citations: Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed.]
```

## Output 5 — Schema for Programmatic Generation

For the eventual programmatic system (deferred until anchors prove out):

```
Topic {
  slug: string
  topic_class: 'biomarker' | 'symptom' | 'condition' | 'cohort-overview' | 'panel-comparison' | 'wearable-signal'
  intent: 'results-interpretation' | 'comparison' | 'symptom-to-tests' | 'educational'
  cohort: 'men-30-45-tired' | 'men-over-40-prevention' | 'heart-risk-anxious-35-50' | ...
  primary_query: string                  // exact target query
  secondary_queries: string[]            // related long-tail
  safety: 'safe' | 'gated' | 'out-of-scope'
  clinical_review: { reviewer, date, version } | null
  trust_anchors: SourceCitation[]        // Mayo, Cleveland Clinic, NIH, JAMA, NEJM
  related_topics: TopicSlug[]
  loop_handoff: 'upload' | 'order-test' | 'supply-cta' | 'physician-summary'
  cta_primary: 'supply' | 'studio-visit' | 'membership'
  cta_secondary: 'physician-summary' | 'order-panel' | null
}
```

A topic compiles to:
- One SEO page (`app/explainers/[slug]/page.tsx` — RSC, statically generated)
- Schema.org markup (`MedicalWebPage`, `FAQPage`, `MedicalCondition` where appropriate)
- Internal-link graph
- Per-page measurement instrumentation

**This module isn't built in the 12-week window.** Anchor #1 ships hand-authored. Anchor #2 ships hand-authored from the template. The schema lands when there's a third page.

## Output 6 — Conversion Flow (Page → Upload → Translation → Supply)

```
[1] Visitor lands on /explainers/quest-blood-test-results-explained
       (organic search, AI-engine cite, paid traffic test)
              │
              ▼
[2] Reads above-the-fold + scrolls
        │
        ├──► (~70% bounce expected on first traffic — normal)
        │
        ▼
[3] CTA: "Upload your panel — see what it means in 60 seconds"
              │
              ▼
[4] Lands on /upload/results
       — minimal-friction PDF upload
       — NO signup gate at this step
       — extracts values, classifies, flags
              │
              ▼
[5] Free interpretation summary (Form Intelligence preview tier)
       "We see 3 things worth attention: ferritin (low-normal), 
       LDL (in range, trending up), testosterone (380 — bottom quintile 
       for your age). Here's what each can mean in context. 
       Sign up free to see your full personalized Supply protocol."
              │
              ▼
[6] Email-only signup gate (NOT credit card)
       — captures email + name + DOB
       — adds to onboarding sequence
              │
              ▼
[7] Full translation (free with email signup)
       — context-aware reading across markers
       — personalized Supply protocol preview ("Vitamin D, magnesium, 
         zinc, omega-3 — at doses calibrated to your numbers")
       — physician-summary download (existing GP-prep tier)
              │
              ▼
[8] Two paid paths surface in parallel:
       
       PRIMARY:  Supply subscription $69/mo
                 — personalized supplements shipped monthly
                 — recurring (the 65%-revenue HERO from the deck)
       
       SECONDARY: Studio visit $299 (when Studio is live, deck month 9+)
                 — comprehensive panel + AI interpretation
                 — one-time
       
       MEMBERSHIP $29/mo can layer on either
              │
              ▼
[9] Activation-funnel script (PR #83) measures progression at each step
```

**Critical regulatory lens on every step:**
- Step 5 must NEVER say "you have X" or "you should take Y." It says "this can mean…" and "your personalized protocol shows…"
- Step 7's physician-summary is the existing `route_to_gp_prep` tool's output.
- Step 8's Supply CTA is DSHEA-governed product copy, separate surface from the page. Personalization claims are permitted; disease/treatment claims are not.

**Engineering required for channel 3 to work end-to-end:**
- Public `/upload/results` route (no-auth file upload + extraction) — does not exist
- Form Intelligence preview tier — constrained translation output for the free pre-signup step
- Email-only signup (no card upfront)
- Supply checkout flow with Stripe subscription billing — **gated on Supply product existing as a separate workstream**
- Per-step funnel events feeding the activation-funnel script

## Output 7 — Measurement Framework

Three layers:

1. **Organic + paid traffic**
   - Google Search Console: page impressions, position, CTR per query
   - Plausible (or PostHog): pageviews, referrers, bounce, scroll-depth
   - One paid-traffic test on Anchor #1: $500 of Google Ads on `quest blood test results explained` + 4 close variants over 2 weeks. Validates page-quality before betting on SEO compounding.

2. **AI-engine visibility (GEO)**
   - Manual weekly check: query top-3 target queries on ChatGPT, Perplexity, Gemini, Google AI Overviews, Claude.ai. Record whether MorningForm is cited.
   - Backlink monitoring (Ahrefs free tier).
   - GEO-specific signal: do AI engines correctly answer "what does MorningForm do" when asked? Track yes/no monthly.

3. **Page → upload → Supply funnel**
   - Use the activation-funnel script (PR #83). Add `anchor_page_visit` and `anchor_page_to_upload` stages at the top of the existing six-stage funnel. Bucket by referrer.
   - Conversion targets per R2/R3: 5% page→upload, 30% upload→Supply.
   - Run weekly once Anchor #1 ships.

**Internal "is this working" dashboard:** built only after Anchor #1 launches.

## Output 8 — Clinical Safety Framework (Two Frameworks, Two Surfaces)

### Informational surfaces (pages + translation layer) — G1–G7-equivalent US framing

Per-page checklist (gates publish):

- [ ] No specific Rx drug names
- [ ] No dose strings on the informational surface (`mg`, `IU`, etc. for any specific compound)
- [ ] No imperative-treatment language — search for `you should`, `take`, `treat with`, `start`, `recommend`
- [ ] All decision-points route to "personalized Supply protocol," "discuss with your physician," "consider retesting," or "watch the trend"
- [ ] No diagnostic claims ("your high LDL means you have...")
- [ ] Topic stays inside MorningForm's scope: longitudinal record + translation + Supply protocol + physician summary
- [ ] Every numeric/clinical claim cited: Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed
- [ ] Worked examples labeled "Synthetic example"
- [ ] "What MorningForm is and isn't" trust block present
- [ ] Sources verifiable

**Reviewer:** US-licensed clinician (MD, DO, or NP) with comp-bio / labs domain familiarity. Per deck: "engaged conversations with senior healthcare-AI researchers, US-based GPs, cardiology and functional-medicine specialists."

### Supply product surface — DSHEA 1994

Separate guidelines, separate review process. Not in this brainstorm's scope. **But the seam matters:** when a page links to Supply, the page doesn't claim what Supply does — the Supply surface does, under DSHEA-compliant copy.

## Output 9 — App-Side Recommendations

What MorningForm needs to ship *in support of* the anchor pages:

**Must-have for Anchor #1 to convert (12-week scope):**

1. **Public `/upload/results` route** — no-auth PDF upload, runs the existing intake-extraction pipeline.
2. **Form Intelligence preview tier** — constrained translation output, returns 2–4 paragraphs with classified flags. Reuses existing scribe infrastructure with a `tier=preview` mode.
3. **Email-only signup** — replaces any signup that requires card-on-file.
4. **Personalized Supply protocol preview** — the in-app surface that shows what the user's Supply formulation would be, post-signup but pre-purchase.
5. **Physician-summary download** — already exists via `route_to_gp_prep`; surface as PDF in post-signup flow.
6. **Per-page measurement events** — extend activation-funnel events with `anchor_page_visit` and `anchor_page_to_upload`.
7. **Anchor-page-driven onboarding sequence** — different from generic onboarding; assumes the user arrived with a result-interpretation question.

**Gated on Supply product readiness (separate workstream):**
- Stripe subscription checkout
- Supply formulation algorithm
- Manufacturer + fulfillment integration

**Should NOT build for this:**
- A CMS for content authoring (anchor pages are TSX directly, hand-authored)
- Programmatic page generation (premature)
- Per-cohort sub-funnels

## Outstanding Questions

### Resolved during brainstorm

- **Geography?** US, per deck.
- **Cohort age band?** 30–50, per deck.
- **Pricing?** $299 Studio · $69/mo Supply (HERO) · $29/mo Membership · $89 Bundle, per deck.
- **What does the page convert to?** Supply subscription primary; physician-summary secondary path.
- **Programmatic now or later?** Later. After Anchor #1 ranks AND converts.
- **Anchor #1 topic?** "Quest blood test results explained — what your numbers mean for men 30–50." Maps directly to upload→translation→Supply loop.
- **Anchor #2 topic?** "Best blood tests for men over 40 — US guide."

### Resolve before planning

- **US clinician advisor for G1–G7-equivalent review?** No name today. Without a reviewer, no anchor page ships. Per deck this is being built into the foundation; **need confirmation that a specific reviewer is engaged and available** before the engineering plan starts. **This is the gate** on the 12-week digital-channel plan.
- **Supply product readiness for the conversion endpoint?** The page → Supply checkout is the primary conversion. If Supply formulation/manufacturer/fulfillment isn't ready by week 8, channel 3's conversion endpoint is incomplete. **Confirm Supply timing** before /ce:plan. If Supply isn't ready in window, the brainstorm needs an interim conversion target (Studio waitlist, $29/mo membership-only, etc.).
- **Page CTA framing — Supply primary, physician-summary secondary** — confirm this is the right hierarchy. The seam where the informational page hands off to the Supply commercial surface needs explicit user/founder sign-off.

### Deferred to implementation

- Exact wording of the trust block — copy work, ships with the page.
- Synthetic-persona example data on Anchor #1 — reuse from the existing metabolic-persona fixture if useful, otherwise hand-author.
- `/upload/results` bot protection (Cloudflare Turnstile etc.) — likely yes; resolve at engineering time.
- Whether to seed Anchor #1 with a NYC/LA/Austin/Miami geo-targeted variant for paid traffic — defer to launch decision.

## Honest Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Clinician advisor not engaged → entire plan blocks | **HIGH** | Resolve before /ce:plan. Per deck, in formation; confirm. |
| Supply product not ready by anchor launch → conversion endpoint missing | **HIGH** | Confirm Supply timing. If gap, interim target = Membership $29/mo or waitlist for Supply. |
| Anchor page ranks but doesn't convert | medium | $500 paid-traffic test in week 4 catches this before SEO compounds. |
| Anchor page doesn't rank (SEO competition) | medium | "Quest blood test results explained" has lower competition than generic "blood test explained" — niche-specific intent + brand-mention helps. |
| Regulator reads a page and calls it medical advice | **HIGH** | G1–G7-equivalent checklist + clinician review. Pages never diagnose, prescribe, or treat. Trust block on every page. Supply is a separate DSHEA-governed surface. |
| FTC reads Supply copy and finds disease claims | **HIGH** (but out of this brainstorm's scope) | Supply's own DSHEA review process; flagged as prerequisite. |
| Channels 1 and 2 deliver 500 by month 6 without channel 3 → SEO never gets validated | low | Acceptable. Channel 3 is one of three paths, not the bet. |
| Programmatic-generation pressure re-enters scope mid-work | medium | Explicit "deferred to follow-up plans" framing. Re-evaluate after Anchor #1 ranks AND converts. |

## Recommended Next Steps

1. **Resolve the two gates** — clinician advisor (named, engaged, available) + Supply product timing. Without both, the engineering plan can't ship a conversion endpoint.
2. **`/ce:plan`** for the channel-3 engineering — public upload route, preview-tier translation, email-only signup, Supply protocol preview, physician-summary download, measurement events. Likely 4–6 implementation units.
3. **Parallel:** write Anchor #1 draft against the template — content work, can run before engineering finishes. **Channel 3-only** — outreach is channels 2; not in this artifact.
4. **Week 4–6:** Anchor #1 ships. $500 paid-traffic test. Measure.
5. **Week 8–10:** Anchor #2 ships if Anchor #1 is converting. Otherwise iterate on Anchor #1.
6. **Week 10–12:** Decide on programmatic scaling based on actual data.

## Sources & References

- [MorningForm pre-seed deck](../../../MorningForm-PreSeed-Deck-US.pdf) — primary source of truth for positioning, pricing, audience, milestones
- [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](2026-04-21-regulatory-posture-requirements.md) — original G1–G7 framing (UK posture, retained as conceptual base; this artifact extends it to US-equivalent)
- [docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md](../plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md) — funnel measurement (shipped, PR #83)
- [docs/ideation/2026-05-06-open-ideation.md](../ideation/2026-05-06-open-ideation.md) — origin ideation
- US trusted sources to cite from pages: Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed journals
- Relevant US regulatory frameworks: FDA disease-claim rules (informational surfaces), DSHEA 1994 (Supply product), FTC truth-in-advertising
