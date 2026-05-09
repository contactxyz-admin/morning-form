---
title: "feat: Acquisition anchor pages — channel-3 digital funnel (US)"
type: feat
status: superseded
superseded_by: docs/plans/2026-05-09-001-feat-programmatic-seo-geo-plan.md
superseded_reason: "Scope shifted from 1–2 anchor pages → programmatic SEO/GEO system across 8 male-cohort clusters; pricing model changed; geography under review. Confidence-check pass surfaced material schema/middleware gaps that would need rework anyway. See review thread in session 2026-05-09."
date: 2026-05-06
origin: docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md
---

# feat: Acquisition anchor pages — channel-3 digital funnel (US)

> **Superseded 2026-05-09.** This plan was scrapped after a confidence-check pass surfaced (a) schema-reality contradictions with `User.email`, `ScribeAudit.tier`/`scribeId`, and the middleware allowlist; (b) self-contradictions on R3/R7 measurement, phase-gate timing, and the deeper-report unit ownership; (c) reusable primitives ignored (R15 violations against `MagicLinkRateLimit` and the existing IP-hash helper); (d) strategic challenges from the adversarial review around the 30-member milestone and Path A regulatory framing. Replaced by the programmatic SEO/GEO plan referenced in frontmatter. The findings still apply to the successor and are folded into its design.

## Overview

