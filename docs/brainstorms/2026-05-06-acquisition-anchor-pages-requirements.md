---
date: 2026-05-06
revised: 2026-05-06
topic: acquisition-anchor-pages
window: months 1–6 (digital channel; pre-Studio, pre-Supply)
target: 500 paying customers by month 6 (deck milestone); 50 paying via digital channel by month 2 as page-validation milestone
audience: men 30–50 (US, premium spenders)
strategy: 1–2 anchor SEO/GEO pages → upload → Form Intelligence translation → Membership subscription ($29/mo). Supply ($69/mo) is a cross-sell once Supply ships.
out_of_scope: founder outreach, premium-gym/concierge partnerships, Studio rollout — all separate channels
clinician_posture: Path A (tech-first, no clinician on the public surface). Regulatory protection comes from page-voice discipline, not visible disclaimers.
supersedes: prior 2026-05-06 drafts — re-aligned with deck (US/$/three-layer product) and with Form-Intelligence-as-wedge framing (validation pitch, not supplement pitch)
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

Locked: **1–2 anchor SEO/GEO pages, US-framed, ending in Form Intelligence Membership ($29/mo).** Engineering: medium. Programmatic scaling deferred until anchors prove the funnel.

**Why Form Intelligence first, Supply later:**
- The deck describes a three-layer product: Studios (Layer I, acquisition), Form Intelligence (Layer II, IP — "what you understand"), Supply (Layer III, hero — "what you do"). The wedge is **Layer II**, not Layer III.
- Form Intelligence answers a different (and earlier) question than Supply: not *"what should I take?"* but *"is what I'm already doing actually working?"* That question doesn't need a manufacturer, fulfillment, or a personalized-formulation algorithm. It just needs the translation layer the deck already says is the IP.
- Supply isn't ready (per founder confirmation) — making it the conversion CTA blocks the entire 12-week plan on a workstream that isn't this brainstorm's scope. Membership is shippable now.
- Validation intent compounds with subscription. Diagnostic intent (one-time interpretation) doesn't. Membership-via-validation is structurally a better fit for $29/mo recurring than Supply-via-prescription.
- Lower regulatory surface. "Did your numbers move" is even further from medical advice than "what does this number mean." MorningForm is positioned as a coach for what users are already doing, not as a diagnostician.

When Supply ships: Membership users get *"based on your last 3 panels and what you're already taking, your personalized formulation would be X — switch to Supply $69/mo for it shipped monthly."* Cross-sell, not first-sell.

