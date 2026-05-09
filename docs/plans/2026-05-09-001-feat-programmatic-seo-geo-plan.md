---
title: "feat: Programmatic SEO/GEO landing system + multi-market subscription funnel"
type: feat
status: active
date: 2026-05-09
origin: docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md
supersedes: docs/plans/2026-05-06-001-feat-acquisition-anchor-pages-plan.md
markets: [uk, us]
monetization: subscription-only
---

# feat: Programmatic SEO/GEO landing system + multi-market subscription funnel

## Overview

Build a programmatic SEO/GEO landing system that funnels high-intent men 25–50 from organic search and AI answer engines into MorningForm's interpretation engine. The system targets eight cohort clusters (fatigue, testosterone/libido, longevity 40+, recovery/HRV, metabolic, cardiovascular, fertility, executive) across two markets (UK, US) under a single subscription product (£19/mo UK, $29/mo US).

Origin: the user-supplied prompt of 2026-05-09 (a "world-class SEO/GEO strategist" brief specifying eight male cohorts, ten initial page concepts, GEO requirements for AI-engine surfacing, pay-per-insight mention rejected in favour of subscription-only). Carryover from `docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md`: regulatory posture (Path A — tech-first, no public clinician), the `forbidden-phrases.ts` runtime gate, the LandingPageVisit + funnel-stage instrumentation pattern, R11 source-of-truth and R12 silent-fallback principles.

Two strategic concessions baked in from the adversarial review of the predecessor plan:

1. **The 30-member milestone is not promised by this work.** Cold-organic SEO from a brand-new domain takes 6–18 months to produce meaningful traffic. This plan is foundational infrastructure for a Q4-onwards channel. Phase 0 success gate is "≥100 unique visitors AND ≥5 email signups per market in 3 weeks", not "≥X paying members". Channels 1–2 (concierge / founder network) own the 12-week milestone.
2. **The retention question is answered, not assumed.** Month 2 of subscription cannot rely on a second blood panel. Phase 2 ships a wearable bridge (Whoop / Oura / Apple Health) so the trend dashboard has fresh data each month without a £200 retest. If wearable integration is not viable in scope, the product reverts to pay-per-insight pricing.

Three phases:

- **Phase 0 — Validation MVP (weeks 1–3, U1–U5):** ship multi-market URL infra, page-data schema, one anchor page per market, GEO infrastructure (sitemap / robots / JSON-LD / hreflang), and auth-gated upload with email capture. **No Stripe, no public no-auth upload, no preview tier, no lifecycle emails.** Just enough to validate that organic search will deliver visitors who upload and convert to email.
- **Phase 1 — Programmatic + monetization (weeks 4–7, U6–U9), gated on Phase 0 hitting ≥100 visitors + ≥5 signups per market:** public no-auth upload + provisional-user pattern, preview Form Intelligence tier, multi-currency Stripe Subscription, lifecycle email sequence with signed unsubscribe.
- **Phase 2 — Scale + retention (weeks 8–12, U10–U12), gated on Phase 1 paid conversion:** programmatic page generator (9 more pages per market = ~18 pages shipped), wearable-data bridge for month-2 retention, trend dashboard.

The rest of this document is a planning artifact, not implementation. Code is sketched only where directional guidance helps a reviewer.

## Decision Frame