Stand up the digital acquisition channel from the [pre-seed deck's three-channel mix](../../../MorningForm-PreSeed-Deck-US.pdf): two SEO/GEO landing pages, a no-auth public upload route, a Form Intelligence preview tier, email-only signup, a Membership ($29/mo) Stripe loop, day-7/14 lifecycle emails, and a trend dashboard. The wedge is **Form Intelligence**, not Supply — the hero question is *"is what I'm doing actually working?"*, not *"what should I take?"*. Supply ($69/mo) is the future cross-sell once that workstream lands.

Two phases:
- **Phase 1 (Weeks 1–4):** free flow + measurement. Pages live, public upload, free preview, email-only signup. No payments yet. End state validates whether the digital channel converts visitors → email signup at the rates the brainstorm targets.
- **Phase 2 (Weeks 5–8):** monetization + retention. Stripe Membership, day-7/14 upsell sequence, trend dashboard. End state closes the $29/mo loop end-to-end.

Path A regulatory posture (tech-first, no public clinician). Protection comes from page-voice discipline and editorial-QA-as-code, not visible disclaimers or "reviewed by Dr. X" credentials.

## Problem Frame

The deck's three channels carry the 500-by-month-6 milestone: premium-gym/concierge partnerships (channel 1), founder-network/PR (channel 2), and digital (channel 3). Channels 1 and 2 are people-led and live alongside this work. Channel 3 — search + AI-engine landing pages funneling into upload→translation→Membership — is **this plan's entire scope.**

The validation milestone for channel 3: **≥50 paying Membership customers via the digital channel by end of Month 2**, proving the page→Membership funnel earns further investment. If the channel hits that, programmatic scale-up follows. If not, channels 1+2 carry months 1-6 and digital re-anchors as a slower compounding bet.

The brainstorm at [docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md](../brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md) (origin) defines the strategy. This plan defines the engineering.

## Requirements Trace

From origin (R1–R10):

- **R1** Anchor page #1 ranks in top-10 organic for at least one high-intent US query within 12 weeks. → U7, U8 (page exists, indexable, GEO-structured)
- **R2** Anchor page #1 converts ≥5% of organic visitors into a free data upload. → U2, U3, U4 (upload route works), U8 (page CTA prominent)
- **R3** Free uploads convert ≥20% to paid Form Intelligence Membership ($29/mo) within 14 days. → U5 (preview hooks the loop), U11 (Stripe checkout), U12 (day-7/14 sequence drives upgrade)
- **R4** Channel 3 contributes ≥50 paying customers by end of month 2. → all units; measurement gate at U10
- **R5** Every shipped page passes a clinical-safety review before publish. Zero exceptions. → U8 (editorial-QA Vitest gate calls `forbidden-phrases.ts`)
- **R6** Pages designed for AI-answer-engine surfacing (GEO): question-led headings, direct answers, structured FAQ, schema.org `MedicalWebPage` + `FAQPage`. → U8, U9
- **R7** Measurement system tracks (a) organic + AI-engine traffic, (b) page→upload, (c) upload→Membership. Internal dashboard. → U3 (LandingPageVisit), U10 (funnel-script extension)
- **R8** Page → upload → translation → Membership flow works end-to-end for at least one query class. → U2 + U4 + U5 + U6 + U11 (full pipeline)
- **R9** Second anchor page producible from the template in ≤2 days editorial. → U8 (template lands with #1), U9 (validates port)
- **R10** No Rx drug names, dose strings, imperative-treatment, disease/treatment claims, supplement rankings on any informational surface. → U1 (typed forbidden-phrases reuse), U8 (editorial-QA gate)

CTPO-imposed (this plan):

- **R11** Source-of-truth single-module discipline for pricing, scribe-tier IDs, email-segment names, anchor slugs. No string literals of these in `app/explainers/**` or `app/upload/**`. → U1
- **R12** No silent fallbacks. Every fallback path emits a counter and surfaces in a `Diagnostics:` footer. Editorial-QA rejections, PDF-extraction failures, sanitiser hits, Turnstile denials, Stripe webhook events not matched to a user, email send failures all counted. → U10
- **R13** Subscription state plumbed explicitly from Stripe → tier resolver. No defaults. Anti-Dexcom pattern. → U11
- **R14** No new LLM call paths bypass the existing `LLMClient` (Edge Config kill-switch, DPA SHA pin, zero-retention). → U5
- **R15** No parallel prompt-injection sanitisers, parallel `forbidden-phrases.ts`, or parallel rate-limit primitives. Re-use existing modules. → U4, U5, U8

## Scope Boundaries

**In scope (12 weeks, channel 3 only):**
- 2 anchor pages + methodology page + 3 legal pages (privacy/safety/contact — currently dead links from homepage footer)
- Public no-auth `/upload/results` route with full security hardening (Turnstile, magic-byte MIME, encrypted-PDF reject, page-count cap, body-stream cap, per-IP rate limit)
- Provisional User pattern (email-less, anonymous-session-token cookie, upgraded at signup)
- Form Intelligence preview tier (≤4 paragraphs, no drug/dose, runs through existing `LLMClient`)
- Email-only signup (Magic Link reuse) → provisional-User upgrade
- Membership $29/mo Stripe subscription (checkout, webhook, explicit subscription-state plumbing)
- Day-7/14 lifecycle email sequence (Vercel Cron + queue table + Resend factor)
- Trend dashboard (Membership product surface — biomarker over time)
- LandingPageVisit model + visit beacon + 2 new activation-funnel stages
- Editorial-QA Vitest gate calling `forbidden-phrases.ts` against rendered TSX
- ESLint rule banning string literals of pricing/tier/slug/segment names

**Not in scope (separate channels or separate plans):**
- Founder-network outreach (channel 2)
- Premium-gym / concierge partnerships (channel 1)
- Studio rollout (deck month 9, separate plan)
- Supply product: formulation algorithm, manufacturer, fulfillment, DSHEA copy review (separate workstream — gate on Supply readiness for the Membership-→-Supply cross-sell)
- Photo intake support (only PDF in this plan; UI accepts but server rejects today, leave that gap until a real signal demands it)
- Programmatic generation of pages 3-10 from the brainstorm's taxonomy (defer until anchors prove out)
- Per-cohort sub-funnels in activation-funnel script (single funnel for now)
- AI-engine GEO automation tools (manual weekly check is the v1)

### Deferred to Separate Tasks

- Supply-product workstream + Stripe second product line: separate plan
- Programmatic page generation across biomarkers × symptoms × cohorts: separate plan once anchors rank+convert
- Studio booking flow: separate plan, deck month 9
- Editorial-QA upgrade from Path A to Path B (clinician on light retainer): triggered by a real complaint or volume crossing ~1000 paying users
- Photo extraction (OCR or Claude vision): separate plan once a real user signal demands it
- Bot-protection upgrade beyond Turnstile (e.g. Cloudflare Bot Management): separate plan if Turnstile alone proves insufficient

## Context & Research

### Relevant Code and Patterns

- **Public route precedent** — [src/middleware.ts](../../src/middleware.ts) lines 26-48 (allowlist + security headers); [src/app/demo/layout.tsx](../../src/app/demo/layout.tsx) (no-auth chrome). One-file middleware edit + folder mirror to add `/upload/...` and the `/explainers/*` namespace.
- **Intake pipeline** — [src/app/api/intake/documents/route.ts](../../src/app/api/intake/documents/route.ts) is the PDF-upload precedent; auth-gated today. Reuse `extractPdfText` + `chunkLabReport` + Claude extraction + `ingestExtraction` + `storePdf`. The userId-scoping invariant means the no-auth variant needs a provisional User row.
- **Scribe primitives** — [src/lib/scribe/policy/registry.ts](../../src/lib/scribe/policy/registry.ts), [src/lib/scribe/policy/forbidden-phrases.ts](../../src/lib/scribe/policy/forbidden-phrases.ts), [src/lib/scribe/policy/enforce.ts](../../src/lib/scribe/policy/enforce.ts), [src/lib/scribe/specialties/registry.ts](../../src/lib/scribe/specialties/registry.ts), [src/lib/llm/linter.ts](../../src/lib/llm/linter.ts) (`LintSurface`). Add a `'preview'` lint surface; new schema + prompt module under `src/lib/topics/prompts/`.
- **Topic compile shape** — [src/lib/topics/compile.ts](../../src/lib/topics/compile.ts), [src/lib/topics/types.ts](../../src/lib/topics/types.ts) (`TopicCompiledOutputSchema`). Pattern for the new `PreviewSummarySchema`.
- **LLMClient + safety guardrails** — DPA SHA pin, Edge Config kill-switch (`llm.generation.disabled`), zero-retention. Every new LLM call goes through this client.
- **Auth-email pattern** — [src/lib/auth/email.ts](../../src/lib/auth/email.ts) — Resend HTTP, typed errors, `fetchWithRetry`, dev/prod env split. Mirror this shape for `src/lib/billing/stripe.ts` and `src/lib/marketing/email.ts`.
- **Magic-link flow** — [src/lib/auth/magic-link.ts](../../src/lib/auth/magic-link.ts) — reused unchanged for email-only signup.
- **Disclaimer component** — [src/components/ui/disclaimer.tsx](../../src/components/ui/disclaimer.tsx). Compliance-static-copy test ([src/lib/compliance/static-copy.test.ts](../../src/lib/compliance/static-copy.test.ts)) gates regulatory copy to allowlisted files. Use the existing component, never fork the copy.
- **Activation-funnel registry** — [src/lib/metrics/activation-funnel.ts](../../src/lib/metrics/activation-funnel.ts) — `ACTIVATION_STAGES` ordered tuple, R7 single-source-of-truth. Two new stages slot in, derived from `LandingPageVisit` table.

### Institutional Learnings (load-bearing)

The team has **explicitly named two cross-cutting failure patterns** in [docs/ideation/2026-05-06-open-ideation.md](../ideation/2026-05-06-open-ideation.md). Both apply directly to this plan:

1. **"Silent fallback"** — malformed input resolves to a default and the operator never sees it. Canonical examples: `twMerge` dropping `text-[#FDFBF6]` for 4 days; Dexcom client falling back to mock glucose when token wasn't plumbed; `getOrCreateDemoUser()` returning a fake user; redactors filtering empties without logging. **Application here:** every fallback in the new flow needs a counter (R12). Editorial-QA rejections counted, Turnstile denials counted, Stripe webhook misses counted, PDF-extraction failures counted. *If the operator can't see the rate, the gate isn't on.*

2. **"Source-of-truth drift"** — value lives in N places, drifts in M. Canonical: `HEADLINE_METRIC_KEYS` duplicated 4 places; Tailwind tokens vs runtime tokens (the twMerge bug). **Application here:** pricing strings, scribe-tier IDs, anchor slugs, email-segment names — all four are drift surfaces that span pages, configuration, and runtime. R11: typed modules + ESLint rule.

Other relevant prior solutions:

- **Dexcom real-path hardening** ([docs/plans/2026-04-15-003-fix-dexcom-real-path-hardening-plan.md](2026-04-15-003-fix-dexcom-real-path-hardening-plan.md)) — canonical silent-fallback example. Subscription-state plumbing follows the typed-result + zod-schema + fail-loud pattern from this plan.
- **Health-graph pivot Unit 6** ([docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md](2026-04-15-004-feat-health-graph-pivot-plan.md) lines 416-472) — upload-endpoint hardening checklist (magic-byte, encrypted-PDF reject, page-count cap, body-stream cap, DB-only rate limit). Reused in U4 with anonymous-IP keying instead of userId.
- **Activation funnel** ([docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md](2026-04-21-002-feat-activation-funnel-instrumentation-plan.md)) — derive-don't-emit principle for funnel stages. R7 single-typed-module enforced. Filed silent-fallback follow-up (malformed citations counter, requested-vs-matched cohort, Diagnostics footer) — implemented here as part of R12.
- **Regulatory G1–G7** ([docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](../brainstorms/2026-04-21-regulatory-posture-requirements.md)) — `forbidden-phrases.ts` module is the runtime version of the manual checklist. Editorial-QA Vitest gate must call the same module the runtime safety filter calls (R15).

### External References

- [Vercel Cron jobs](https://vercel.com/docs/cron-jobs) — daily-runner pattern for the email sequence
- [Stripe Checkout — Next.js subscription pattern](https://docs.stripe.com/checkout/quickstart) — webhook-signed integration template
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — invisible bot protection on the no-auth upload
- [Resend Lifecycle / Audiences](https://resend.com/docs/dashboard/audiences) — opt-in alternative to in-DB queue, considered + rejected for in-DB scheduling fit (see Key Technical Decisions)
- [Schema.org MedicalWebPage / FAQPage](https://schema.org/MedicalWebPage) — GEO surface markup for AI engines
- [DSHEA 1994 (US)](https://www.fda.gov/food/dietary-supplements/) — governs Supply when it ships, NOT in scope here

## Key Technical Decisions

- **D1 — Provisional User row, not parallel AnonymousIntake.** The intake pipeline is `userId`-scoped throughout. A provisional `User` row with `email = null` and an `anonymousSessionToken` cookie costs one nullable column instead of plumbing a parallel write path. Email-less Users are upgraded at signup (set email + name + DOB). The whole existing extraction → ingest path is unchanged.
- **D2 — Public anchor pages bypass the noindex middleware branch.** `/demo` is non-indexable; SEO landing pages must be the opposite. The `/explainers/*` routes are excluded entirely from `config.matcher` (treated like `/`), while `/upload/*` and `/api/upload/*` get the same security-header treatment as `/demo`. Two different categories of public surface.
- **D3 — Form Intelligence preview tier as a new compile mode, not a new model.** Reuse `LLMClient` (DPA pin + kill-switch + zero-retention), reuse `forbidden-phrases.ts`, reuse the existing prompt-injection sanitiser, reuse `chunkLabReport`. Add: one new `PreviewSummarySchema`, one new prompt module under `src/lib/topics/prompts/`, one new entry in `LintSurface = 'preview'`. ~1 schema + 1 prompt + 1 lint entry. No parallel scribe.
- **D4 — Stripe Subscription state is a typed result, not a default.** Anti-Dexcom: `getMembershipState(userId)` returns `'free' | 'membership-active' | 'membership-grace' | 'membership-cancelled'` — never a default. `MembershipStateError` thrown when Stripe is unreachable; tier resolver fails loud. Webhook is the source of truth; checkout-completed event sets state synchronously.
- **D5 — In-DB email queue + Vercel Cron, not Resend Audiences.** Resend Broadcasts is a SaaS-side scheduler; the day-7/14 sequence has small per-user logic (skip if already paid, suppress if unsubscribed) better expressed in our DB. `MarketingEmailSchedule` table + Vercel Cron daily runner + factor `sendResendEmail` from the existing `email.ts`. No new dependency.
- **D6 — `LandingPageVisit` is a domain table, not telemetry.** Visits to anchor pages are first-class artifacts of the acquisition product (R7 single-source-of-truth), not analytics. Keep the schema minimal: `id, anonymousId, anchorKey, createdAt, ipHash, userAgent, referrer, email (nullable, set at signup)`. Two new `ACTIVATION_STAGES` resolvers query this table directly. **Don't** build a generic `Event` table.
- **D7 — Editorial-QA is a Vitest test, not a checklist.** The brainstorm's per-page checklist is the spec; implementation calls `forbidden-phrases.ts` against the rendered TSX of every anchor page in CI. Same module the scribe runtime calls. Failure mode: a single page or translation output crosses into prescriptive language; CI rejects before merge.
- **D8 — Single typed pricing/tier/segment/slug modules, ESLint-enforced.** Pricing strings, scribe-tier IDs, email-segment names, anchor slugs each live in one typed module under `src/lib/marketing/`. ESLint rule `no-marketing-string-literals` bans literal `$<digits>/mo` etc. in `app/explainers/**` and `app/upload/**`.
- **D9 — Per-IP rate limit + Turnstile token, both stored.** The no-auth `/upload/results` endpoint can't rate-limit by `userId`. Key the existing `MagicLinkRateLimit`-shaped table on `(ipHash, day)` and require a Cloudflare Turnstile token validated server-side. Both keys stored on the `LandingPageVisit` row so an abuse pattern is investigable.
- **D10 — Diagnostics footer convention applied to every Path A surface.** Editorial-QA rejection counter, PDF-extraction failure counter, sanitiser-hit counter, Turnstile-denial counter, Stripe webhook unmatched-user counter, email-send failure counter — all visible in the activation-funnel CLI footer and in the internal dashboard. Closes the silent-fallback follow-up filed against [activation-funnel plan lines 258-266](2026-04-21-002-feat-activation-funnel-instrumentation-plan.md).

## Open Questions

### Resolved During Planning

- **Anchor pages indexable?** Yes (D2). `/explainers/*` excluded from middleware matcher. `/upload/*` and `/api/upload/*` get noindex headers like `/demo`.
- **AnonymousIntake table or provisional User?** Provisional User (D1).
- **Email scheduling primitive?** Vercel Cron + in-DB queue (D5). Resend Audiences considered, rejected for skip-if-paid logic fit.
- **Subscription-state contract?** Typed enum, fail-loud (D4).
- **Editorial-QA gate location?** Vitest test calling `forbidden-phrases.ts` (D7).
- **Bot protection?** Cloudflare Turnstile + per-IP rate limit (D9).
- **`LandingPageVisit` shape?** `id, anonymousId, anchorKey, createdAt, ipHash, userAgent, referrer, email` (D6).
- **Photo intake?** Out of scope; PDF only in v1.
- **Build dead-link pages?** Yes — `/privacy`, `/safety`, `/contact` exist as homepage links but no routes today. Anchor-page launch needs them honest.
- **Path A fallback to Path B?** Triggered by complaint OR ≥1000 paying users — separate workstream.

### Deferred to Implementation

- **Exact preview-tier prompt copy** — to be drafted during U5 implementation; constrained by `forbidden-phrases.ts` and the scribe registry's `general` policy.
- **Exact paragraph budget for preview tier** — schema says ≤4; final value chosen during U5 by sampling 20 synthetic-persona panels and tuning.
- **Stripe metadata schema for membership-tier mapping** — the webhook needs to map `subscription.id → user.id`; specific metadata keys settled during U11.
- **Turnstile site-key/secret-key env-var names** — env-var-naming convention used elsewhere followed at U4 implementation time.
- **Trend dashboard initial chart inventory** — single biomarker over time on Day 1; expansion (multi-marker, wearable overlay) deferred to a follow-up.
- **Day-7 + day-14 email subject lines and body copy** — drafted during U12, reviewed against `forbidden-phrases.ts`.
- **Anchor-page slug exact wording** — `/explainers/is-your-protocol-working` and `/explainers/quest-blood-test-results-explained` are working slugs; final SEO research at U8/U9 may shift one or both.

## Output Structure

The plan creates two new top-level route groups (`/explainers/*`, `/upload/*`), three new top-level pages (legal/methodology), three new lib modules, two new Prisma models. Tree:

    src/
    ├── app/
    │   ├── explainers/
    │   │   ├── layout.tsx                                    # shared chrome (NOT noindex — these rank)
    │   │   ├── is-your-protocol-working/
    │   │   │   └── page.tsx                                  # Anchor #1
    │   │   ├── quest-blood-test-results-explained/
    │   │   │   └── page.tsx                                  # Anchor #2
    │   │   └── _template/                                    # shared partials
    │   │       ├── trust-block.tsx
    │   │       ├── upload-cta.tsx
    │   │       └── faq-block.tsx
    │   ├── methodology/page.tsx                              # how Form Intelligence reads data
    │   ├── privacy/page.tsx                                  # close dead homepage link
    │   ├── safety/page.tsx                                   # close dead homepage link
    │   ├── contact/page.tsx                                  # close dead homepage link
    │   ├── upload/
    │   │   ├── layout.tsx                                    # noindex chrome
    │   │   └── results/page.tsx                              # the upload UI
    │   └── api/
    │       └── upload/
    │           ├── results/route.ts                          # the no-auth upload endpoint
    │           ├── visit/route.ts                            # LandingPageVisit beacon
    │           └── webhooks/stripe/route.ts                  # Stripe webhook (outside middleware)
    │   └── api/billing/
    │       └── checkout/route.ts                             # Stripe Checkout session
    │   └── api/cron/
    │       └── marketing-emails/route.ts                     # Vercel Cron daily runner
    ├── lib/
    │   ├── marketing/
    │   │   ├── pricing.ts                                    # SOT for $-strings
    │   │   ├── tiers.ts                                      # SOT for scribe-tier IDs
    │   │   ├── segments.ts                                   # SOT for email-segment names
    │   │   ├── slugs.ts                                      # SOT for anchor slugs
    │   │   ├── email.ts                                      # marketing email factor
    │   │   └── editorial-qa.ts                               # the Vitest-callable gate
    │   ├── billing/
    │   │   └── stripe.ts                                     # Stripe HTTP client (mirrors auth/email.ts)
    │   ├── upload/
    │   │   ├── provisional-user.ts                           # email-less User row + cookie
    │   │   ├── rate-limit.ts                                 # per-IP rate limit
    │   │   ├── turnstile.ts                                  # bot-token verification
    │   │   └── magic-byte.ts                                 # PDF magic-byte verification
    │   ├── topics/
    │   │   └── prompts/preview-summary.ts                    # the new compile mode
    │   └── metrics/
    │       └── activation-funnel.ts                          # MODIFIED: 2 new stages
    ├── components/
    │   ├── marketing/
    │   │   ├── anchor-page.tsx                               # template wrapper
    │   │   ├── upload-cta.tsx
    │   │   └── trust-block.tsx                               # uses Disclaimer
    │   ├── upload/
    │   │   ├── upload-form.tsx                               # client-side dropzone + Turnstile
    │   │   └── preview-summary.tsx                           # render of the preview tier
    │   ├── trends/
    │   │   └── trend-chart.tsx                               # Membership product surface
    │   └── billing/
    │       └── checkout-button.tsx
    └── eslint-rules/
        └── no-marketing-string-literals.js                   # custom ESLint rule
    
    prisma/
    └── schema.prisma                                         # MODIFIED: + LandingPageVisit, MarketingEmailSchedule, Subscription, RateLimit (per-IP)
    
    docs/
    └── compliance/
        └── editorial-qa-test-corpus.md                       # the per-anchor gate corpus
    
    vercel.json                                               # NEW: Vercel Cron declaration

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Sequence: visitor → Membership

```mermaid
sequenceDiagram
    autonumber
    participant V as Visitor (no auth)
    participant P as /explainers/<anchor>
    participant U as /upload/results
    participant API as /api/upload/results
    participant DB as Postgres
    participant LLM as Form Intelligence preview
    participant E as Email (Resend)
    participant S as Stripe
    
    V->>P: GET (organic search / AI engine)
    P->>API: POST /api/upload/visit (beacon)
    API->>DB: INSERT LandingPageVisit
    V->>P: click "Upload your data"
    V->>U: GET /upload/results
    U->>V: form + Turnstile widget
    V->>API: POST /api/upload/results (PDF + Turnstile token)
    API->>API: verify Turnstile, magic-byte MIME, page-count, encrypted-PDF reject
    API->>DB: INSERT provisional User (email=null, anonSessionToken)
    API->>DB: INSERT SourceDocument + chunks
    API->>LLM: extract values, run preview prompt (≤4 paragraphs, no drug/dose)
    LLM-->>API: preview summary
    API->>DB: persist as ScribeAudit (tier='preview')
    API-->>V: { previewText, anonSessionToken }
    V->>U: see preview; click "Sign up free to keep going"
    V->>API: POST /api/auth/request-link (email)
    API->>E: send magic link (existing flow, unchanged)
    E-->>V: email
    V->>API: GET /api/auth/verify?token=...
    API->>DB: UPDATE provisional User (email + name + DOB)
    API->>DB: INSERT MarketingEmailSchedule (day-7, day-14)
    Note over V,API: --- end Phase 1 free flow ---
    V->>API: click "Get Membership $29/mo" (in dashboard or email)
    API->>S: POST /v1/checkout/sessions (subscription mode)
    S-->>V: hosted checkout
    V->>S: card details
    S->>API: POST /api/upload/webhooks/stripe (checkout.session.completed)
    API->>DB: INSERT Subscription (status='active'); UPDATE User membership
    API->>DB: SUPPRESS pending day-7/14 emails (already converted)
    V->>API: GET /(app)/trends (now gated open)
```

### Decision matrix: where does each surface live in the route map

| Surface | Path | Middleware | Indexable | Auth | Notes |
|---|---|---|---|---|---|
| Anchor pages | `/explainers/*` | excluded (like `/`) | yes | no | SEO/GEO traffic |
| Methodology page | `/methodology` | excluded | yes | no | Trust building |
| Legal pages | `/privacy`, `/safety`, `/contact` | excluded | yes | no | Currently dead |
| Upload UI | `/upload/results` | public-allowlist (noindex headers) | no | no | Demo-pattern chrome |
| Upload API | `/api/upload/*` | public-allowlist | no | no | Turnstile + rate limit |
| Stripe webhook | `/api/upload/webhooks/stripe` | public-allowlist | no | no (signed) | Outside cookie-gate |
| Stripe checkout init | `/api/billing/checkout` | session-gated | n/a | yes | Standard auth path |
| Membership product (trends dashboard) | `/(app)/trends` | session-gated | no | yes | Tier resolver |
| Cron runner | `/api/cron/marketing-emails` | public-allowlist | no | no (signed by Vercel) | Daily |

## Implementation Units

### Phase 1 — Free flow + measurement (Weeks 1–4)

- [ ] **Unit 1: Source-of-truth modules + ESLint rule**

**Goal:** Single typed modules for pricing, scribe-tier IDs, email-segment names, anchor slugs. Custom ESLint rule bans string literals of these in marketing surfaces.

**Requirements:** R11

**Dependencies:** None

**Files:**
- Create: `src/lib/marketing/pricing.ts`
- Create: `src/lib/marketing/tiers.ts`
- Create: `src/lib/marketing/segments.ts`
- Create: `src/lib/marketing/slugs.ts`
- Create: `eslint-rules/no-marketing-string-literals.js`
- Test: `src/lib/marketing/pricing.test.ts` (and one each for the others)
- Modify: `eslint.config.mjs` to load + apply the rule

**Approach:**
- Each module exports a frozen `as const` object: `{ MEMBERSHIP_PRICE: '$29/mo', DEEPER_REPORT: '$39', SUPPLY: '$69/mo', STUDIO_VISIT: '$299' }` etc.
- Each value also exports a `SUPPLY_NUMERIC: 69` integer for Stripe price lookup (drift-safe).
- Custom ESLint rule scans `app/explainers/**` and `app/upload/**` for string literals matching `/\$\d+(\.\d+)?\/?(mo|month|wk)?/i` — fails build if found.
- Rule allows the literal if it's the right-hand side of `import` from one of the SOT modules.

**Patterns to follow:**
- [src/lib/scribe/policy/forbidden-phrases.ts](../../src/lib/scribe/policy/forbidden-phrases.ts) — frozen `as const` arrays exported as enums
- existing ESLint config style if a custom rule exists; otherwise the rule is greenfield

**Test scenarios:**
- Happy path: `import { MEMBERSHIP_PRICE } from '@/lib/marketing/pricing'` works in `app/explainers/foo/page.tsx`
- Edge case: pricing-string literal in `app/(app)/...` does NOT trigger the rule (rule scoped to marketing surfaces)
- Error path: pricing-string literal in `app/explainers/foo/page.tsx` fails ESLint with message naming the SOT module
- Edge case: scribe-tier IDs and segment names are similarly enforced — rule fires for each
- Integration: `vitest run` over the marketing modules verifies the typed shapes match what consumers import

**Verification:**
- ESLint rule reports a clean `no-marketing-string-literals` violation count when run on a known-bad fixture
- All anchor-page units (U7-9) consume from these modules; build fails if any of them reverts to a literal

---

- [ ] **Unit 2: Public-route infrastructure (`/upload/*`, `/explainers/*`, middleware)**

**Goal:** Stand up the route folders, layouts, and middleware allowlist. After this unit, `GET /upload/results` returns 200 (placeholder UI), `GET /explainers/foo` returns 200 (placeholder UI), and security headers are correctly applied.

**Requirements:** R6, R8

**Dependencies:** None

**Files:**
- Create: `src/app/explainers/layout.tsx`
- Create: `src/app/explainers/is-your-protocol-working/page.tsx` (placeholder)
- Create: `src/app/explainers/quest-blood-test-results-explained/page.tsx` (placeholder)
- Create: `src/app/upload/layout.tsx`
- Create: `src/app/upload/results/page.tsx` (placeholder)
- Create: `src/app/methodology/page.tsx` (placeholder)
- Create: `src/app/privacy/page.tsx`, `src/app/safety/page.tsx`, `src/app/contact/page.tsx` (placeholders)
- Modify: `src/middleware.ts` (add `/upload/...` and `/api/upload/...` to public-allowlist; ensure `/explainers/*`, `/methodology`, `/privacy`, `/safety`, `/contact` are NOT in `config.matcher` so they ship un-headered like `/`)
- Test: `src/middleware.test.ts` (extend with the new public surfaces)

**Approach:**
- `/explainers/layout.tsx` mirrors `/demo/layout.tsx`'s tone-of-voice but **no `metadata.robots: noindex`** — these rank.
- `/upload/layout.tsx` does mirror `/demo/layout.tsx` with `noindex` on (this is post-arrival, doesn't need to rank).
- Middleware: extend the `if (...)` public-allowlist branch in `src/middleware.ts:30` to include `/upload/`, `/api/upload/`. Do NOT add `/explainers/*` to the matcher — let it be excluded entirely.
- Placeholder pages render a single `<h1>` plus the appropriate trust block. They're filled in U7-9.

**Patterns to follow:**
- [src/middleware.ts](../../src/middleware.ts) lines 26-48 — public-allowlist + security headers
- [src/app/demo/layout.tsx](../../src/app/demo/layout.tsx) — no-auth chrome (for `/upload/`)
- [src/app/page.tsx](../../src/app/page.tsx) — public-but-indexable (for `/explainers/`, `/methodology`, legal)

**Test scenarios:**
- Happy path: `GET /explainers/is-your-protocol-working` returns 200 with no `X-Robots-Tag: noindex` header
- Happy path: `GET /upload/results` returns 200 WITH `X-Robots-Tag: noindex`
- Happy path: `GET /api/upload/anything-not-yet-built` returns 404 (not 401), proving the path bypasses the cookie gate
- Edge case: `/upload` (no slash) does not match the allowlist → `/upload/results` does match
- Integration: existing `/(app)/...` routes still 401 when the cookie is missing

**Verification:**
- Anchor pages return 200 with no `noindex` header
- Upload pages return 200 with `noindex` header
- Existing `/demo`, `/share`, `/r` behavior is unchanged

---

- [ ] **Unit 3: `LandingPageVisit` model + visit beacon + 2 new funnel stages**

**Goal:** Persist anchor-page visits as first-class domain rows; extend `ACTIVATION_STAGES` with `anchor-page-visit` and `anchor-page-to-upload` resolvers derived from the new table.

**Requirements:** R7, R12

**Dependencies:** Unit 2

**Files:**
- Modify: `prisma/schema.prisma` (add `LandingPageVisit` model)
- Migrate: `prisma/migrations/<timestamp>_add_landing_page_visit/migration.sql`
- Create: `src/app/api/upload/visit/route.ts` (POST beacon endpoint)
- Create: `src/components/marketing/visit-beacon.tsx` (client component fired from anchor-page layout)
- Modify: `src/lib/metrics/activation-funnel.ts` (two new stages, derived from `LandingPageVisit`)
- Test: `src/app/api/upload/visit/route.test.ts`
- Test: `src/lib/metrics/activation-funnel.test.ts` (extend with anchor-page stage scenarios)

**Approach:**
- Prisma model: `id (cuid), anonymousId (string, indexed), anchorKey (string), createdAt (timestamp), ipHash (string), userAgent (string), referrer (string nullable), email (string nullable, indexed)`. `anchorKey` references the SOT slug module from U1.
- Beacon POST validates `anchorKey ∈ KNOWN_ANCHOR_SLUGS` (rejects unknown into a counted bucket — never silent drop).
- Beacon writes the visit row + sets a `mf_anon` cookie (httpOnly, sameSite=lax, 90-day) carrying `anonymousId` (random UUID v4).
- New funnel stages:
  - `anchor-page-visit` ← min `LandingPageVisit.createdAt` per anonymousId, joined to `User.id` via the post-signup `email` field
  - `anchor-page-to-upload` ← min `SourceDocument.createdAt` for the same anonymousId
- Both resolvers are R7-compliant single-source-of-truth (table-derived).

**Patterns to follow:**
- [src/lib/metrics/activation-funnel.ts](../../src/lib/metrics/activation-funnel.ts) — existing stage shape
- [prisma/schema.prisma](../../prisma/schema.prisma) — `MagicLinkToken`, `MagicLinkRateLimit` for the per-IP-keyed table shape

**Test scenarios:**
- Happy path: POST `/api/upload/visit` with `{ anchorKey: 'is-your-protocol-working' }` returns 204 + sets `mf_anon` cookie
- Edge case: unknown `anchorKey` returns 400 + increments a `unknownAnchorKey` counter (visible in Diagnostics)
- Edge case: missing/malformed body returns 400, not 500
- Edge case: same anonymousId visiting the same anchor twice writes two rows (visit count is a metric, not a unique)
- Integration: after visit + later upload + later signup, `anchor-page-visit` and `anchor-page-to-upload` both resolve correctly for the user
- Integration: cohort filter `--user-ids` correctly filters the new stages

**Verification:**
- `npx tsx scripts/metrics/activation-funnel.ts` shows two new stages in CSV + summary output
- `LandingPageVisit` rows accumulate as expected on dev DB

---

- [ ] **Unit 4: No-auth `/upload/results` endpoint with provisional User + security hardening**

**Goal:** Public PDF upload endpoint that creates a provisional User row (email=null), runs the existing extraction pipeline, persists results, returns an opaque session token for the visitor's browser. Rate-limited, Turnstile-gated, magic-byte-verified.

**Requirements:** R8, R10, R11, R15

**Dependencies:** Unit 1 (slugs module), Unit 2 (route infrastructure)

**Files:**
- Modify: `prisma/schema.prisma` (`User.email` already nullable; add `User.anonymousSessionToken (string nullable, unique)` if not present)
- Migrate: `prisma/migrations/<timestamp>_add_anonymous_session_token/migration.sql`
- Create: `src/lib/upload/provisional-user.ts` (create + cookie-set)
- Create: `src/lib/upload/rate-limit.ts` (per-IP, mirroring `MagicLinkRateLimit`)
- Create: `src/lib/upload/turnstile.ts` (Cloudflare token verification HTTP)
- Create: `src/lib/upload/magic-byte.ts` (`%PDF-` prefix verify, encrypted-PDF reject)
- Create: `src/app/api/upload/results/route.ts`
- Test: `src/app/api/upload/results/route.test.ts`
- Test: `src/lib/upload/turnstile.test.ts`
- Test: `src/lib/upload/magic-byte.test.ts`

**Approach:**
- Endpoint flow: verify Turnstile token → check per-IP rate limit → magic-byte verify → page-count cap (re-use the existing 40-page limit logic from `src/app/api/intake/documents/route.ts` line ~150 if present, else add) → encrypted-PDF reject → create-or-fetch provisional User by `mf_anon` cookie → call existing `extractPdfText` + `chunkLabReport` + Claude extraction + `ingestExtraction` + `storePdf` (all unchanged) → return `{ sessionToken, anonymousId }` for the client.
- All counters surface in the activation-funnel CLI's new `Diagnostics:` footer (R12): Turnstile denials, rate-limit denials, magic-byte rejects, encrypted-PDF rejects, page-count rejects, extraction failures.
- **Re-use the existing prompt-injection sanitizer** from the auth'd intake path — do not write a parallel one (R15).

**Execution note:** Test-first. Start with a failing integration test that POSTs a valid PDF + Turnstile token and asserts the full pipeline runs to a `ScribeAudit` row with `tier='preview'`. (The preview output itself comes from U5.)

**Patterns to follow:**
- [src/app/api/intake/documents/route.ts](../../src/app/api/intake/documents/route.ts) — the auth'd PDF-upload precedent (every step except the auth check)
- [src/lib/auth/email.ts](../../src/lib/auth/email.ts) — outbound HTTP pattern (`fetchWithRetry`, typed errors) for the Turnstile call
- [docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md](2026-04-15-004-feat-health-graph-pivot-plan.md) Unit 6 — upload-hardening checklist

**Test scenarios:**
- Happy path: valid PDF + valid Turnstile token + fresh IP → 200 + `ScribeAudit` row with `tier='preview'`, provisional User created, anonymous-session cookie set
- Happy path: same PDF re-uploaded by same anonymousId → idempotent on `(userId, contentHash)` (existing intake invariant)
- Edge case: encrypted PDF → 400 with explicit error code, counter incremented
- Edge case: 41-page PDF → 400, counter incremented
- Edge case: 26 MB PDF → body-stream cap rejects pre-buffer, 413 returned
- Edge case: PDF claiming `Content-Type: application/pdf` but not `%PDF-` magic → 400 + counter
- Edge case: PNG / JPG → 415 (photo not supported in v1, see Scope Boundaries)
- Error path: missing Turnstile token → 401 + counter
- Error path: invalid Turnstile token → 401 + counter
- Error path: same IP exceeding rate limit → 429 + counter
- Error path: Turnstile API unreachable → typed `TurnstileError` thrown, route returns 503 with retry-after
- Integration: full happy-path E2E creates provisional User, SourceDocument, chunks, GraphNodes via existing `ingestExtraction`
- Integration: prompt-injection corpus from `guardrail-fixtures.ts` (per learning #5) is sanitized before being sent to Claude

**Verification:**
- E2E test runs against real Postgres + mocked Turnstile + mocked Anthropic
- `Diagnostics:` footer in the funnel CLI shows non-zero counters when fixtures inject failures
- Manual: a pasted Quest PDF on the dev `/upload/results` produces a real `ScribeAudit` row

---

- [ ] **Unit 5: Form Intelligence preview tier**

**Goal:** New compile mode for "≤4 paragraph translation summary, no Rx/dose/imperative". Runs through the existing `LLMClient` (DPA pin, kill-switch, zero-retention) and the existing safety policy.

**Requirements:** R10, R14, R15

**Dependencies:** Unit 4 (provides the `ScribeAudit` row that gets stamped `tier='preview'`)

**Files:**
- Create: `src/lib/topics/types.ts` — extend with `PreviewSummarySchema` (Zod, paragraphs array max 4, citations array)
- Create: `src/lib/topics/prompts/preview-summary.ts`
- Create: `src/lib/topics/compile-preview.ts` (the new compile entry point)
- Modify: `src/lib/llm/linter.ts` — add `'preview'` to `LintSurface` union
- Modify: `src/lib/scribe/specialties/registry.ts` — wire the new compile path (or add a specialty entry if that's the existing fan-out shape)
- Test: `src/lib/topics/compile-preview.test.ts`
- Test: `src/lib/llm/linter.test.ts` (extend for `'preview'` surface)

**Approach:**
- Schema: `PreviewSummarySchema = z.object({ paragraphs: z.array(z.string().min(1).max(800)).min(1).max(4), citations: z.array(CitationSchema).min(0).max(8), classification: SafetyClassificationSchema })`
- Prompt module reuses the safety-policy registry's `general` policy (`forbiddenPhrasePatterns` + `allowedJudgmentKinds`) — does not declare its own list (R15).
- Linter surface `'preview'` runs the same forbidden-phrase + diagnostic-claim checks the runtime scribe uses.
- The compile entry point is called from U4's endpoint after extraction completes; output is stored on the same `ScribeAudit` row with `tier='preview'`.
- Output classified `'clinical-safe' | 'out-of-scope-routed' | 'rejected'` per the existing scribe contract; out-of-scope falls back to a fixed safe message ("we can't summarise this here — sign up free for the full read"), counted in Diagnostics.

**Execution note:** Test-first. New compile mode + new schema should ship with happy-path + forbidden-phrase + over-length tests before integration with U4.

**Patterns to follow:**
- [src/lib/topics/compile.ts](../../src/lib/topics/compile.ts) — existing compile entry shape
- [src/lib/topics/prompts/iron.ts](../../src/lib/topics/prompts/iron.ts) — prompt-module shape
- [src/lib/scribe/policy/enforce.ts](../../src/lib/scribe/policy/enforce.ts) — runtime safety filter
- [src/lib/llm/linter.ts](../../src/lib/llm/linter.ts) — LintSurface enum

**Test scenarios:**
- Happy path: compile against a synthetic Quest panel returns ≤4 paragraphs, classification `'clinical-safe'`, ≥1 citation
- Edge case: prompt instructed to exceed 4 paragraphs — schema rejects, retry once with reminder, still rejects → returns out-of-scope fallback (counted)
- Edge case: prompt produces drug-name (e.g. "atorvastatin") — `forbidden-phrases.ts` flags, output reclassified `'rejected'`, fallback returned (counted)
- Edge case: prompt produces dose string (e.g. "5,000 IU") — flagged, fallback (counted). Note negative-lookahead for legitimate lab-value units (`mg/dL`, `µg/L`) so legitimate measurements pass.
- Edge case: prompt produces imperative ("you should take X") — flagged, fallback (counted)
- Edge case: prompt produces zero citations on a non-fallback path — schema rejects (`min(0)` after retry; this is a soft min — reviewer to decide)
- Error path: `LLMClient` returns kill-switch → fallback message, no failure escalation
- Error path: Anthropic 503 → `LLMClient` retries (existing behaviour); after exhausted, route returns 503
- Integration: the U4 endpoint calls compile-preview successfully and the `ScribeAudit` row has `tier='preview'` stamp
- Integration: forbidden-phrase corpus (the existing `guardrail-fixtures.ts`) — every fixture either passes (legitimate) or returns the fallback (forbidden)

**Verification:**
- `vitest run src/lib/topics/compile-preview.test.ts` passes
- Linter now recognises `LintSurface = 'preview'` and applies the same checks the runtime scribe uses
- E2E from U4: real Quest PDF → preview output stored on `ScribeAudit`

---

- [ ] **Unit 6: Email-only signup → provisional-User upgrade**

**Goal:** After visitor sees their preview, capture email; reuse Magic Link verification; on verify, upgrade the provisional User in place (set email + name + DOB). No card upfront.

**Requirements:** R3 (signup gate), R8

**Dependencies:** Unit 4 (provisional User + cookie)

**Files:**
- Modify: `src/app/api/auth/request-link/route.ts` — accept optional `anonymousId` to associate with the User row that's verified
- Modify: `src/app/api/auth/verify/route.ts` — if `anonymousId` matches a provisional User, upgrade in place (set email, name, DOB); if not, create new User as before
- Modify: `src/lib/auth/magic-link.ts` — extend the link-token payload to carry `anonymousId`
- Modify: `src/components/upload/upload-form.tsx` — render the email-capture form post-preview
- Test: `src/app/api/auth/verify/route.test.ts` — extend for the upgrade path

**Approach:**
- Visitor sees preview → email-capture form (just email + first name + DOB).
- POST `/api/auth/request-link` with `{ email, name, dob, anonymousId }` — creates a Magic Link token whose payload includes the `anonymousId`.
- Email goes via the existing Resend pattern, unchanged.
- On verify: if `anonymousId` matches a provisional User row (`User.anonymousSessionToken === anonymousId AND User.email IS NULL`), upgrade in place (set email + name + DOB; clear `anonymousSessionToken`). Otherwise, fall through to the existing User-creation path.
- Bind the `mf_anon` cookie to the new authed `mf_session` cookie at verify time (so subsequent calls correctly use authed session).
- Schedule day-7 + day-14 marketing emails immediately after upgrade (in U12's queue table; see U12 for write-side).

**Execution note:** Care needed — this touches the auth-verify path. Add an integration test that asserts (a) provisional User upgrade succeeds, (b) email-mismatch with existing User creates a new User (no merge), (c) anonymousId attempting to upgrade an already-upgraded provisional User is a no-op.

**Patterns to follow:**
- [src/lib/auth/magic-link.ts](../../src/lib/auth/magic-link.ts) — token format
- [src/app/api/auth/verify/route.ts](../../src/app/api/auth/verify/route.ts) — verify path

**Test scenarios:**
- Happy path: provisional User (email=null, anonymousSessionToken='abc') → request link with `anonymousId='abc'` + email → verify → User row now has email + name + DOB + `anonymousSessionToken=null`
- Edge case: provisional User already upgraded by previous flow → request link with same anonymousId → fall through to standard User-creation path; provisional row left untouched
- Edge case: anonymousId doesn't match any provisional User → standard new-User path (preserves existing behavior)
- Error path: email belongs to different existing User than the provisional one → no merge; the verify flow takes the existing-User path; a Diagnostics counter `provisional-user-email-collision` increments
- Edge case: provisional User's previous SourceDocument now belongs to the upgraded User (foreign keys preserved through in-place upgrade)
- Integration: post-verify, the `mf_session` cookie is set and the user can navigate to `/(app)/trends` (gated) — empty state initially since membership not yet active
- Integration: post-verify, `MarketingEmailSchedule` rows for day-7 + day-14 are scheduled

**Verification:**
- E2E test: full visitor → upload → preview → email signup → verify → authed dashboard
- `User` row identity preserved across the upgrade (FK-safe)

---

- [ ] **Unit 7: Legal + methodology pages**

**Goal:** Real `/privacy`, `/safety`, `/contact`, `/methodology` pages — close the dead links from the homepage footer. Use the existing `<Disclaimer />` component.

**Requirements:** R5, R10

**Dependencies:** Unit 2 (route infrastructure)

**Files:**
- Modify: `src/app/privacy/page.tsx` (placeholder from U2 → real content)
- Modify: `src/app/safety/page.tsx`
- Modify: `src/app/contact/page.tsx`
- Modify: `src/app/methodology/page.tsx`
- Modify: `src/lib/compliance/static-copy.test.ts` — extend the allowlist if regulatory copy lives directly in any page (otherwise pages render `<Disclaimer />` + `<SubProcessorList />` and don't trigger the test)

**Approach:**
- `/privacy`: privacy policy (carry from `/(app)/settings/privacy/page.tsx`), DPIA-aligned, sub-processor disclosure via `<SubProcessorList />`.
- `/safety`: regulatory posture summary — what MorningForm is, what it isn't. Renders `<Disclaimer variant="default" />`. **Do not duplicate the disclaimer copy** (compliance-static-copy test will fail).
- `/contact`: `hello@morningform.co` (per the deck) + a contact form (deferred — link is enough for v1).
- `/methodology`: how Form Intelligence reads bloodwork + wearable data; the trust-building "show your work" page that's heavily cited from anchor pages and is the AI-engine-quotable surface for *"what does MorningForm do"*.
- All four pages excluded from middleware matcher (per U2) so they ship indexable.

**Execution note:** Editorial work. Each page's copy goes through the editorial-QA gate (U8).

**Patterns to follow:**
- [src/app/(app)/settings/privacy/page.tsx](../../src/app/(app)/settings/privacy/page.tsx) — privacy copy already exists for the auth'd surface; carry to public
- [src/components/ui/disclaimer.tsx](../../src/components/ui/disclaimer.tsx) — the standard variants
- [docs/compliance/sub-processor-register.md](../compliance/sub-processor-register.md) — driving data for `<SubProcessorList />`

**Test scenarios:**
- Happy path: each page returns 200, contains the expected `<h1>`, renders `<Disclaimer />`
- Edge case: compliance-static-copy test passes (no regulatory copy outside the allowlisted files)
- Integration: footer links from `src/app/page.tsx` (Privacy, Safety, Contact) now resolve to real pages

**Verification:**
- Homepage footer links no longer 404
- `/methodology` is cited from anchor pages in U8/U9

---

- [ ] **Unit 8: Anchor #1 page + editorial-QA Vitest gate**

**Goal:** Ship Anchor #1 (*"Is your protocol actually working?"*) as a real RSC page. Editorial-QA Vitest gate calling `forbidden-phrases.ts` against rendered TSX runs in CI.

**Requirements:** R1, R2, R5, R6, R10

**Dependencies:** Units 1, 2, 4, 5, 6, 7

**Files:**
- Modify: `src/app/explainers/is-your-protocol-working/page.tsx` (placeholder → full content)
- Create: `src/app/explainers/_template/trust-block.tsx` (renders `<Disclaimer variant="topic" />` + the standardized "What MorningForm is and isn't" framing)
- Create: `src/app/explainers/_template/upload-cta.tsx`
- Create: `src/app/explainers/_template/faq-block.tsx`
- Create: `src/components/marketing/visit-beacon.tsx` — wired in `/explainers/layout.tsx` (existing per U3)
- Create: `src/lib/marketing/editorial-qa.ts` — the Vitest-callable gate that runs `forbidden-phrases.ts` against rendered TSX
- Test: `src/app/explainers/is-your-protocol-working/page.test.ts` — uses `editorial-qa.ts`
- Test: `src/lib/marketing/editorial-qa.test.ts`

**Approach:**
- Page renders the full content from the brainstorm (Output 3 Anchor #1) — hero, validation gap, "what MorningForm reads", three synthetic worked examples, upload CTA, Membership offering, trust block, FAQ, sources.
- Schema.org markup: `MedicalWebPage` + `FAQPage`. Page-rendered as an RSC; metadata via Next.js `metadata` export.
- Trust block reuses the existing `<Disclaimer />` component (compliance-static-copy gate).
- Upload CTA links to `/upload/results` with the anchor slug as a referrer query param.
- **Editorial-QA gate**: a Vitest test renders the page TSX to HTML, then runs the rendered text through `forbidden-phrases.ts`. Any forbidden phrase fails the test. The same module the runtime scribe uses (R15).
- Gate also fires on a corpus of "almost-prescriptive" sentences as a sanity check — rejects any wording the editorial team should rewrite.

**Execution note:** Test-first for the editorial-QA gate. Then write the page; the gate is the merge gate.

**Patterns to follow:**
- [src/app/page.tsx](../../src/app/page.tsx) — homepage RSC pattern
- [src/components/ui/disclaimer.tsx](../../src/components/ui/disclaimer.tsx) — disclaimer reuse
- [src/lib/scribe/policy/forbidden-phrases.ts](../../src/lib/scribe/policy/forbidden-phrases.ts) — the source of truth the gate calls
- Brainstorm Output 3 — full content spec for the page

**Test scenarios:**
- Happy path: page renders 200 with all expected sections
- Happy path: editorial-QA gate passes — no forbidden phrases in rendered TSX
- Edge case: a sentence "you should take 5,000 IU vitamin D" inserted into the page's FAQ → editorial-QA gate fails with a clear error pointing to the offending text
- Edge case: legitimate measurement units in lab-value context ("ferritin at 22 ng/mL") pass — negative-lookahead for unit context (per existing `forbidden-phrases.ts`)
- Edge case: page references SOT pricing module (no `$29/mo` literal) — ESLint rule from U1 passes
- Edge case: schema.org markup validates against schema.org structure
- Integration: page → upload CTA click → `/upload/results` lands with referrer query, `LandingPageVisit` row written via beacon

**Verification:**
- Page live at `/explainers/is-your-protocol-working`, indexed by `next build` output
- `vitest run src/app/explainers/...` passes editorial-QA gate
- AI engine (manual ChatGPT/Perplexity check) returns the page as a citation for the target query within 8-12 weeks

---

- [ ] **Unit 9: Anchor #2 page (Quest results explainer)**

**Goal:** Ship Anchor #2 — Quest blood test results explainer for men 30-50 — using the same template as Anchor #1. Three-tier CTA: free upload / $39 deeper report / $29/mo Membership.

**Requirements:** R6, R9, R10

**Dependencies:** Unit 8 (template)

**Files:**
- Modify: `src/app/explainers/quest-blood-test-results-explained/page.tsx` (placeholder → full content)
- Test: `src/app/explainers/quest-blood-test-results-explained/page.test.ts` — same editorial-QA gate

**Approach:**
- Mirror Anchor #1's structure; the brainstorm (Output 3 Anchor #2 sketch) is the spec.
- Three-tier CTAs:
  - Primary: *"Upload your panel — see what your numbers mean in context, free"*
  - Secondary: *"Want a deeper report? $39 one-time"* — links to a `?tier=deeper-report` flag on `/upload/results` (the deeper report is part of U10/U11 — for now, link captures intent and email-list segments the user)
  - Tertiary: *"Or get ongoing tracking — Form Intelligence Membership $29/mo"*
- Same trust block, same editorial-QA gate, same FAQ structure.

**Patterns to follow:** Unit 8

**Test scenarios:**
- Happy path: page renders 200, all sections, schema.org markup valid
- Happy path: editorial-QA gate passes
- Edge case: SOT pricing module is sourced for both `$39` and `$29/mo` references — no literals
- Integration: same upload→preview→signup E2E from this anchor as from Anchor #1

**Verification:**
- Page live at `/explainers/quest-blood-test-results-explained`
- Editorial-QA gate passes
- The template ports cleanly — implementation took ≤2 days editorial work (R9)

---

- [ ] **Unit 10: Activation-funnel script extension + Diagnostics: footer**

**Goal:** Surface every fallback counter from Phase 1 in the activation-funnel CLI's `Diagnostics:` footer. Closes the silent-fallback follow-up filed against the original funnel plan.

**Requirements:** R7, R12

**Dependencies:** Units 3, 4, 5

**Files:**
- Modify: `src/lib/metrics/activation-funnel.ts` — extend `StageDefinition.resolve` return type to optionally include `diagnostics: DiagnosticEntry[]`
- Modify: `src/lib/metrics/activation-funnel-report.ts` — aggregate diagnostics across stages
- Modify: `src/lib/metrics/activation-funnel-format.ts` — render `Diagnostics:` footer in CSV + summary
- Modify: `scripts/metrics/activation-funnel.ts` — pass-through (no behavior change at the CLI level)
- Test: `src/lib/metrics/activation-funnel.test.ts` — extend with diagnostic-counter scenarios
- Test: `src/lib/metrics/activation-funnel-format.test.ts`

**Approach:**
- Counters tracked: editorial-QA rejections, PDF-extraction failures, sanitiser hits, Turnstile denials, magic-byte rejects, encrypted-PDF rejects, page-count rejects, rate-limit denials, unknown-anchor-key beacon rejects, scribe-fallback (out-of-scope) outputs.
- Each counter is a row in a new `Diagnostics` table (`{ key, count, periodStart, periodEnd, lastSeenAt }`) — derive-don't-emit principle: the table is incremented synchronously by the routes that detect the failure.
- Funnel resolvers query the table for the report period and surface in CSV + summary as `Diagnostics: editorial-qa-rejections=0, turnstile-denials=2, ...`. Empty bucket prints `Diagnostics: none`.

**Patterns to follow:**
- Existing R7 single-source-of-truth principle from [activation-funnel plan](2026-04-21-002-feat-activation-funnel-instrumentation-plan.md)

**Test scenarios:**
- Happy path: zero failures → `Diagnostics: none`
- Happy path: 2 Turnstile denials + 1 magic-byte reject in the period → footer shows them
- Edge case: counter for a key never incremented during the period → shown as 0 (always present, never silently absent — that's the whole point)
- Edge case: counters from outside the cohort window are not included
- Integration: a forced-failure E2E (mock Turnstile to deny) shows up in the next CLI run

**Verification:**
- `npx tsx scripts/metrics/activation-funnel.ts` shows `Diagnostics:` footer
- All 10 counters are visible, even at zero

### Phase 2 — Monetization + retention (Weeks 5–8)

- [ ] **Unit 11: Stripe Membership ($29/mo) — checkout, webhook, subscription state**

**Goal:** Membership Stripe subscription. Checkout-init endpoint, webhook handler, typed subscription-state resolver. Anti-Dexcom: state is explicit, fail-loud, no defaults.

**Requirements:** R3, R12, R13

**Dependencies:** Unit 6 (authed user can initiate checkout)

**Files:**
- Add dep: `stripe` (npm)
- Modify: `prisma/schema.prisma` — `Subscription` model (`id, userId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd, createdAt, updatedAt`)
- Migrate
- Create: `src/lib/billing/stripe.ts` — typed Stripe HTTP client mirroring `src/lib/auth/email.ts`
- Create: `src/lib/billing/membership-state.ts` — `getMembershipState(userId): MembershipState` returning `'free' | 'membership-active' | 'membership-grace' | 'membership-cancelled'`. Throws `MembershipStateError` if Stripe is unreachable.
- Create: `src/app/api/billing/checkout/route.ts` — authed POST, creates checkout session, returns hosted URL
- Create: `src/app/api/upload/webhooks/stripe/route.ts` — public allowlist, signed; processes `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Create: `src/components/billing/checkout-button.tsx`
- Test: `src/app/api/billing/checkout/route.test.ts`
- Test: `src/app/api/upload/webhooks/stripe/route.test.ts` — fixture-based, mocks Stripe events
- Test: `src/lib/billing/membership-state.test.ts`

**Approach:**
- Stripe webhook is the source of truth for subscription state. Checkout-completed event sets `Subscription.status='active'`. `customer.subscription.deleted` sets `status='cancelled'`. `payment_failed` sets `status='grace'` (still active, but flagged).
- Webhook signature verification using Stripe's `stripe-signature` header, env-var `STRIPE_WEBHOOK_SECRET`.
- `getMembershipState` is the single authoritative resolver. Tier-gated routes (`/(app)/trends`) call it; on error throw, never return a default. Anti-Dexcom (D4).
- Webhook events that don't map to a known user/subscription are counted in Diagnostics (`stripe-webhook-unmatched`).
- Suppress pending day-7/14 marketing emails on `subscription-active` (U12 reads this state).

**Execution note:** Test-first for `membership-state.ts` — every state transition has a test that asserts the resolver returns the right typed result before the route is wired.

**Patterns to follow:**
- [src/lib/auth/email.ts](../../src/lib/auth/email.ts) — outbound HTTP, typed errors, fetchWithRetry
- [src/middleware.ts](../../src/middleware.ts) — webhook outside cookie-gate (matches `/api/health/callback/:path*` pattern)
- [docs/plans/2026-04-15-003-fix-dexcom-real-path-hardening-plan.md](2026-04-15-003-fix-dexcom-real-path-hardening-plan.md) — explicit-state, fail-loud anti-pattern

**Test scenarios:**
- Happy path: authed user POSTs `/api/billing/checkout` → Stripe checkout session created, hosted URL returned
- Happy path: Stripe webhook `checkout.session.completed` → `Subscription` row inserted, `status='active'`, `currentPeriodEnd` set
- Happy path: `getMembershipState(userId)` returns `'membership-active'` after checkout completes
- Edge case: webhook with valid signature but unknown `customerId` → counted, 200 returned (not retried by Stripe)
- Edge case: webhook with invalid signature → 401, not processed
- Edge case: subscription canceled mid-period → `getMembershipState` returns `'membership-grace'` until `currentPeriodEnd`, then `'membership-cancelled'`
- Edge case: payment failed → `status='grace'`, `getMembershipState` returns `'membership-grace'`
- Error path: Stripe API unreachable from `getMembershipState` → throws `MembershipStateError`; route handlers translate to 503
- Error path: race condition where webhook arrives before checkout returns → idempotent on `stripeSubscriptionId`
- Integration: full E2E — authed user initiates checkout, completes payment in Stripe test mode, webhook fires, `Subscription` row written, dashboard route gates open

**Verification:**
- Stripe test-mode E2E: signup → checkout → webhook → `getMembershipState` returns `'membership-active'`
- `/(app)/trends` route renders for membership-active users; redirects (or shows free-tier UI) for free users
- Webhook events visible in Stripe dashboard + matching `Subscription` rows in DB

---

- [ ] **Unit 12: Day-7/14 lifecycle email sequence**

**Goal:** Daily Vercel Cron pulls due `MarketingEmailSchedule` rows, sends via Resend (factor of `auth/email.ts`), respects suppression (already-paid users, unsubscribers).

**Requirements:** R3, R12

**Dependencies:** Units 6 (signup writes schedule rows), 11 (membership-state resolver for suppression check)

**Files:**
- Modify: `prisma/schema.prisma` — `MarketingEmailSchedule (id, userId, segmentKey, scheduledFor, sentAt, suppressedReason, createdAt)` and `EmailSuppression (id, email, reason, createdAt)`
- Migrate
- Modify: `src/lib/auth/email.ts` — factor out generic `sendResendEmail({ to, subject, html, text })`
- Create: `src/lib/marketing/email.ts` — `sendMarketingEmail()` that wraps `sendResendEmail` with marketing-tracking headers + List-Unsubscribe
- Create: `src/lib/marketing/sequences.ts` — `scheduleDay7And14(userId)` writes the rows; `runDueSequence()` is the cron handler
- Create: `src/app/api/cron/marketing-emails/route.ts` — Vercel Cron endpoint, signed-by-Vercel
- Create: `src/app/api/marketing/unsubscribe/route.ts` — unsubscribe link target
- Modify: `vercel.json` (create if missing) — Vercel Cron declaration: daily at 14:00 UTC for the EU/US split
- Test: `src/lib/marketing/sequences.test.ts`
- Test: `src/app/api/cron/marketing-emails/route.test.ts`
- Test: `src/app/api/marketing/unsubscribe/route.test.ts`

**Approach:**
- Day-7 email: *"You uploaded your bloodwork last week. The next test is when it gets interesting — track your protocol over time with Membership $29/mo."* Subject line + body drafted in U12, gated by editorial-QA.
- Day-14 email: *"It's been two weeks. Re-upload to see what's moved — Membership tracks every panel together."*
- Cron handler runs daily, pulls rows where `scheduledFor <= now AND sentAt IS NULL`, for each row:
  - Resolve `getMembershipState(userId)`. If `'membership-active'` or `'membership-grace'`, mark `suppressedReason='already-paid'`, skip.
  - Check `EmailSuppression` by email. If suppressed, mark `suppressedReason='unsubscribed'`, skip.
  - Otherwise, call `sendMarketingEmail`, write `sentAt`.
- `unsubscribe` route inserts `EmailSuppression` row, GDPR-honoured.
- Both emails: List-Unsubscribe header (RFC 8058), gov-compliant.
- All send failures, suppressions, send-counts surface in Diagnostics footer (U10).

**Patterns to follow:**
- [src/lib/auth/email.ts](../../src/lib/auth/email.ts) — Resend HTTP shape; factor out the inner function
- [vercel.json — Vercel Cron docs](https://vercel.com/docs/cron-jobs)

**Test scenarios:**
- Happy path: provisional-User upgraded → 2 schedule rows written (day-7, day-14)
- Happy path: cron runs on day 7 → email sent; `sentAt` set; Diagnostics counter `marketing-emails-sent=1`
- Happy path: cron runs on day 7 but user is `membership-active` → email NOT sent; `suppressedReason='already-paid'`; Diagnostics counter `marketing-suppressed-already-paid=1`
- Happy path: cron runs on day 7 but user has unsubscribed → not sent; `suppressedReason='unsubscribed'`
- Edge case: cron runs twice on the same day → idempotent (existing `sentAt` is the gate)
- Edge case: Resend API 429 → retry next cron run; counter `marketing-send-deferred=1`
- Error path: Resend API permanent failure (4xx other than 429) → write `suppressedReason='resend-error'`, counter `marketing-send-failed=1`, don't retry
- Edge case: unsubscribe link click → `EmailSuppression` row inserted; subsequent emails to that address suppressed
- Integration: full E2E — provisional user upgrades, day-7 row written, simulated cron run sends email, day-14 row remains pending

**Verification:**
- Stripe test-mode flow: signup → wait 7 days (or simulate clock) → email arrives in Resend dashboard
- Vercel Cron declaration in `vercel.json` is honored on deploy
- Suppression honored across re-uploads + new schedule rows

---

- [ ] **Unit 13: Trend dashboard (Membership product surface)**

**Goal:** The `/(app)/trends` route — the actual product Membership pays for. Single biomarker over time on Day 1; multi-marker + wearable overlay deferred. Gated on subscription state via `getMembershipState`.

**Requirements:** R3 (Membership delivers ongoing value), R7

**Dependencies:** Unit 11 (membership-state)

**Files:**
- Create: `src/app/(app)/trends/page.tsx`
- Create: `src/components/trends/trend-chart.tsx` — biomarker over time
- Create: `src/components/trends/marker-picker.tsx`
- Create: `src/lib/trends/queries.ts` — Prisma queries for biomarker history
- Test: `src/app/(app)/trends/page.test.ts`
- Test: `src/lib/trends/queries.test.ts`

**Approach:**
- Page calls `getMembershipState(userId)`. If `'membership-active'` or `'membership-grace'`, render dashboard. If `'free'`, render upgrade-CTA stub.
- Dashboard v1: marker picker (top 8 markers from user's history), `<TrendChart>` rendering values over time, simple line chart (reuse existing `Sparkline` if shape fits or new SVG primitive).
- Each chart annotates the inflection-point dotted line for the user's first upload date.
- Fail-loud: if `getMembershipState` throws, show error state. Never default to "show as if free" or "show as if paid".

**Patterns to follow:**
- [src/components/demo/sparkline.tsx](../../src/components/demo/sparkline.tsx) — SVG primitive
- [src/app/demo/page.tsx](../../src/app/demo/page.tsx) — demo overview that already does biomarker-over-time visualisation

**Test scenarios:**
- Happy path: membership-active user with 3 SourceDocuments over 3 months → trend chart renders with 3 datapoints per selected marker
- Edge case: free user → upgrade-CTA renders, no biomarker data leaked
- Edge case: membership-grace user → dashboard renders (grace = still entitled)
- Edge case: user with one upload → chart renders with single datapoint + "next test is when it gets interesting" prompt
- Edge case: user with zero uploads → empty state encouraging upload
- Error path: `getMembershipState` throws → error state, NOT a default
- Integration: subscription state changes (cancelled mid-period) → grace until `currentPeriodEnd`, then locked

**Verification:**
- E2E: signup → checkout → trends page renders biomarker history
- Free user can't see paid content
- Grace user can see paid content

## System-Wide Impact

- **Interaction graph:** New public allowlist branches in `src/middleware.ts` (`/upload/...`, `/api/upload/...`). New webhooks bypassing cookie gate (`/api/upload/webhooks/stripe`, `/api/cron/marketing-emails`). All inherit Path A noindex headers except where explicitly excluded for the indexable `/explainers/*` and legal pages.
- **Error propagation:** Per R12, every fallback path emits a counter that surfaces in the Diagnostics footer. No silent drops anywhere. `MembershipStateError` (anti-Dexcom) propagates as 503 with retry-after, never as a default value.
- **State lifecycle risks:**
  - Provisional User row left orphaned if user uploads but never signs up — acceptable (TTL-expire after 90 days via cron), but counted.
  - Stripe webhook arriving before checkout returns — handled idempotently on `stripeSubscriptionId`.
  - Email schedule rows for users who deleted their account — cleaned up by FK cascade.
  - `LandingPageVisit` rows for IPs that never sign up — retained for analytics (no PII per IP-hashing).
  - Day-7/14 emails to `'membership-active'` users — suppressed at send time, not at schedule time (so a user who pays then cancels still gets the day-14 if scheduled).
- **API surface parity:** Membership-state resolver consumed by every gated route. If a new gated route added in the future doesn't call `getMembershipState`, it silently allows free users → caught by R13 typed-result discipline + ESLint rule scoped to `(app)/**` route handlers.
- **Integration coverage:** Cross-layer scenarios that unit tests alone won't prove:
  - Visitor → upload → preview → email signup → verify → dashboard works without the visitor ever being authed during upload
  - Stripe webhook → membership state → tier resolver → dashboard render is consistent (no race between webhook and dashboard call)
  - Editorial-QA Vitest gate fires on the rendered TSX (catching forbidden phrases that only appear post-render)
  - Day-7 cron runs after partial day-7-already-sent state — idempotent
- **Unchanged invariants:** Existing auth flow (Magic Link), existing `/api/intake/*` routes, existing scribe surfaces (`/api/scribe/explain`), existing topic-page compile path, existing `/share/[token]` flow. None of these change.

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A page or translation output crosses into prescriptive language → FTC complaint | medium | **HIGH** | Editorial-QA Vitest gate (U8) calling `forbidden-phrases.ts`. Same module as runtime safety filter. CI gate on every PR. |
| Stripe webhook + checkout race produces wrong subscription state | low | **HIGH** | Idempotent on `stripeSubscriptionId`. Anti-Dexcom typed-result discipline. Diagnostics counter for `stripe-webhook-unmatched` flags drift. |
| Anonymous-session abuse: visitor uploads garbage to inflate Diagnostics counters | medium | low | Per-IP rate limit (D9). Turnstile token (D9). Counted in Diagnostics so abuse is visible. |
| Anchor #1 ranks but doesn't convert to email signup | medium | medium | $500 paid-traffic test in Week 4 catches this before SEO compounds. R2 target ≥5%. |
| Anchor #1 doesn't rank | medium | medium | Validation-intent queries are lower-competition than diagnostic. Manual GEO check on AI engines weekly. R1 12-week window. |
| Membership churn — users sign up for one read and don't pay $29/mo | medium | medium | Day-7/14 sequence designed to convey "the loop is the value." Trend dashboard is the recurring product surface. |
| Editorial copy drifts from typed pricing/segment modules | low | medium | ESLint rule (U1) bans literals. CI catches. |
| Vercel Cron downtime → emails skipped | low | medium | Cron is idempotent (gated on `sentAt`); a missed run catches up the next day. Diagnostics counter `marketing-cron-skipped`. |
| Provisional User pollution — uploads from bots create User rows | medium | low | Turnstile gates the upload. TTL-expire provisional Users older than 90 days with no signup (cron job — defer to follow-up). |
| `forbidden-phrases.ts` false positives flag legitimate content | low | low | Existing module already used by runtime; well-tuned. Negative-lookahead for unit context (`mg/dL`, `µg/L`) prevents lab-value false positives. |
| Path A regulatory posture insufficient on first complaint | low | **HIGH** | Pre-named upgrade path: Path B (clinician on light retainer ~$5-10K/quarter). Triggered by complaint or volume threshold. Separate workstream. |

## Phased Delivery

### Phase 1 (Weeks 1–4): Free flow + measurement

Lands U1 → U10. End state:
- Anchor pages live and indexable
- Public no-auth upload works with full security hardening
- Form Intelligence preview tier renders post-upload
- Email signup upgrades provisional User in place
- Activation funnel script + Diagnostics footer shows all counters
- Editorial-QA gate live in CI

**Phase 1 success gate:** ≥50 email signups via the digital channel by end of Week 8 (Month 2). If yes → proceed to Phase 2. If no → diagnose (page rank? page conversion? upload friction?) and iterate before building Stripe + dashboard.

### Phase 2 (Weeks 5–8): Monetization + retention

Lands U11 → U13 (parallelizable; U13 doesn't depend on U12). End state:
- Stripe Membership ($29/mo) works end-to-end
- Day-7/14 lifecycle emails fire and respect suppression
- Trend dashboard delivers the Membership product surface
- Full visitor → Membership-paid loop closed

**Phase 2 success gate:** ≥20% upload-to-Membership conversion (R3) within 14 days of upload. ≥50 paying customers via channel 3 by end of Month 2 (the brainstorm validation milestone, R4). If yes → digital channel earns programmatic scale-up. If no → re-evaluate channel mix (channel 1 + 2 carry the deck milestone, channel 3 is a slower compounding play).

## Documentation / Operational Notes

- **README:** Add a `## Acquisition channel 3` section with: anchor-page paths, the public upload route, the editorial-QA gate, and the Diagnostics footer command (`npx tsx scripts/metrics/activation-funnel.ts`).
- **Onboarding doc:** New section "Marketing surfaces" explaining the SOT modules, the editorial-QA gate, the no-literals ESLint rule.
- **Compliance:** Sub-processor register adds Stripe (US-EU SCCs) + Cloudflare (Turnstile, US-EU SCCs). DPIA refresh for the no-auth upload path (anonymous-session-token cookie is a pseudo-identifier).
- **Stripe live-mode rollout:** Phase 2 ships in Stripe test mode first; flip to live mode after a manual end-to-end pass with a real card. Webhook secret rotated in env at flip-time.
- **Vercel Cron:** Single declaration in `vercel.json`; daily at 14:00 UTC. Note: Vercel Hobby plan caps cron jobs — confirm Pro tier on the prod project.
- **Monitoring:** No new monitoring infrastructure (deck-aligned: tech-first, not enterprise-grade-yet). The Diagnostics footer is the diagnostic. A future workstream wires it to a dashboard if volume warrants.
- **Rollout order:** U1-U7 are infrastructure with no user-visible behavior change; ship continuously to main as PRs land. U8 (Anchor #1) is the first user-visible surface — flip the page on `main` only after editorial-QA gate passes + a manual review of the rendered HTML. U11 (Stripe) ships in test mode first.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md](../brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md)
- **Pre-seed deck (US):** Primary source for pricing, audience, milestones (referenced in origin)
- **Sister plans:**
  - [docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md](2026-04-21-002-feat-activation-funnel-instrumentation-plan.md) — funnel + Diagnostics-footer follow-up filed there is implemented in U10
  - [docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md](2026-04-15-004-feat-health-graph-pivot-plan.md) — Unit 6 upload-hardening checklist re-used
  - [docs/plans/2026-04-15-003-fix-dexcom-real-path-hardening-plan.md](2026-04-15-003-fix-dexcom-real-path-hardening-plan.md) — anti-Dexcom subscription-state pattern
- **Regulatory framing:** [docs/brainstorms/2026-04-21-regulatory-posture-requirements.md](../brainstorms/2026-04-21-regulatory-posture-requirements.md) (G1–G7 → `forbidden-phrases.ts`)
- **Ideation:** [docs/ideation/2026-05-06-open-ideation.md](../ideation/2026-05-06-open-ideation.md) — silent-fallback + source-of-truth-drift named here
- **Code references:**
  - [src/middleware.ts](../../src/middleware.ts), [src/app/demo/](../../src/app/demo/), [src/app/api/intake/documents/route.ts](../../src/app/api/intake/documents/route.ts)
  - [src/lib/scribe/policy/](../../src/lib/scribe/policy/), [src/lib/llm/linter.ts](../../src/lib/llm/linter.ts), [src/lib/topics/](../../src/lib/topics/)
  - [src/lib/auth/email.ts](../../src/lib/auth/email.ts), [src/lib/auth/magic-link.ts](../../src/lib/auth/magic-link.ts)
  - [src/lib/metrics/activation-funnel.ts](../../src/lib/metrics/activation-funnel.ts)
  - [src/components/ui/disclaimer.tsx](../../src/components/ui/disclaimer.tsx), [src/lib/compliance/static-copy.test.ts](../../src/lib/compliance/static-copy.test.ts)
- **External docs:** Vercel Cron, Stripe Checkout, Cloudflare Turnstile, schema.org MedicalWebPage / FAQPage, Resend