Rejected:
- Founder outreach as channel-3 work (it's channel 2, separate).
- Full programmatic 10-page system in 12 weeks (multiplying zero).
- Supply as the primary conversion target (Supply not ready; Membership is shippable now and is the better wedge anyway).

## Regulatory Frame (Tech-First, Framing as Safeguard)

The [existing regulatory-posture brainstorm](2026-04-21-regulatory-posture-requirements.md) (G1–G7) was written with a UK/NHS posture. The deck is US, tech-first, no clinician credentials on the public surface. The protection isn't visible disclaimers — it's **page-voice discipline**.

### What's on the public surface
- **Light footer disclaimer** ("MorningForm provides data interpretation; it is not a medical service") — visible but quiet, like Whoop Labs / Levels / Lumen
- **ToS-at-signup** captures the legal protection where it actually matters
- **No clinician credentials, no advisory-board names, no "reviewed by Dr. X."** Brand stays tech-first.

### What's NOT on the public surface
- Loud "TALK TO YOUR DOCTOR" warnings
- Medical-advisor headshots
- "Reviewed by" stamps

### What IS load-bearing — the framing in every piece of copy

The page-voice rules (apply to every word of copy on every page + every translation output):

- ❌ *"Your testosterone is sub-optimal — here's what to do"* → medical advice, no disclaimer saves you
- ✅ *"Your testosterone is at 380 ng/dL — that's below the median for your age cohort. Here's what's known about how that range tends to feel"* → data interpretation, no disclaimer needed beyond the quiet footer
- ❌ *"You should take X"* / *"Treat with Y"* / *"Cure Z"* — anywhere
- ✅ *"Other men in your demographic with similar numbers tend to..."* / *"Here's how this compares to..."* / *"Track this over time to see if [your current effort] is working"*
- No specific Rx drug names
- No dose strings on the informational surface
- No diagnostic claims ("you have X")
- Decision points route to "track this over time," "consider retesting," "discuss with your physician" if symptoms warrant — never "treat with..."
- Every numeric/clinical claim cites a US-trusted source (Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed)

### Supply (when it ships, separate workstream)

DSHEA 1994 governs the Supply product itself. Personalized formulations based on bloodwork are permitted; no disease/treatment claims. The seam: the page never says "take 5,000 IU Vitamin D"; the translation says "your numbers and trend"; the Supply commercial surface (when it exists) handles formulation and copy under DSHEA.

### Risk profile of Path A

Whoop, Levels, Lumen all run this exact posture. The framing is the safeguard. The known failure mode is a single page or a single translation output that crosses into prescriptive language — caught by editorial review, not by a disclaimer.

## Requirements Trace

- **R1** Anchor page #1 ranks in top-10 organic for at least one high-intent US query within 12 weeks.
- **R2** Anchor page #1 converts ≥5% of organic visitors into a free data upload.
- **R3** Free uploads convert ≥20% to paid Form Intelligence Membership ($29/mo) within 14 days. (Lower than the Supply target because the price is lower; recurring rev/user math still works at this rate.)
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
| **1** | **"Is your protocol actually working? Read your bloodwork over time"** | validation intent (men actively training/dieting/supplementing who want feedback) | **safe** | **ANCHOR #1.** New positioning per founder call: lead with Form Intelligence as the wedge, not Supply. Hero question = "is what I'm already doing actually moving my numbers?" Conversion: Membership $29/mo. Compounds naturally with subscription — every upload increases value of the next translation. |
| **2** | **"Quest blood test results explained — what your numbers mean for men 30–50"** | diagnostic intent (one-time question) | **safe** | **ANCHOR #2.** Higher search volume than #1, lower value-per-visitor (one-time intent doesn't compound). Same upload → translation flow. Soft upsell: *"Want a deeper report? $39"* for high-intent diagnostic visitors. |
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

### Anchor #1: "Is your protocol actually working? Read your bloodwork over time."

**Slug:** `/is-your-protocol-working`

**SEO title** (≤60 chars): "Is Your Protocol Actually Working? Track Bloodwork Over Time"
**Meta description** (≤155 chars): "Lifting, dieting, supplementing — but is it actually working? MorningForm reads your bloodwork, wearable data, and protocol so you can see what's moving."
**H1:** "Is what you're doing actually working?"

**Above-the-fold (GEO-citable, written as the answer to the visitor's question):**
> You started lifting heavy. You changed your diet. You're stacking creatine, vitamin D, omega-3. Your wearable says recovery is up — but your bloodwork says ferritin is down. **Is what you're doing actually working?** MorningForm reads your numbers, your training, your sleep, and your protocol — and tells you what's moving and what isn't. Free to start.

**Page outline:**

1. **The validation gap** (~200 words). Most men 30–50 are doing health things — training, diet, supplements, sleep — without a feedback loop. Bloodwork happens once a year (if at all); wearable data sits unread; supplements get taken on faith. **Without translation across all three, you're guessing.**
2. **What MorningForm reads** — three columns: bloodwork (Quest / LabCorp / BioReference / NHS / private), wearable streams (Whoop / Oura / Apple Health / Garmin / Fitbit), lifestyle (sleep, training, diet, supplement stack)
3. **What "working" actually looks like** — three synthetic worked examples:
   - "Started TRT 90 days ago — is it working?" (testosterone trend + SHBG + hematocrit + sleep + libido check-in)
   - "On a high-protein cut for 12 weeks — is it sustainable?" (HbA1c + ALT + cortisol-adjacent markers + recovery + body composition)
   - "Added creatine, vitamin D, magnesium — anything moving?" (ferritin + 25(OH)D + RBC + sleep + recovery)
   Each example shows: data in → translation out → "here's what's working, here's what isn't, here's what to keep watching"
4. **Upload section:** *"Upload your panel + connect your wearable — see what's moving in 60 seconds, free."*
5. **What you get with Form Intelligence Membership** ($29/mo):
   - Ongoing translation of every new panel + wearable update
   - Trend dashboard — *"is your protocol working?"* answered every time you re-test
   - Plain-English read on what's moving and what's not
   - Quarterly check-in cadence
   - Cancel anytime
6. **Trust block** (same on every page):
   - We translate your data — we don't replace your physician
   - For severe or unexplained results, we say so and route you to a clinician
   - Tech-first; quiet on credentials, loud on rigor
7. **CTA primary:** *"Start free — upload your data and see what's moving"*
8. **CTA secondary:** *"Or learn more about how MorningForm reads your data →"* (links to methodology page)
9. **FAQ block** (GEO-friendly, AI-engine-quotable):
   - "How do I know if creatine / vitamin D / [supplement] is actually working for me?"
   - "What blood markers should I track to see if my training is working?"
   - "Is my testosterone replacement working — what should I look for?"
   - "Can I track my protocol against my wearable data and bloodwork together?"
   - "Does MorningForm work without a wearable?" (Yes — bloodwork-only is the simpler entry; wearable + bloodwork compounds.)
   - "What if I just have one blood test?" (You see baseline + interpretation; the value compounds with the second test.)

**Trust anchors (cited inline):** Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed journals.

**Internal links:** to Anchor #2 (Quest results explained) + the methodology page (#10).

**What this page DOES NOT include:**
- Specific Rx drug names or doses (TRT discussed only as a category, never as a specific drug+dose)
- Imperative-treatment language ("take X mg of Y")
- Disease claims
- Supplement rankings or "best stack" lists
- Visible clinician credentials

**Conversion flow it triggers:** see Output 6.

---

### Anchor #2 (sketch): "Quest blood test results explained — what your numbers mean for men 30–50"

**Slug:** `/explainers/quest-blood-test-results-explained`
**Intent:** diagnostic — visitor *has* one-time results and a question.

**Page shape:**
1. Direct answer: comparison table of ~12 markers — `marker | what it tells you | what 'in range' can still mean | what context shifts it`
2. Section: "Why 'in range' isn't 'optimal'" — synthetic worked example (testosterone 380 in range but bottom-quintile)
3. **CTA primary:** *"Upload your panel — see what your numbers mean in context, free"*
4. **CTA secondary (soft upsell for high-intent visitors):** *"Want a deeper report? $39 one-time"*
5. **CTA tertiary (the compound move):** *"Or get ongoing tracking — Form Intelligence Membership $29/mo"*
6. Section: "Once you've seen one panel, the next test is when it gets interesting" → links to Anchor #1
7. FAQ: GEO-optimized
8. Trust block (same as #1)

This page validates the template ports — same upload→translation flow, different intent class, three CTA tiers (free / one-time / subscription).

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

Primary:   "Start free — upload your data and see what's moving"
           (free signup → Membership $29/mo upsell on day 7-14)
Secondary: "Want a deeper report? $39 one-time"
           (offered to high-intent diagnostic visitors)
[When Supply ships]: Membership users see Supply cross-sell at $69/mo

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

## Output 6 — Conversion Flow (Page → Upload → Translation → Membership)

```
[1] Visitor lands on /is-your-protocol-working (or /explainers/...)
       (organic search, AI-engine cite, paid traffic test)
              │
              ▼
[2] Reads above-the-fold + scrolls
        │
        ├──► (~70% bounce expected on first traffic — normal)
        │
        ▼
[3] CTA: "Upload your data — see what's moving in 60 seconds"
              │
              ▼
[4] Lands on /upload/results
       — minimal-friction PDF upload (panel) + optional wearable connect
       — NO signup gate at this step
       — extracts values, classifies, flags
              │
              ▼
[5] Free Form Intelligence preview (post-upload)
       "We see 3 things worth attention: ferritin (low-normal), 
       LDL (in range, trending up), testosterone (380 — bottom quintile 
       for your age). Sign up free to see your full read + ongoing tracking."
              │
              ▼
[6] Email-only signup gate (NOT credit card)
       — captures email + name + DOB
       — adds to onboarding sequence
              │
              ▼
[7] Full Form Intelligence translation (free, post-signup)
       — context-aware reading across markers
       — single-snapshot read (this is one panel)
       — clear positioning of the Membership upsell:
         "the next test is when it gets interesting — 
          tracking your protocol over time"
       — physician-summary download (existing route_to_gp_prep tier)
              │
              ▼
[8] Day 7–14: Membership upsell sequence
       
       PRIMARY:  Form Intelligence Membership $29/mo
                 — ongoing translation as new panels/wearable data arrive
                 — trend dashboard, "is it working?" answered each retest
                 — recurring revenue, validates digital channel
       
       SECONDARY (one-time, for diagnostic-intent visitors):
                 — $39 deeper report
                 
       FUTURE (when Supply ships): Supply cross-sell $69/mo to Membership users
              │
              ▼
[9] Activation-funnel script (PR #83) measures progression at each step
```

**Critical regulatory lens on every step:**
- Step 5 must NEVER say "you have X" or "you should take Y." It says "this is what these numbers mean / this is what they tend to look like in your demographic."
- Step 7 emphasises *tracking over time* as the primary value, not *prescription*.
- Step 8 sells *the loop*, not *a treatment*.

**Engineering required for the digital channel to work end-to-end:**
- Public `/upload/results` route (no-auth file upload + extraction) — **does not exist**
- Form Intelligence preview tier — constrained translation output for the free pre-signup step
- Email-only signup (no card upfront)
- Membership Stripe subscription checkout ($29/mo) — simple, well-understood pattern
- Per-step funnel events feeding the activation-funnel script (PR #83)
- Day-7-and-14 Membership upsell email sequence
- *(Future, gated on Supply product workstream)*: Supply checkout, formulation algorithm, fulfillment

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

## Output 8 — Clinical Safety Framework (Path A — Tech-First, No Public Clinician)

Path A regulatory protection comes from **page-voice discipline**, not clinician credentials on the page. The reviewer is the founder + a careful editorial pass; if a complaint or escalation surfaces later, retain a clinician on a light retainer at that point. Until then, the framing is the safeguard.

Per-page checklist (gates publish):

- [ ] No specific Rx drug names
- [ ] No dose strings on the informational surface (`mg`, `IU`, etc. for any specific compound)
- [ ] No imperative-treatment language — grep for `you should`, `take`, `treat with`, `start`, `recommend`, `cure`, `fix`
- [ ] All decision-points route to "track this over time," "discuss with your physician [if symptoms warrant]," "consider retesting" — never "treat with..."
- [ ] No diagnostic claims ("your high LDL means you have...")
- [ ] Translation outputs use comparative language ("below median for your age cohort") — not directive language ("you need to...")
- [ ] Topic stays inside MorningForm's scope: longitudinal record + translation + ongoing tracking
- [ ] Every numeric/clinical claim cited: Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed
- [ ] Worked examples labeled "Synthetic example"
- [ ] Quiet footer disclaimer present ("MorningForm provides data interpretation; it is not a medical service")
- [ ] No clinician credentials, advisor names, or "reviewed by Dr. X" stamps anywhere on the public surface

**Reviewer:** founder + careful editorial pass (Path A). If a complaint, escalation, or volume threshold (~1000+ paying users) is reached, upgrade to Path B (clinician on light retainer).

**Failure mode to watch:** a single translation output crossing into prescriptive language. Caught by editorial QA on the translation layer's prompt surface, not by a disclaimer.

**When Supply ships (separate workstream):** DSHEA 1994 governs — personalized formulations + structure/function claims permitted; no disease/treatment claims; FDA-registered manufacturer required.

## Output 9 — App-Side Recommendations

What MorningForm needs to ship *in support of* the anchor pages:

**Must-have for Anchor #1 to convert (12-week scope):**

1. **Public `/upload/results` route** — no-auth PDF upload + optional wearable connect, runs the existing intake-extraction pipeline.
2. **Form Intelligence preview tier** — constrained translation output, returns 2–4 paragraphs with classified flags + the *"the next test is when it gets interesting"* hook. Reuses existing scribe infrastructure with a `tier=preview` mode.
3. **Email-only signup** — replaces any signup that requires card-on-file.
4. **Form Intelligence Membership Stripe checkout** — $29/mo subscription; well-understood pattern, no manufacturing dependency.
5. **Membership upsell sequence** — day 7 + day 14 emails after free signup; positions Membership as "the loop is the value."
6. **Trend dashboard** — *"is your protocol working?"* answered visually across panels. The Membership product surface.
7. **Physician-summary download** — already exists via `route_to_gp_prep`; surface as PDF in post-signup flow.
8. **Per-page measurement events** — extend activation-funnel events with `anchor_page_visit` and `anchor_page_to_upload`.
9. **Anchor-page-driven onboarding sequence** — different from generic onboarding; assumes the user arrived with a "is my protocol working" question.

**Gated on Supply product workstream (separate plan, future):**
- Supply Stripe subscription checkout ($69/mo cross-sell)
- Personalized formulation algorithm
- Manufacturer + fulfillment integration
- Supply commercial surface (DSHEA-governed)

**Should NOT build for this:**
- A CMS for content authoring (anchor pages are TSX directly, hand-authored)
- Programmatic page generation (premature)
- Per-cohort sub-funnels

## Outstanding Questions

### Resolved during brainstorm

- **Geography?** US, per deck.
- **Cohort age band?** 30–50, per deck.
- **Pricing?** $299 Studio · $69/mo Supply (future cross-sell) · $29/mo Membership (current primary) · $89 Bundle, per deck.
- **What does the page convert to?** Form Intelligence Membership $29/mo. Supply is a future cross-sell once Supply ships.
- **Clinician posture?** Path A — tech-first, no public clinician. Framing-as-safeguard. Upgrade to Path B (light retainer) at scale or on first complaint.
- **Anchor #1 topic?** *"Is your protocol actually working? Read your bloodwork over time."* Validation intent, compounds with subscription.
- **Anchor #2 topic?** *"Quest blood test results explained — what your numbers mean for men 30–50."* Diagnostic intent, higher search volume, three-tier CTAs.
- **Programmatic now or later?** Later. After Anchor #1 ranks AND converts.

### Resolve before planning

- **None.** Both gates from the prior brainstorm draft are resolved: clinician posture is Path A (no public clinician needed); conversion CTA is Membership $29/mo (Supply readiness no longer blocks).

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

1. **`/ce:plan`** for the channel-3 engineering — public upload route, preview-tier translation, email-only signup, Membership Stripe checkout, trend dashboard, physician-summary download, measurement events, day-7/14 upsell sequence. Likely 5–7 implementation units.
2. **Parallel:** write Anchor #1 draft against the template — content work, can run before engineering finishes.
3. **Week 4–6:** Anchor #1 ships. $500 paid-traffic test. Measure.
4. **Week 8–10:** Anchor #2 ships if Anchor #1 is converting. Otherwise iterate on Anchor #1.
5. **Week 10–12:** Decide on programmatic scaling based on actual data. Decide whether to upgrade clinician posture from Path A to Path B based on volume + any escalations seen.

## Sources & References

- [MorningForm pre-seed deck](../../../MorningForm-PreSeed-Deck-US.pdf) — primary source of truth for positioning, pricing, audience, milestones
- [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](2026-04-21-regulatory-posture-requirements.md) — original G1–G7 framing (UK posture, retained as conceptual base; this artifact extends it to US-equivalent)
- [docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md](../plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md) — funnel measurement (shipped, PR #83)
- [docs/ideation/2026-05-06-open-ideation.md](../ideation/2026-05-06-open-ideation.md) — origin ideation
- US trusted sources to cite from pages: Mayo Clinic, Cleveland Clinic, NIH, JAMA, NEJM, peer-reviewed journals
- Relevant US regulatory frameworks: FDA disease-claim rules (informational surfaces), DSHEA 1994 (Supply product), FTC truth-in-advertising