| Decision | Stance |
|---|---|
| **Markets** | UK + US, market-aware from day one. URL prefix `/uk/...` and `/us/...`. Default by Vercel Edge geo (`x-vercel-ip-country`); user can override via banner. Separate sitemaps, separate canonical URLs, hreflang annotations both ways. |
| **Monetization** | Subscription only. Single price tier per market: £19/mo UK, $29/mo US. No pay-per-insight CTA on the page surface. (If retention data forces a pivot, U8's `Order` shape is loose enough to add one-time later.) |
| **Regulatory posture** | Path A — tech-first, no public clinician. "When to escalate to GP/specialist" copy is rendered as standardised page module, not a personalised recommendation. The personalised LLM output (preview tier, U7) is the genuine SaMD-adjacent surface and warrants separate FDA/MHRA legal review before Phase 1 ships. **Plan-level finding: Phase 0 ships no LLM interpretation to anonymous visitors; only auth-gated intake. The regulatory exposure window opens with U7, not U2.** |
| **Content authoring** | TypeScript page-data files (`content/marketing/{market}/{slug}.ts`) — not MDX. Keeps the `static-copy.test.ts` editorial-QA pattern viable, gives type safety, and the data shape is the contract for Phase 2's programmatic generator. |
| **Programmatic generation** | Phase 2 only. Phase 0 and Phase 1 ship hand-curated pages. The "generator" in U10 is a CLI scaffolder (cohort schema → page-data file template), not an AI-content pipeline. Editorial review remains human. |

## Requirements

Numbered for traceability. Origin is the 2026-05-09 prompt unless noted.

| # | Requirement | Origin |
|---|---|---|
| **R1** | The system serves market-aware landing pages at `/{market}/{slug}` for `market ∈ {uk, us}`. Default market is inferred from `x-vercel-ip-country`; visitor can override via in-page banner. Override persists in `mf_market` cookie. | Prompt + research |
| **R2** | Each page renders from a typed `MarketingPage` data record. The TSX template is single, the data is many. Phase 2's programmatic generator scaffolds new records; it does not generate prose. | Prompt + research |
| **R3** | Each page emits valid `MedicalWebPage` and `FAQPage` JSON-LD. Pages include hreflang annotations to the same slug in the other market when an equivalent exists. | Prompt (GEO) |
| **R4** | A `/{market}/sitemap.xml` and a top-level `/sitemap_index.xml` are generated at build/runtime via Next's `MetadataRoute.Sitemap` API. `/robots.txt` allows the marketing tree, disallows `/api/*`, `/account/*`, `/r/*`. | Prompt (GEO) |
| **R5** | The conversion CTA from any page in Phase 0 is "Upload your last blood panel — see what your numbers actually mean → [email]" routed through the existing magic-link flow at `src/app/api/auth/request-link/route.ts`. Phase 1 replaces this with a public no-auth upload route that produces an immediate preview, then asks for email. | Prompt + R5 carryover |
| **R6** | Editorial copy is gated by an extension of `src/lib/compliance/static-copy.test.ts` that scans `content/marketing/**/*.ts` for forbidden language: Rx drug names (drawn from `src/lib/scribe/policy/forbidden-phrases.ts`), imperative-treatment verbs ("take", "start", "begin taking"), specific dose strings, certainty claims about disease state. CI fails if any page-data file violates. | Prompt (clinical safety) + carryover R5 |
| **R7** | A `LandingPageVisit` row is written for each first-paint of a marketing page; carries `slug`, `cohortKey`, `market`, `referrer`, `ipHash` (HMAC via session secret, reusing `src/app/api/auth/request-link/route.ts:113-119` helper), `mfAnonymousId`, `userAgentClass`. Two new funnel stages added to `src/lib/metrics/activation-funnel.ts`: `anchor-page-visit`, `anchor-page-to-signup`. | Carryover R7 |
| **R8** | Phase 1 ships a `tier=preview` Form Intelligence output: ≤4 paragraphs, ≤200 tokens each, generated server-side from an uploaded PDF, returned in the upload-results response and stored on a typed model (see D5). Preview output is `Cache-Control: no-store, private` and only re-fetchable by the cookie-bound visitor. | Carryover R5 + adversarial security review |
| **R9** | Phase 1 monetization is a Stripe Subscription per market (£19/mo via GBP price, $29/mo via USD price). Webhook metadata schema is `{ userId: string, market: 'uk' \| 'us' }` defined at checkout-session creation, validated on the webhook side, with `stripe-webhook-unmatched` Diagnostics counter on metadata mismatch. | Adversarial security review |
| **R10** | Phase 1 ships a day-7 + day-14 lifecycle email scheduled at signup time. Unsubscribe links carry a HMAC-signed token over `(email, scheduledFor)`. The cron at `/api/cron/marketing-emails` validates `Authorization: Bearer <CRON_SECRET>` before iterating the queue. | Adversarial security review |
| **R11** | All pricing strings, tier identifiers, and slug constants live in `src/lib/marketing/constants.ts` (single file, not four). Page templates and Stripe code import from this module. No ESLint rule — a PR-time greppable convention is sufficient at this scale. | Scope-guardian review of predecessor |
| **R12** | Silent-fallback paths emit a Diagnostics counter on a single `DiagnosticEvent` row per emit, not a separate aggregation pipeline. The activation-funnel CLI surfaces them via a `SELECT key, COUNT(*) FROM diagnostic_event GROUP BY key WHERE created_at > <from>` query in its existing report formatter. | Scope-guardian review of predecessor |
| **R13** | The provisional-user upgrade path (Phase 1 anonymous-upload → email-signup) cryptographically binds the `mf_anon` cookie to the magic-link verification: at verify time, the inbound `mf_anon` cookie value MUST equal the `anonymousSessionToken` field on the User row, OR equal the value embedded in the magic-link token payload. Mismatch = no upgrade, diagnostic counter `provisional-claim-cookie-mismatch`. | Adversarial security review |
| **R14** | The provisional-user FK ownership transfer at signup is explicit: `UPDATE source_document SET user_id = real_user_id WHERE user_id = provisional_user_id` runs in the same transaction as the User row upgrade. If the email already exists on a different User, the upgrade is rejected and the visitor is offered a "sign in to claim this upload" path instead. | Adversarial security review |
| **R15** | `User.email` becomes nullable. Schema migration is by `prisma db push --accept-data-loss` (the repo's only deploy mechanism), verified locally to be additive (no column drop) before merge. All call sites that read `user.email` are audited and handle `null`. | Feasibility review of predecessor |

## Key Technical Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Multi-market URL via `[market]` route segment, not domain or sub-path-after-rewrite.** | Cleanest seam for Next.js App Router. Each market gets a distinct canonical URL. Sitemap generation is straightforward. hreflang lives on layout metadata. No domain proliferation. |
| **D2** | **Default market via Vercel Edge geo, user-overridable via cookie + banner.** | `x-vercel-ip-country` is free in middleware. Visitor lands on `/` → middleware rewrites to `/uk/` or `/us/` based on country. UK users hitting a US-only page see a banner; bot crawlers see canonical + hreflang and self-index correctly. |
| **D3** | **Page data in TypeScript, not MDX or CMS.** | Type safety means cohort/market/slug invariants enforce at build. The editorial-QA Vitest test (R6) regex-scans `.ts` files trivially. Adding a CMS later is a non-breaking migration. |
| **D4** | **`PreviewSummary` is a new Prisma model, not a `tier` column on `ScribeAudit`.** | `ScribeAudit` has `scribeId` as a required FK with cascade delete and `(scribeId, requestId)` unique. Preview path has no Scribe row to attach to (Scribes are topicKey-scoped per user). New model decouples cleanly: `PreviewSummary { id, userId, sourceDocumentId, output, lintReport, createdAt }`. Avoids the predecessor plan's three-way-decision impasse. |
| **D5** | **Provisional-user pattern: `User.email` becomes nullable; `User.anonymousSessionToken` added; FK ownership transfers explicitly at upgrade.** | Closes the predecessor's P0 schema contradiction. Email-uniqueness is preserved (Postgres allows multiple NULLs in a unique index). Audit of read-sites for `user.email` is tractable (~20 files). |
| **D6** | **Editorial-QA via extension of `src/lib/compliance/static-copy.test.ts`, not a new rendering rig.** | Pattern exists. Scans `.ts` source. No RSC-rendering complexity. Folder added to scan: `content/marketing/`. Same regex set + page-specific allowlist if needed. |
| **D7** | **Stripe via the official `stripe` npm SDK, not a hand-rolled `fetch` client.** | Webhook signature verification (`stripe.webhooks.constructEvent`) is the SDK's primary value. Hand-rolling HMAC over `stripe-signature` is a security footgun. Mirror the SDK pattern, not Resend's pattern. |
| **D8** | **Reuse `MagicLinkRateLimit` for upload + signup rate limits by extending its `subjectKind` enum.** | The model already has `(subjectKind, subject, window)` keying. New values: `upload-ip-1h`, `upload-ip-24h`, `signup-ip-1h`. No parallel primitive (R15 of predecessor brainstorm). |
| **D9** | **Reuse the IP-hash helper from `src/app/api/auth/request-link/route.ts:113-119`. Factor it out to `src/lib/auth/ip-hash.ts`.** | Same SESSION_SECRET → same hash → same row across all surfaces. Avoids the rotation-divergence trap. |
| **D10** | **Membership state is a typed result: `{ kind: 'free' } \| { kind: 'active', renewsAt } \| { kind: 'past_due', graceUntil } \| { kind: 'cancelled', endedAt } \| { kind: 'error', reason }`.** | Anti-Dexcom discipline: no `string \| undefined`, no defaults, fail-loud. Stripe's 7+ subscription states map explicitly to one of these via a single conversion table in `src/lib/billing/membership-state.ts`. |

## Output Structure

```
src/
  app/
    [market]/
      layout.tsx                       # market-aware layout: hreflang, JSON-LD wrapper, currency context
      page.tsx                         # market homepage (UK or US)
      [slug]/
        page.tsx                       # generic marketing page template, reads from content/
        layout.tsx                     # JSON-LD MedicalWebPage + FAQPage emitter
    sitemap.ts                         # generates /uk/sitemap.xml + /us/sitemap.xml + index
    robots.ts
    upload/
      page.tsx                         # Phase 1 only: public no-auth upload UI
      results/
        page.tsx                       # Phase 1 only: shows preview output, gates email signup
    api/
      upload/
        route.ts                       # POST PDF, returns { previewId, anonymousSessionToken }
        results/
          [previewId]/route.ts         # GET preview output, cookie-bound
        webhooks/
          stripe/route.ts              # NB: at /api/billing/webhooks/stripe — not /api/upload/webhooks (predecessor namespacing was wrong)
      billing/
        checkout/route.ts              # creates Stripe Checkout Session with metadata { userId, market }
        webhooks/
          stripe/route.ts              # signature-verified, idempotent on stripeSubscriptionId
      cron/
        marketing-emails/route.ts      # Vercel Cron, validates Authorization: Bearer <CRON_SECRET>
      marketing/
        unsubscribe/route.ts           # POST with HMAC-signed token
  components/
    marketing/
      page-template.tsx                # the one TSX that renders all marketing pages
      hero-block.tsx
      cta-block.tsx
      faq-block.tsx
      escalation-module.tsx            # standardised "when to speak to a clinician" panel
      market-banner.tsx                # geo-mismatch override
      visit-beacon.tsx                 # client-side LandingPageVisit emitter
    structured-data/
      medical-webpage.tsx              # JSON-LD emitter
      faq-page.tsx                     # JSON-LD emitter
  lib/
    marketing/
      constants.ts                     # pricing, slugs, cohort keys, market config — single file, R11
      market.ts                        # getMarketFromRequest, useMarket hook, market types
      currency.ts                      # formatPrice(market, amount)
      cohorts.ts                       # cohort taxonomy (fatigue, testosterone, longevity, ...)
      page-schema.ts                   # MarketingPage Zod schema + types
    auth/
      ip-hash.ts                       # factored out from request-link/route.ts
    billing/
      stripe.ts                        # SDK initialiser, single instance
      membership-state.ts              # typed conversion table (D10)
      checkout.ts                      # session creation
    upload/
      preview-compile.ts               # entry point that produces a PreviewSummary (D4)
      blob-storage.ts                  # thin wrapper if intake/storage.ts isn't reusable as-is
    compliance/
      static-copy.test.ts              # extended to scan content/marketing/**/*.ts (R6)
content/
  marketing/
    uk/
      fatigue-in-men.ts
    us/
      fatigue-in-men.ts
prisma/
  schema.prisma                        # diff: User.email nullable + User.anonymousSessionToken;
                                       #       MarketingPage NOT a model (TS files are SoT);
                                       #       LandingPageVisit, PreviewSummary, Subscription,
                                       #       MarketingEmailSchedule, EmailSuppression,
                                       #       DiagnosticEvent.
                                       #       MagicLinkRateLimit.subjectKind extended (no schema change).
```

## Visitor → Subscription Sequence (Phase 1)

```mermaid
sequenceDiagram
    participant V as Visitor (anon)
    participant E as Vercel Edge
    participant P as /uk/[slug] page (RSC)
    participant U as POST /api/upload
    participant W as Preview compile (server)
    participant DB as Postgres
    participant API as POST /api/auth/request-link
    participant V2 as GET /api/auth/verify
    participant CO as POST /api/billing/checkout
    participant S as Stripe
    participant WH as POST /api/billing/webhooks/stripe

    V->>E: GET /
    E->>E: x-vercel-ip-country → 'GB'
    E-->>V: 302 /uk
    V->>P: GET /uk/fatigue-in-men
    P-->>V: HTML + JSON-LD + visit-beacon
    V->>DB: LandingPageVisit { slug, cohort, market, ipHash, mfAnonymousId }
    V->>U: POST PDF + Turnstile token + mf_anon
    U->>DB: rate-limit check (MagicLinkRateLimit subjectKind='upload-ip-1h')
    U->>DB: provisional User { email: null, anonymousSessionToken: mf_anon }
    U->>DB: SourceDocument FK to provisional userId
    U->>W: compile preview (≤4 paragraphs)
    W->>DB: PreviewSummary { userId, sourceDocumentId, output }
    U-->>V: { previewId, anonymousSessionToken }
    V->>P: GET /upload/results
    P-->>V: preview HTML + email-signup form (CTA: subscribe £19/mo)
    V->>API: POST { email, anonymousId: mf_anon }
    API->>DB: payload-bind anonymousId to magic-link token
    API-->>V: 200 (link sent to email)
    V->>V2: GET magic-link
    V2->>DB: verify cookie mf_anon == User.anonymousSessionToken AND token.payload.anonymousId matches (R13)
    V2->>DB: UPDATE User SET email=:email; UPDATE source_document SET user_id=:realId (R14, in tx)
    V2-->>V: signed-in session
    V->>CO: POST { market: 'uk' }
    CO->>S: createCheckoutSession({ price: GBP_19, metadata: { userId, market: 'uk' } })
    CO-->>V: 303 → Stripe-hosted checkout
    V->>S: pay
    S->>WH: checkout.session.completed (signed)
    WH->>DB: idempotent on stripeSubscriptionId; Subscription { userId, market, status: 'active' }
    S-->>V: 303 back to /account (signed-in, active)
```

## Implementation Units

### Phase 0 — Validation MVP (weeks 1–3)

#### U1 · Multi-market URL infrastructure

**Goal.** Visitor lands on `/`, gets routed to `/uk` or `/us` by Edge geo, with cookie-overridable preference. `useMarket()` hook available in any RSC; `formatPrice()` honours market currency. Hreflang and canonical URLs render correctly per market.

**Files.**
- Create: `src/lib/marketing/market.ts` (types: `Market = 'uk' | 'us'`, `getMarketFromRequest(req)`, `useMarket()` server helper, `MarketProvider` context)
- Create: `src/lib/marketing/currency.ts` (`formatPrice(market, amount)`, `MEMBERSHIP_PRICE` table)
- Create: `src/lib/marketing/constants.ts` (R11 single file: pricing, cohorts, slugs, copy keys)
- Create: `src/app/[market]/layout.tsx` (root layout for marketing tree; sets html lang, hreflang link rels, JSON-LD `WebSite` schema)
- Modify: `src/middleware.ts` — add `/` to `config.matcher`, branch on `x-vercel-ip-country`. Match-only routes: `/`, `/uk`, `/us`, `/uk/(.*)`, `/us/(.*)` (when geo logic needed). For pages that don't need middleware processing, leave them out of the matcher entirely.
- Create: `src/components/marketing/market-banner.tsx` (suggests switch when geo ≠ cookie)

**Approach.** The middleware adds geo-based default routing only at root (`/`). Sub-paths under `/uk/...` and `/us/...` are not in the matcher (so middleware doesn't run on them) — they're served unconditionally per their market. The market is a structural URL parameter, not a runtime preference. The cookie `mf_market` is set when the visitor uses the banner override; on next root visit, middleware honours the cookie before geo. Non-matcher pSEO pages remain public-by-default per the existing allowlist behaviour.

**Patterns to follow.** [src/middleware.ts:68-91](src/middleware.ts#L68-L91) (existing matcher + allowlist branch); [src/lib/utils.ts:58](src/lib/utils.ts#L58) (the only existing locale touch — replace with market-aware version).

**Test scenarios.**
- Edge case: GET `/` from `x-vercel-ip-country: GB` and no `mf_market` cookie → 302 to `/uk`.
- Edge case: GET `/` from `x-vercel-ip-country: US` and no cookie → 302 to `/us`.
- Edge case: GET `/` from `x-vercel-ip-country: FR` and no cookie → 302 to `/us` (default fallback).
- Happy path: GET `/uk/fatigue-in-men` from any geo → 200, no redirect.
- Happy path: cookie `mf_market=us` and `x-vercel-ip-country: GB` → GET `/` redirects to `/us`.
- Error path: GET `/xx/anything` (invalid market) → 404 (not a redirect loop).
- Integration: `useMarket()` from inside `/uk/[slug]/page.tsx` returns `'uk'`; `formatPrice('uk', 1900)` returns `"£19"`.

**Verification.** Manual smoke: visit `/` from VPN endpoints in GB and US; confirm correct redirect. Visit `/uk` from US, see market-banner suggesting `/us`. Click banner → `mf_market=uk` cookie set, banner disappears.

**Dependencies.** None.

**Execution note.** Test-first for the redirect logic — middleware behaviour is sticky once written and easy to break silently. Write the matcher test with a Vitest mock of `NextRequest`.

---

#### U2 · Page-data schema + one anchor page per market

**Goal.** A typed `MarketingPage` data record. A single TSX template renders any page from data. Two pages shipped: UK and US versions of "Fatigue in men: causes, blood tests, and next steps". The editorial-QA Vitest gate (R6) is extended to scan the content folder. CI fails if any page-data file violates the regex sweep.

**Files.**
- Create: `src/lib/marketing/page-schema.ts` (Zod: `MarketingPageSchema` with `slug`, `market`, `cohortKey`, `seoTitle`, `metaDescription`, `h1`, `aboveFold`, `sections[]`, `faq[]`, `escalation`, `cta`, `publishedAt`, `lastReviewedAt`, `reviewerKey`)
- Create: `src/lib/marketing/cohorts.ts` (cohort taxonomy: `fatigue | testosterone | longevity-40 | recovery-hrv | metabolic | cardio | fertility | executive`)
- Create: `src/components/marketing/page-template.tsx` (the single TSX template)
- Create: `src/components/marketing/hero-block.tsx`, `cta-block.tsx`, `faq-block.tsx`, `escalation-module.tsx`
- Create: `src/app/[market]/[slug]/page.tsx` (dynamic route, generates static params from content folder, reads page-data, renders template)
- Create: `src/app/[market]/[slug]/layout.tsx` (emits MedicalWebPage + FAQPage JSON-LD)
- Create: `content/marketing/uk/fatigue-in-men.ts`
- Create: `content/marketing/us/fatigue-in-men.ts`
- Modify: `src/lib/compliance/static-copy.test.ts` — extend the file-walk to also scan `content/marketing/**/*.ts`. Page-data file may declare a `qaAllowlist?: string[]` field for explicit phrase exemptions (each requires a comment explaining why).

**Approach.** Pages are imported eagerly at build time (Next 14 SSG). `generateStaticParams` walks `content/marketing/{market}/` and returns the cartesian product. The template is intentionally rigid — sections render from a fixed schema (hero, FAQ, escalation, CTA), not freeform components. This keeps the editorial-QA scan effective: regexes only need to match flat strings, never component trees.

The two anchor pages have hreflang annotations pointing to each other. Pages without an equivalent in the other market emit `hreflang=x-default` to the configured default (UK).

**Patterns to follow.** [src/lib/compliance/static-copy.test.ts](src/lib/compliance/static-copy.test.ts) (extend the walk + regex sweep); [src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts) (import its phrase list directly — single source of truth, R11); [src/app/r/[slug]/page.tsx](src/app/r/[slug]/page.tsx) (precedent for slug-based routing, though that one is hand-mapped).

**Test scenarios.**
- Happy path: GET `/uk/fatigue-in-men` → 200, H1 matches data, JSON-LD validates against schema.org/MedicalWebPage.
- Happy path: GET `/us/fatigue-in-men` → 200, USD currency in CTA, US-sourced clinical references.
- Edge case: Page-data file with `body: "start taking creatine"` → editorial-QA test fails CI (matches imperative-treatment regex).
- Edge case: Page-data file with `body: "discuss creatine with your GP"` → passes (the contextual GP-prep phrasing is explicitly allowlisted in `static-copy.test.ts` precedent).
- Edge case: Page-data file referring to "Adderall" → fails (Rx drug name in `forbidden-phrases.ts`).
- Error path: GET `/uk/nonexistent-slug` → 404 (Next default).
- Integration: hreflang on `/uk/fatigue-in-men` page source includes `<link rel="alternate" hreflang="en-GB" href="https://.../uk/fatigue-in-men">` AND `<link rel="alternate" hreflang="en-US" href="https://.../us/fatigue-in-men">`.
- Integration: JSON-LD includes `mainEntityOfPage`, `lastReviewed`, `medicalAudience`, FAQ entries with `Question` + `Answer` pairs.

**Verification.** Local: `npm run test:compliance` (or whatever the static-copy.test.ts runner is) passes with both pages. `npm run dev` → both URLs render. Lighthouse SEO audit ≥95 on both.

**Dependencies.** U1.

**Execution note.** Characterization-first for the editorial-QA extension: write a failing test that asserts the new content folder is scanned BEFORE adding pages. Then add pages and confirm the regex sweep catches a deliberately-bad fixture before removing the fixture.

---

#### U3 · Auth-gated upload landing + email capture (validation MVP path)

**Goal.** Phase 0's CTA from any anchor page → existing magic-link signup with `cohortKey` and `market` captured on the User row → existing intake pipeline. NO public no-auth upload, NO preview tier. The visitor signs up first (auth-gate), then uploads. Validation MVP only — Phase 1 replaces this with the no-auth flow.

**Files.**
- Modify: `prisma/schema.prisma` — add `User.signupMarket: String?`, `User.signupCohort: String?`, `User.signupSlug: String?` (all nullable, populated at signup time only).
- Modify: `src/app/api/auth/request-link/route.ts` — accept optional `signupContext: { market, cohort, slug }` in the request body, attach to User on upsert.
- Modify: `src/components/marketing/cta-block.tsx` — POST to `/api/auth/request-link` with the page's market/cohort/slug context, then show "check your email" state.
- Modify: `src/lib/metrics/activation-funnel.ts` — add stages `anchor-page-visit` (joined via `LandingPageVisit`), `anchor-page-to-signup` (joined via `User.signupSlug` non-null).

**Approach.** This unit is intentionally minimal. The page CTA is the existing magic-link flow with three extra fields persisted on the User row. The user signs in, lands at the existing intake screen, uploads. We measure: page → email signup (the funnel's R7 stage) and email signup → upload (existing intake instrumentation).

The Phase 0 success gate is whether anchor pages produce email signups at all. If yes (≥5 signups per market in 3 weeks), Phase 1 replaces this unit's CTA with the public no-auth upload flow.

**Patterns to follow.** [src/app/api/auth/request-link/route.ts](src/app/api/auth/request-link/route.ts) (existing magic-link); [src/lib/metrics/activation-funnel.ts](src/lib/metrics/activation-funnel.ts) (stage definitions).

**Test scenarios.**
- Happy path: GET `/uk/fatigue-in-men` → click CTA → email submitted with `signupContext: { market: 'uk', cohort: 'fatigue', slug: 'fatigue-in-men' }` → User row created with those fields.
- Happy path: After email verify, redirect to `/intake` (existing flow). User uploads PDF normally.
- Edge case: User already exists (returning visitor with same email) → upsert preserves original `signupSlug` (don't overwrite — `signupSlug` is set only on first creation).
- Integration: Funnel report shows new stages `anchor-page-visit` and `anchor-page-to-signup` with cohort breakdown.
- Edge case: CTA submission fails (network error, rate limit) → existing magic-link error UX.

**Verification.** Manual: visit `/uk/fatigue-in-men`, submit email, verify magic link, confirm User row in DB has `signupMarket=uk, signupCohort=fatigue, signupSlug=fatigue-in-men`. Run activation-funnel report and see new stages populated.

**Dependencies.** U1, U2, U5 (LandingPageVisit emission).

**Execution note.** None. Trivial extension of existing flow.

---

#### U4 · GEO infrastructure (sitemap, robots, structured data)

**Goal.** Both markets have valid sitemaps. Robots respects the marketing tree. Every marketing page emits `MedicalWebPage` + `FAQPage` JSON-LD. AI answer engines (Perplexity, ChatGPT browsing, Gemini, Google AI Overviews) can crawl and cite pages.

**Files.**
- Create: `src/app/sitemap.ts` (Next 14 `MetadataRoute.Sitemap` — generates a single sitemap-index that points at per-market sitemaps)
- Create: `src/app/uk/sitemap.ts`, `src/app/us/sitemap.ts` (each enumerates pages in `content/marketing/{market}/`)
- Create: `src/app/robots.ts` (allows `/uk/`, `/us/`, `/`; disallows `/api/`, `/account/`, `/r/`, `/share/`, `/intake`, `/onboarding`)
- Create: `src/components/structured-data/medical-webpage.tsx` (JSON-LD emitter for MedicalWebPage schema)
- Create: `src/components/structured-data/faq-page.tsx` (JSON-LD emitter for FAQPage schema)
- Modify: `src/app/[market]/[slug]/layout.tsx` — render both JSON-LD components from page-data
- Create: `src/lib/marketing/seo.ts` (`buildCanonicalUrl(market, slug)`, `buildHreflangAlternates(slug, availableMarkets)`)

**Approach.** JSON-LD entities are typed (Zod) per schema.org's MedicalWebPage. Required fields: `@type`, `name`, `url`, `mainEntityOfPage`, `medicalAudience`, `lastReviewed`, `reviewedBy.@type` (where allowed under Path A — see regulatory note below). Page-data carries `lastReviewedAt: Date` and `reviewerKey: string`; the JSON-LD emitter renders `reviewedBy` as an `Organization` (MorningForm) for Path A. (If/when Path B engages, `reviewedBy` becomes a `Person` with credentials.)

**Patterns to follow.** Next 14 [`MetadataRoute.Sitemap`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) and [`MetadataRoute.Robots`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) APIs (no codebase precedent — verify against current Next 14.2.35 docs at implementation time).

**Test scenarios.**
- Happy path: GET `/sitemap.xml` returns sitemap-index with two entries (`/uk/sitemap.xml`, `/us/sitemap.xml`).
- Happy path: GET `/uk/sitemap.xml` lists all pages in `content/marketing/uk/`.
- Happy path: GET `/robots.txt` matches expected disallow rules.
- Integration: Page source for `/uk/fatigue-in-men` contains a `<script type="application/ld+json">` block validating against schema.org/MedicalWebPage.
- Integration: FAQ JSON-LD `mainEntity` array matches the page's `faq` data.
- Edge case: Page with no FAQ → no FAQPage JSON-LD emitted (avoid empty `mainEntity`).
- Edge case: Page with `lastReviewedAt > 90 days ago` → editorial-QA test warns (not fail) about stale review.

**Verification.** Run pages through Google's Rich Results Test and Schema.org Validator. Confirm `lastReviewed` and `medicalAudience` are recognised.

**Dependencies.** U2.

**Execution note.** None. JSON-LD output is testable as plain string assertions.

---

#### U5 · Funnel measurement: LandingPageVisit + cohort-aware funnel stages

**Goal.** Every marketing page emits a single `LandingPageVisit` row on first paint. The activation-funnel report has new stages for `anchor-page-visit` and `anchor-page-to-signup`, broken down by cohort and market.

**Files.**
- Modify: `prisma/schema.prisma` — add `LandingPageVisit` model:
  ```
  model LandingPageVisit {
    id                  String   @id @default(cuid())
    slug                String
    cohortKey           String
    market              String
    referrer            String?
    ipHash              String   // HMAC via session secret (D9)
    mfAnonymousId       String   // matches User.anonymousSessionToken if upgraded
    userAgentClass      String   // 'browser' | 'bot' | 'unknown' (R12 single-source-of-truth)
    email               String?  @db.VarChar(320)  // backfilled at signup-time (R14 join key)
    createdAt           DateTime @default(now())
    @@index([slug, market, createdAt])
    @@index([mfAnonymousId])
    @@index([email])
  }
  ```
- Create: `src/lib/auth/ip-hash.ts` (factored out from `src/app/api/auth/request-link/route.ts:113-119`; same SESSION_SECRET, same algorithm)
- Modify: `src/app/api/auth/request-link/route.ts` — import from `lib/auth/ip-hash.ts` (replace inline helper)
- Create: `src/components/marketing/visit-beacon.tsx` (client component; POSTs to `/api/marketing/visit` once per page-load with `slug`, `cohort`, `market`, `referrer`)
- Create: `src/app/api/marketing/visit/route.ts` (writes `LandingPageVisit` after dedupe-by-mfAnonymousId-and-slug-within-1-minute)
- Modify: `src/lib/metrics/activation-funnel.ts` — add two new stages:
  - `anchor-page-visit`: min `LandingPageVisit.createdAt` per `mfAnonymousId`, joined to `User` via `email`
  - `anchor-page-to-signup`: time delta from first `LandingPageVisit` to first `User.createdAt` (where `signupSlug = LandingPageVisit.slug`)
- Modify: `src/middleware.ts` — set `mf_anon` cookie on the marketing tree's first visit (random UUID, httpOnly, sameSite=lax). Read cookie if present.

**Approach.** The bot/non-bot detection is a single conservative regex (Googlebot, GPTBot, ClaudeBot, PerplexityBot, GeminiBot, common SEO crawlers). Bot visits ARE persisted (separate `userAgentClass='bot'`) — we want to know AI-engine crawl rates. The R7 join-key handoff: at email-verify time (U6 in Phase 1, or U3 in Phase 0), we `UPDATE landing_page_visit SET email = :realEmail WHERE mf_anonymous_id = :mfAnonymousId`. This makes funnel attribution precise; without the backfill, the join silently under-counts (predecessor's F6 finding).

**Patterns to follow.** [src/app/api/auth/request-link/route.ts:113-119](src/app/api/auth/request-link/route.ts#L113-L119) (IP hash); [src/lib/metrics/activation-funnel.ts](src/lib/metrics/activation-funnel.ts) (stage definitions).

**Test scenarios.**
- Happy path: Visitor lands on `/uk/fatigue-in-men` → `LandingPageVisit` row written with correct fields.
- Edge case: Same visitor reloads page within 1 min → no duplicate row (deduped by mfAnonymousId + slug + 1-min window).
- Edge case: Bot user-agent → `userAgentClass='bot'`; row persists.
- Edge case: No `mf_anon` cookie → middleware sets it before page render; visit-beacon reads it.
- Integration: After email signup via U3, `LandingPageVisit.email` is populated for all rows matching `mfAnonymousId`.
- Integration: Activation-funnel CLI shows `anchor-page-visit → anchor-page-to-signup` conversion percentage by cohort and market.

**Verification.** Cohort report query produces non-zero counts after manual smoke. Bot count is >0 within 24h (Googlebot will hit fast).

**Dependencies.** U1, U2.

**Execution note.** Test-first for the dedupe window: it's the kind of logic that silently over-counts.

---

### Phase 0 success gate

Before Phase 1 begins:

- ≥100 unique non-bot visits per market across the two anchor pages within 21 days of go-live.
- ≥5 email signups per market within the same window.
- Editorial-QA Vitest gate green on every commit.
- Both anchor pages indexed by Google (verified via `site:` query) and rendering in at least one AI answer engine (Perplexity test query).

If signups are <5 per market, do not build Phase 1. Iterate on copy, distribution, or recommend pivoting to channels 1+2 (concierge / founder).

---

### Phase 1 — Programmatic + monetization (weeks 4–7)

#### U6 · Public no-auth upload + provisional-user pattern

**Goal.** Visitor on a marketing page can upload a PDF without signing in. A provisional User row is created with `email=null`. SourceDocument is FK'd to that provisional user. At later signup, the `mf_anon`-cookie-bound upgrade transfers ownership to the real user atomically.

**Files.**
- Modify: `prisma/schema.prisma`:
  - `User.email: String?` (was `String @unique`, becomes `String? @unique` — Postgres allows multiple NULLs in a unique index)
  - `User.anonymousSessionToken: String? @unique` (added)
  - Verify by audit: every read site of `user.email` handles `null` (predecessor's F1)
- Modify: `MagicLinkRateLimit` — add new `subjectKind` values via constants only (no schema change): `upload-ip-1h`, `upload-ip-24h`, `signup-ip-1h`. (D8)
- Create: `src/app/upload/page.tsx` (public, no auth — the upload UI)
- Create: `src/app/api/upload/route.ts` (POST PDF + Turnstile token + `mf_anon`)
- Create: `src/lib/upload/blob-storage.ts` (wraps `src/lib/intake/storage.ts:storePdf`; ensures path uses provisional userId)
- Modify: `src/middleware.ts` — add `/upload`, `/upload/results`, `/api/upload/*` to `config.matcher` so the matcher actually runs on these routes; in the if-branch, set `X-Robots-Tag: noindex` (preview surface should not be indexable).
- Modify: `src/app/api/auth/request-link/route.ts` — accept `anonymousId` parameter; embed in magic-link token payload for verification cross-check.
- Modify: `src/app/api/auth/verify/route.ts` — at verify time, check inbound `mf_anon` cookie matches token's `anonymousId` AND matches `User.anonymousSessionToken` (R13). Run FK ownership transfer in same transaction (R14).

**Approach.** The middleware change is the predecessor's F4 trap. We MUST add `/upload`, `/upload/results`, `/api/upload/*` to `config.matcher` for the public-allowlist branch to fire. For routes that should remain public-by-default (anything else), we keep them out of the matcher. The matcher edit is small but load-bearing.

The provisional-user creation runs inside the upload route after Turnstile verification + IP rate-limit (D8 + D9). The `User.anonymousSessionToken` value equals the `mf_anon` cookie. This is the cryptographic binding: at verify-time, the cookie must still match.

The FK ownership transfer at signup (R14) is one transaction:
```
BEGIN;
UPDATE source_document SET user_id = :realUserId WHERE user_id = :provisionalUserId;
UPDATE preview_summary SET user_id = :realUserId WHERE user_id = :provisionalUserId;
UPDATE landing_page_visit SET email = :email WHERE mf_anonymous_id = :anonymousId;
UPDATE "user" SET email = :email, name = :name, anonymous_session_token = NULL WHERE id = :provisionalUserId;
DELETE FROM "user" WHERE id = :provisionalUserId AND email IS NULL;  -- safety net; should be no-op
COMMIT;
```

If `email` already exists on a different User, we reject the upgrade and surface "sign in to claim this upload" — the visitor signs in via a separate path that re-runs the FK transfer keyed on the existing User's id.

**Patterns to follow.** [src/lib/intake/storage.ts](src/lib/intake/storage.ts) (Blob API); [src/lib/auth/magic-link.ts:66-128](src/lib/auth/magic-link.ts#L66-L128) (rate-limit transaction pattern); [src/app/api/auth/request-link/route.ts:113-119](src/app/api/auth/request-link/route.ts#L113-L119) (now factored to `lib/auth/ip-hash.ts` per U5).

**Test scenarios.**
- Happy path: anonymous visitor POSTs PDF + Turnstile + `mf_anon` → 200 with `{ previewId, anonymousSessionToken }`. Provisional User row exists; SourceDocument FK is provisional userId.
- Edge case: Turnstile token invalid → 401, no User row created.
- Edge case: 6th upload from same IP within 1h → 429, `MagicLinkRateLimit.subjectKind=upload-ip-1h` triggered.
- Edge case: PDF has no magic bytes (`%PDF-1.`) → 415, no User row created. Diagnostic counter `upload-magic-byte-rejected` written.
- Edge case: At verify time, cookie `mf_anon` is missing or mismatched → reject, diagnostic counter `provisional-claim-cookie-mismatch`.
- Edge case: At verify time, email already exists on a different User → reject upgrade, surface "sign in to claim" path, no FK transfer.
- Integration: Successful upgrade → SourceDocument now FKs real User; `LandingPageVisit.email` is populated; provisional User row is gone.
- Edge case: Verify-time transaction fails partway → entire transaction rolls back; provisional User remains intact; visitor can retry.

**Verification.** Manual: anonymous upload → check DB for provisional User; sign up → confirm transaction completes atomically; confirm provisional User cleanup.

**Dependencies.** U1, U5.

**Execution note.** Characterization-first for the existing `User.email` references: write a failing test asserting at least N call sites and grep for the actual count first. Audit every call site for null-handling before applying the schema change.

---

#### U7 · Preview Form Intelligence tier

**Goal.** Anonymous visitor's uploaded PDF is processed server-side and produces a ≤4-paragraph, ≤200-tokens-each plain-English summary. Output is stored on a typed `PreviewSummary` model (D4), not on `ScribeAudit`. Output is `Cache-Control: no-store` and only re-fetchable by the cookie-bound visitor.

**Files.**
- Modify: `prisma/schema.prisma` — add:
  ```
  model PreviewSummary {
    id                  String   @id @default(cuid())
    userId              String
    sourceDocumentId    String
    output              String   // ≤4 paragraphs of plain text
    lintReport          Json     // forbidden-phrases scan output
    createdAt           DateTime @default(now())
    user                User           @relation(fields: [userId], references: [id], onDelete: Cascade)
    sourceDocument      SourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
    @@unique([userId, sourceDocumentId])
  }
  ```
- Create: `src/lib/upload/preview-compile.ts` — entry point that takes a SourceDocument, runs extraction (existing pipeline), generates a preview prompt with G1–G7 constraints baked in, calls LLMClient, runs output through `forbidden-phrases.ts`, writes `PreviewSummary` row.
- Modify: `src/lib/llm/linter.ts` — extend `LintSurface` union with `'preview'`. Adding the string is a one-line union extension; the surface-aware behaviour is genuinely new code (predecessor's F9). Branch: preview output is a flat array of paragraphs, no section keys.
- Create: `src/lib/llm/preview-prompt.ts` — Anthropic prompt with explicit constraints: no Rx names, no doses, no imperative-treatment verbs, no certainty claims, no diagnostic conclusions, return JSON `{ paragraphs: string[] }`.
- Create: `src/app/upload/results/page.tsx` (RSC, reads PreviewSummary by id, gated by cookie match)
- Create: `src/app/api/upload/results/[previewId]/route.ts` (cookie-bound GET; sets `Cache-Control: no-store, private` on response)

**Approach.** The preview prompt is short and constrained: extract markers in the PDF, identify ≤3 markers most likely to cause anxiety/curiosity for the cohort, write 1 paragraph per. No supplements, no protocols, no comparisons. If the PDF lacks recognisable lab markers, the preview falls back to "we couldn't read your panel — upload a Quest, LabCorp, NHS, or Medichecks PDF" with a `preview-fallback-no-markers` Diagnostic counter (R12). The fallback is fail-loud: no synthetic content generated.

The cookie-binding on `/api/upload/results/[previewId]` works by deriving `userId` from `PreviewSummary.userId`, then reading the inbound `mf_anon` cookie. Match against `User.anonymousSessionToken` for provisional users; match against the session cookie for upgraded users. Mismatch returns 403, not 401 (we don't want to reveal the resource exists).

**Patterns to follow.** [src/lib/llm/linter.ts](src/lib/llm/linter.ts) (LintSurface extension); [src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts) (regulatory gate); the LLMClient pattern with DPA SHA pin and Edge Config kill-switch (existing).

**Test scenarios.**
- Happy path: Provisional user with valid PDF → preview generated, 4 paragraphs, passes forbidden-phrases scan.
- Edge case: PDF has no recognisable markers → fallback message; Diagnostic counter `preview-fallback-no-markers`.
- Edge case: LLM output contains an Rx drug name → forbidden-phrases scan rejects; preview not stored; `preview-rejected-rx-name` counter; user sees "we're checking your results — try again in a minute" (no synthetic preview).
- Edge case: Edge Config kill-switch flipped → preview compile errors loudly; user sees error state, not silent fallback.
- Edge case: GET `/api/upload/results/[previewId]` from a different `mf_anon` cookie → 403.
- Edge case: GET `/api/upload/results/[previewId]` with no cookie → 403.
- Integration: Preview HTML response carries `Cache-Control: no-store, private`.

**Verification.** Manual: anonymous upload of synthetic Quest panel → preview renders ≤4 paragraphs, all marker-specific. Try variations: corrupted PDF, panel with only one marker, panel with cancer-related markers (forbidden-phrases must catch). Confirm `Cache-Control` header.

**Dependencies.** U6.

**Execution note.** Test-first for the linter extension and the cookie-binding logic. Both are silent-fail surfaces.

---

#### U8 · Multi-currency Stripe Subscription

**Goal.** Authed user (post-upgrade) clicks "Subscribe £19/mo" on the results page → Stripe Checkout Session is created with `metadata: { userId, market }` → Stripe webhook writes `Subscription` row → `getMembershipState(userId)` returns a typed result. Two prices: GBP £19/mo (UK), USD $29/mo (US).

**Files.**
- Add dependency: `stripe` (npm, official SDK).
- Modify: `prisma/schema.prisma` — add:
  ```
  model Subscription {
    id                    String   @id @default(cuid())
    userId                String
    market                String   // 'uk' | 'us'
    stripeCustomerId      String   @unique
    stripeSubscriptionId  String   @unique
    status                String   // 'active' | 'past_due' | 'cancelled' | 'incomplete'
    currentPeriodEnd      DateTime
    cancelAt              DateTime?
    createdAt             DateTime @default(now())
    updatedAt             DateTime @updatedAt
    user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@index([userId])
    @@index([stripeSubscriptionId])
  }
  ```
- Create: `src/lib/billing/stripe.ts` — single Stripe SDK instance, env-keyed.
- Create: `src/lib/billing/checkout.ts` — `createCheckoutSession({ userId, market })` returns the session URL. Sets metadata `{ userId, market }` (R9).
- Create: `src/lib/billing/membership-state.ts` — `getMembershipState(userId): MembershipState` typed result (D10). Conversion table maps Stripe's 7+ statuses to our 5.
- Create: `src/app/api/billing/checkout/route.ts` (auth-gated POST; reads market from User row's `signupMarket` or current market context)
- Create: `src/app/api/billing/webhooks/stripe/route.ts` — webhook signature verified via `stripe.webhooks.constructEvent`. Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Idempotent on `stripeSubscriptionId`. Diagnostic counter `stripe-webhook-unmatched` if metadata missing.
- Modify: `src/middleware.ts` — add `/api/billing/webhooks/*` to matcher with the public-allowlist branch (no cookie auth; Stripe signs).
- Modify: `src/lib/marketing/constants.ts` — add `STRIPE_PRICE_IDS: { uk: 'price_xxx_gbp_19', us: 'price_yyy_usd_29' }` (env-driven; `_TEST_` and `_LIVE_` variants).

**Approach.** Two prices, one product. Stripe Checkout returns to `/account?welcome=1` on success. The webhook is the source of truth: Subscription row is only written by the webhook, never by the checkout endpoint. Idempotency is enforced by the unique constraint on `stripeSubscriptionId`. Diagnostic counter on metadata mismatch (predecessor's P1-4): if `metadata.userId` is missing or doesn't match a User, counter increments and we email ops alerts.

The metadata schema is `{ userId, market }` — defined upfront, not deferred (predecessor's P1-4). Both fields are required at session creation; the webhook validates both before writing the Subscription row.

**Patterns to follow.** Official Stripe Node SDK docs (must be verified at implementation time — pin SDK version in `package.json`).

**Test scenarios.**
- Happy path: Authed user POSTs `/api/billing/checkout` → Stripe Checkout URL with `metadata.userId` and `metadata.market` set.
- Happy path: Webhook receives `checkout.session.completed` with valid signature → Subscription row written, `Membership.getState(userId).kind === 'active'`.
- Edge case: Webhook arrives before checkout endpoint completes (race) → idempotent on `stripeSubscriptionId`.
- Edge case: Webhook with invalid signature → 400, no DB write.
- Edge case: Webhook with metadata missing `userId` → 200 (Stripe's expected response), Diagnostic counter `stripe-webhook-unmatched`, ops alert.
- Edge case: User cancels subscription → `customer.subscription.updated` webhook → Subscription.status='cancelled', cancelAt populated.
- Edge case: Card fails on renewal → `customer.subscription.updated` with status=past_due → `getMembershipState(userId).kind === 'past_due'`, graceUntil set.
- Integration: `getMembershipState(userId)` for a deleted User returns `{ kind: 'error', reason: 'user-not-found' }`. No defaults, no falsy returns.

**Verification.** Stripe test-mode end-to-end: create checkout, pay with `4242…`, confirm Subscription row. Cancel via Stripe dashboard → confirm webhook fires → confirm membership state transitions.

**Dependencies.** U6.

**Execution note.** Test-first for the typed conversion table in `membership-state.ts`. It's the boundary between Stripe's truth and our truth. Use Stripe's published event fixtures.

---

#### U9 · Lifecycle emails (cron + queue + signed unsubscribe)

**Goal.** At signup-from-preview time, day-7 and day-14 emails are scheduled to nudge the visitor toward subscription if they haven't paid yet. A Vercel Cron at `/api/cron/marketing-emails` runs hourly and processes due rows. Unsubscribe links carry a HMAC-signed token. Suppression honoured globally.

**Files.**
- Modify: `prisma/schema.prisma` — add:
  ```
  model MarketingEmailSchedule {
    id            String    @id @default(cuid())
    userId        String
    segmentKey    String    // 'day-7' | 'day-14'
    scheduledFor  DateTime
    sentAt        DateTime?
    bouncedAt     DateTime?
    createdAt     DateTime  @default(now())
    user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([userId, segmentKey])  // R12 idempotency on schedule write
    @@index([scheduledFor, sentAt])
  }
  model EmailSuppression {
    id            String   @id @default(cuid())
    email         String   @unique  @db.VarChar(320)
    reason        String   // 'unsubscribed' | 'bounced' | 'complained'
    createdAt     DateTime @default(now())
  }
  ```
- Create: `vercel.json` (first time in repo): cron declaration. Single entry: `/api/cron/marketing-emails` at hourly schedule. (Verify Pro tier; Hobby caps at daily.)
- Create: `src/app/api/cron/marketing-emails/route.ts` — POST handler. Validates `Authorization: Bearer ${CRON_SECRET}` (R10). Returns 401 on mismatch, no DB read. On success, processes due rows (`scheduledFor <= now() AND sentAt IS NULL`), checks suppression, sends via Resend, marks `sentAt`.
- Create: `src/lib/marketing/unsubscribe-token.ts` — `signUnsubscribeToken(email): string` and `verifyUnsubscribeToken(token): { email } | null`. HMAC-SHA256 over `(email, schedulingDate)` with SESSION_SECRET. Time-limited (90 days).
- Create: `src/app/api/marketing/unsubscribe/route.ts` — POST with token in body (RFC 8058 one-click compliant). Verifies token, writes EmailSuppression row.
- Create: `src/app/marketing/unsubscribe/page.tsx` — UX confirmation page after unsubscribe.
- Modify: signup-completion paths (U6's verify endpoint; U3's existing magic-link flow if it doesn't auto-schedule) — write 2 MarketingEmailSchedule rows, idempotent via the unique constraint.
- Modify: `src/lib/auth/email.ts` (or sibling `src/lib/marketing/email.ts`) — add `sendMarketingEmail({ to, segmentKey, market })`. Adds `List-Unsubscribe` and `List-Unsubscribe-Post` headers per RFC 8058.

**Approach.** The day-7 / day-14 emails are templated server-side per market. Each email's body includes a CTA back to `/upload/results/[previewId]` (still cookie-bound — they need to click the magic-link in their email to re-authenticate, then the CTA works) and the Stripe checkout. The suppression check happens at send time, not at schedule time, so a visitor who unsubscribes after scheduling but before send is honoured.

The cron runs hourly. Day-7 emails fire as soon as `scheduledFor <= now()`, so the actual send delay can be 0–60 minutes. Acceptable for marketing.

**Patterns to follow.** [src/lib/auth/email.ts](src/lib/auth/email.ts) (Resend HTTP client pattern); RFC 8058 §3 (one-click unsubscribe); `MagicLinkRateLimit` precedent for transaction-safe writes.

**Test scenarios.**
- Happy path: Signup completes → 2 MarketingEmailSchedule rows written for `(userId, day-7)` and `(userId, day-14)`. Idempotent: second signup attempt does not write duplicates (unique constraint).
- Happy path: Cron fires at day-7 → email sent, `sentAt` populated, no second send within 24h.
- Edge case: User unsubscribes before day-7 → cron skips that row, `sentAt` populated to `now()`, no email actually sent (or `sentAt` left null and a `Diagnostic` counter records `marketing-suppressed`).
- Edge case: Cron POST without valid `Authorization: Bearer <CRON_SECRET>` → 401, no DB read.
- Edge case: Cron POST with valid header but no due rows → 200, no-op.
- Edge case: Resend send fails (5xx) → row's `sentAt` left null, retry next hour. After 3 failures, mark `bouncedAt`, suppression added.
- Edge case: User signs up after subscribing → no day-7/14 scheduled (different signup path, no MarketingEmailSchedule write).
- Edge case: Unsubscribe POST with expired token → 400.
- Edge case: Unsubscribe POST with token for `email-A` but `email-B` in suppression → only `email-A` added.
- Integration: Inbound email to `unsub@morning.form` (or however List-Unsubscribe-Mailto is configured) — out of scope for this unit; email-list manager handles bounces.

**Verification.** Stage env: schedule row, force `scheduledFor` to past, manually POST cron with valid header → email arrives. Click unsubscribe → suppression row written, future cron skips.

**Dependencies.** U6, U8.

**Execution note.** Test-first for the unsubscribe-token verify. It's the single attack surface for suppression DoS.

---

### Phase 1 success gate

Before Phase 2 begins:

- ≥30 free uploads in 4 weeks (validates that the no-auth flow works).
- ≥10 paid Subscription conversions across both markets (validates that preview → subscription is a real funnel — even at this small N).
- Webhook idempotency proven in production (no duplicate Subscription rows after manual replay test).
- `forbidden-phrases.ts` rejection rate <5% on real preview output (validates the prompt is safe-enough).

If paid conversions are <10 in 4 weeks, do not build U10–U12. Instead, run synthetic-persona tests (predecessor adversarial review's recommendation) to challenge the wedge framing before committing more engineering.

---

### Phase 2 — Scale + retention (weeks 8–12)

#### U10 · Programmatic page generator

**Goal.** A CLI tool (`pnpm marketing:scaffold`) generates a new `content/marketing/{market}/{slug}.ts` from a cohort schema. Eight more pages per market shipped (16 pages total) bringing per-market total to 9 pages each. The generator does not write prose — it scaffolds the typed structure and copies a cohort-specific section template. A human writes the actual content; CI validates.

**Files.**
- Create: `scripts/marketing-scaffold.ts` — CLI: `pnpm marketing:scaffold --cohort=fatigue --slug=ferritin-low-but-haemoglobin-normal --market=uk`. Generates the file from a template, validates against the Zod schema, refuses on duplicate slug.
- Create: `content/marketing/_templates/{cohort}.template.ts` — one template per cohort with section scaffolding (placeholders, not real copy).
- Modify: `package.json` — add the scripts entry.
- Author: 8 pages per market (the remaining initial-priority pages from the prompt). UK + US variants where the cohort applies; UK-only or US-only where regulatory framing differs (e.g., NHS-record uploads → UK only).

**Approach.** The generator is intentionally dumb. It opens the cohort template, substitutes `{slug}`, `{cohortKey}`, `{market}`, and writes the file. The human edits the file to add real copy, run editorial-QA locally, ship.

**Patterns to follow.** Existing scripts in `scripts/` (if any exist).

**Test scenarios.**
- Happy path: `pnpm marketing:scaffold --cohort=testosterone --slug=low-libido --market=us` → file written; passes `marketing-page-schema.ts` Zod validation; passes `static-copy.test.ts` (because template is allowlisted).
- Edge case: Duplicate slug → exit 1 with helpful error.
- Edge case: Invalid cohort key → exit 1 with valid keys listed.
- Integration: Scaffolded file imports from `lib/marketing/cohorts.ts` via a registered `CohortKey` type.

**Verification.** Generate 8 new pages, fill in copy, ship.

**Dependencies.** U2.

**Execution note.** None.

---

#### U11 · Wearable-data bridge for retention

**Goal.** Subscribed users can connect Whoop, Oura, or Apple Health to provide ongoing trend data without requiring a new £200 blood panel. This is the month-2 retention answer. **In scope: Whoop + Apple Health, OAuth + read-only.** Out of scope: real-time push, write-back, Garmin, Fitbit.

**Files.**
- Modify: `prisma/schema.prisma` — add `WearableConnection` model (`userId`, `provider`, `accessToken` (encrypted), `refreshToken`, `connectedAt`, `lastSyncAt`).
- Create: `src/lib/wearables/whoop.ts` — OAuth flow + read endpoints (HRV, RHR, sleep, recovery score).
- Create: `src/lib/wearables/apple-health.ts` — read from HealthKit export PDF/XML (the Apple Health pattern; iOS Files app export).
- Create: `src/app/(app)/account/wearables/page.tsx` — connect/disconnect UI.
- Create: `src/app/api/wearables/whoop/callback/route.ts` — OAuth callback.
- Create: `src/app/api/wearables/sync/route.ts` — manual + scheduled sync trigger.
- Modify: existing graph extraction pipeline — accept wearable signals as a SourceDocument variant.

**Approach.** Wearable data flows into the existing graph extraction pipeline as a third SourceDocument type (alongside PDF and manual entry). The trend dashboard (U12) reads from the graph, so as wearable data accumulates, the dashboard has fresh data each week — closing the month-2 retention gap that the adversarial review flagged.

**Patterns to follow.** [src/app/api/intake/documents/route.ts](src/app/api/intake/documents/route.ts) (existing intake patterns); auth flows for OAuth (no codebase precedent — verify against Whoop API docs at implementation time, fetch via context7 MCP).

**Test scenarios.**
- Happy path: User clicks "Connect Whoop" → OAuth flow → tokens stored encrypted → first sync pulls 30 days of HRV.
- Edge case: Token refresh fails → user sees "reconnect Whoop" prompt; sync errors logged, not silent.
- Edge case: User has no recent Whoop data (gap >7 days) → dashboard shows "no recent data — wear your Whoop?" prompt instead of empty chart.
- Integration: Wearable data appears in the graph extraction pipeline; trend dashboard renders combined (blood-panel + wearable) view.

**Verification.** Real Whoop account in dev — confirm OAuth + sync end-to-end.

**Dependencies.** U6, U8.

**Execution note.** None. This is a substantial unit (likely 2× scope on first pass) — give it the full Phase 2 window.

---

#### U12 · Trend dashboard (Membership product surface)

**Goal.** Subscribed user has a single dashboard at `/account/trends` showing biomarkers + wearable signals over time. Charts render from the existing graph extraction pipeline; wearable data joins via U11. Dashboard is the visible Membership benefit and the primary anti-churn surface.

**Files.**
- Create: `src/app/(app)/account/trends/page.tsx`
- Create: `src/components/trends/marker-chart.tsx` (line + range visualisation per marker)
- Create: `src/components/trends/composite-view.tsx` (HRV + ferritin + ApoB on one timeline)
- Modify: `src/lib/graph/queries.ts` (or sibling) — add `getTrendsForUser(userId, dateRange)` query that joins blood panel + wearable + manual entries.

**Approach.** Read-only product surface. No new mutation paths. Charts are SVG (the codebase already has graph-rendering precedent in `src/components/graph-canvas/*`). Dashboard gates on `getMembershipState(userId).kind === 'active' || === 'past_due'` (active or in grace).

**Test scenarios.**
- Happy path: User with 1 blood panel + 30 days Whoop → chart renders both.
- Edge case: User with 1 blood panel only → chart shows panel markers, "connect a wearable" prompt for trend continuity.
- Edge case: Cancelled subscription past grace → 402, redirect to billing.
- Integration: HRV from Whoop appears on same timeline as ferritin from blood panel.

**Verification.** Dogfood with real Whoop data.

**Dependencies.** U8, U11.

**Execution note.** None.

---

## Risk Table

| Risk | Likelihood | Impact | Mitigation | Plan-level owner |
|---|---|---|---|---|
| **Cold-organic SEO produces <100 visits/page in 12 weeks** | High | High (Phase 0 gate fails) | Phase 0 designed to detect this in 21 days, not 12 weeks. If it happens, do not build Phase 1 — channel-3 is a longer bet than the milestone window. | Founder + Phase 0 gate |
| **Multi-market scope expands engineering 30%+** | Medium | Medium | The market dimension is structural (URL segment + cookie + currency formatter); 80% of the cost lands in U1 + U2. Subsequent units are mostly market-aware via that infra. Budget held in U1 design. | U1, U2 |
| **`User.email` nullable migration is non-trivial** (read-site audit) | High | Medium (delay) | Audit grep before migrating. Estimate: 15–25 read sites; each is a `??` null-coalesce or guard. Characterization-first. | U6 |
| **Path A regulatory exposure on preview tier (LLM SaMD-adjacent)** | Medium | High (FDA / FTC HBNR / MHRA) | Phase 0 ships zero LLM interpretation to anonymous visitors. Phase 1 introduces it AFTER FDA/MHRA legal review (added as a Phase 1 prerequisite). The `forbidden-phrases.ts` gate is necessary but not sufficient under FDA SaMD framework. | Pre-Phase-1 legal review |
| **Stripe metadata schema diverges between checkout and webhook** | Medium | High (silent revenue loss) | Schema defined upfront in U8 (`{ userId, market }`); Diagnostic counter on mismatch; ops alert on every increment. Tested before Stripe goes to live mode. | U8 |
| **Wearable integration substantially more work than scoped** | High | Medium (Phase 2 delay) | Whoop + Apple Health only; defer Garmin/Fitbit. Scope U11 generously (it can take the full Phase 2 window if needed; U12 has a stub mode without wearable data). | U11 scope |
| **Editorial-QA Vitest gate produces false positives that block PRs** | Medium | Low | Per-page `qaAllowlist?: string[]` field with required justification comment. PR-time greppable. Not gold-plating; operationally cheap. | U2, U6 |
| **Provisional-user upgrade race conditions** | Low | High (data leak) | R13 (cookie-binding) + R14 (atomic FK transfer in tx) are non-negotiable plan requirements. Test-first. | U6 |
| **Cron CRON_SECRET not validated in U9** | Low | High (bulk email DoS / abuse) | R10 explicit; first test scenario is "missing header → 401 no DB read". | U9 |
| **Subscription retention <30% at month 3 without wearable data** | Medium | Medium (LTV miss) | U11 wearable bridge is plan-level mitigation. If U11 slips beyond Phase 2, pivot subscription pricing to one-time pay-per-insight (£39 / $39) — U8's `Subscription` is loose enough to extend with `Order` model. | U11 + U8 design |

## Operational Notes

- **Env vars added (must exist in Vercel before each phase):**
  - Phase 0: none new (uses existing SESSION_SECRET, RESEND_API_KEY).
  - Phase 1: `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_LIVE`, `STRIPE_PRICE_GBP_19`, `STRIPE_PRICE_USD_29`, `CRON_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`.
  - Phase 2: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`.
- **Vercel Cron tier:** Phase 1 requires Pro (Hobby caps cron at 1/day). Verify tier before U9 begins.
- **Schema deploy mechanism:** Vercel build runs `prisma db push --accept-data-loss`. There is no migrations directory (verified). Each schema diff in this plan is verified locally to be additive (no column drops) before merge. The `User.email String → String?` change in U6 is the most-watched diff: confirm `db push` does not decide to drop+recreate the column. If it does, run a manual `ALTER TABLE` first.
- **Pre-Phase-1 legal review (R: Path A regulatory):** before U6/U7 go to production, get FDA SaMD + FTC HBNR + MHRA opinions in writing on the personalised LLM preview surface. Path A's "tech-first, no clinician" framing is more exposed under SaMD's HCP-mediation criterion (21 U.S.C. §360j(o)) than the predecessor brainstorm acknowledged. The forbidden-phrases gate is a mitigation, not the regulatory posture itself.
- **Diagnostic counter naming convention (R12):** `<surface>-<failure-type>` with kebab-case. Examples: `provisional-claim-cookie-mismatch`, `stripe-webhook-unmatched`, `preview-fallback-no-markers`, `marketing-suppressed`, `upload-magic-byte-rejected`, `upload-rate-limit-1h`. All written to a single `DiagnosticEvent` table (R12 single-pipeline rule).

## Deferred to Implementation

- Exact Whoop API endpoint shapes (verify via `context7` MCP at U11 implementation time — Whoop's API has changed materially in the last 18 months).
- Apple Health export format (HKZIP vs HealthKit XML vs the user-exportable PDF) — pick the one that produces tractable parsed data.
- Stripe SDK version pin — pin to latest stable at implementation time.
- The geo-redirect banner UX (U1) — A/B test design vs immediate redirect; product call.
- The cohort-template prose (U10) — written by the founder/clinical reviewer, not the implementer.
- Diagnostic counter aggregation cadence — "near-real-time" via the activation-funnel CLI is acceptable; if dashboard demand emerges, U12 can extend.
- Email template HTML (U9) — designed by founder; implementer wires up the Resend send.

## Scope Boundaries (NOT in this plan)

- **Channels 1 + 2 (concierge / founder network).** This plan owns channel 3 (digital) only. The 30-member milestone is owned by channels 1 + 2 unless this plan over-delivers on traffic.
- **Pay-per-insight pricing (£39 / $39 one-time).** Explicitly rejected by user choice. U8 keeps the model loose enough to add later if subscription LTV underperforms.
- **DOB collection at signup.** The predecessor plan included DOB; this plan drops it. Reduces signup friction; the User model has no `dob` column today (predecessor's F10) and adding one is non-trivial. Surface DOB collection inside the authed product if it becomes load-bearing.
- **Slack-channel marketing pings.** Out of scope; founder owns marketing-team comms manually.
- **A/B testing infrastructure (PostHog, GrowthBook).** Out of scope; cohort signal at this volume is not statistically meaningful and feature-flag tooling is engineering theatre at <100 users.
- **Programmatic AI-content generation (LLM-written page bodies).** Explicitly out — every page is human-authored under editorial review. The "generator" in U10 is a scaffolder, not a content tool.
- **Real-time wearable push integration.** U11 ships read-only OAuth + manual sync only.
- **GP-prep document generation.** Subscription value-add for a future plan, after retention data is in.
- **Localisation beyond EN-GB / EN-US.** Single language, two markets only.

## Origin Document Cross-Reference

This plan inherits from two origin documents:

1. The **2026-05-09 prompt** (the user-supplied "world-class SEO/GEO strategist" brief). Source for: cohort taxonomy, page concepts, GEO requirements, clinical-safety framework, 8 cohorts × 10 pages structure, `MarketingPage` schema shape.
2. **`docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md`**. Source for: regulatory posture (Path A), `forbidden-phrases.ts` gate, R11 source-of-truth principle, R12 silent-fallback principle, LandingPageVisit + funnel-stage pattern, decision frame around tech-first.

This plan **explicitly diverges** from the prompt on: pay-per-insight pricing (rejected for subscription-only per user choice), the `5 fully written example pages` deliverable (only 1 per market in Phase 0; the rest via U10 scaffolder + human authoring), and the prompt's "GP/specialist" referral framing (rendered as standardised page module, not personalised guidance).

## Phased Delivery Summary

| Phase | Weeks | Units | Scope | Success gate (must pass to proceed) |
|---|---|---|---|---|
| **Phase 0 — Validation MVP** | 1–3 | U1, U2, U3, U4, U5 | Multi-market URL infra, page-data schema, 1 anchor page per market, GEO infra, funnel measurement, auth-gated upload | ≥100 visits + ≥5 signups per market in 21 days |
| **Phase 1 — Programmatic + monetization** | 4–7 | U6, U7, U8, U9 | Public no-auth upload, preview Form Intelligence, Stripe Subscription (multi-currency), lifecycle emails | ≥30 free uploads + ≥10 paid Subscriptions in 4 weeks; FDA/MHRA legal review complete before go-live |
| **Phase 2 — Scale + retention** | 8–12 | U10, U11, U12 | Programmatic page generator (8 more pages × 2 markets), wearable bridge, trend dashboard | Membership month-2 retention ≥40% |

Total: 12 implementation units across 12 weeks, with two real success gates that allow honest abandonment if validation fails.
