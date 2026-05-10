---
title: "feat: Programmatic SEO/GEO landing system + multi-market subscription funnel"
type: feat
status: active
date: 2026-05-09
revised: 2026-05-09
revision: 2
origin: docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md
supersedes: docs/plans/2026-05-06-001-feat-acquisition-anchor-pages-plan.md
markets: [uk, us]
monetization: subscription-only
---

# feat: Programmatic SEO/GEO landing system + multi-market subscription funnel

## Overview

Build a programmatic SEO/GEO landing system that funnels high-intent men 25–50 from organic search and AI answer engines into MorningForm's interpretation engine. The system targets eight cohort clusters (fatigue, testosterone/libido, longevity 40+, recovery/HRV, metabolic, cardiovascular, fertility, executive) across two markets (UK, US) under a single subscription product (£19/mo UK, $29/mo US).

**Origin documents:**
- The user-supplied 2026-05-09 prompt (a "world-class SEO/GEO strategist" brief specifying eight male cohorts, ten initial page concepts, GEO requirements for AI-engine surfacing, pay-per-insight mention rejected in favour of subscription-only).
- Conceptual carryover from `docs/brainstorms/2026-05-06-acquisition-anchor-pages-requirements.md`: regulatory posture (Path A — tech-first, no public clinician), the `forbidden-phrases.ts` runtime gate, the LandingPageVisit + funnel-stage instrumentation pattern, the source-of-truth and silent-fallback principles. **Note: this plan's R1–R15 are net-new requirement IDs. The brainstorm's R1–R7 are different in scope (success metrics, not architecture). Do not search the brainstorm for "R1" expecting a match.**

Two strategic concessions baked in from the adversarial review of the predecessor plan:

1. **The 30-member milestone is not promised by this work.** Cold-organic SEO from a brand-new domain takes 6–18 months to produce meaningful traffic. Phase 0 success gate is "≥100 unique visitors AND ≥5 email signups per market in 21 days", not "≥X paying members". Channels 1–2 (concierge / founder network) own the 12-week milestone.
2. **The retention question is answered, not assumed.** Month 2 of subscription cannot rely on a second blood panel. Phase 2 ships a wearable bridge (Whoop / Oura / Apple Health) so the trend dashboard has fresh data each month without a £200 retest. **Critical update:** the wearable infrastructure already exists in this codebase at [src/lib/health/whoop.ts](src/lib/health/whoop.ts), [src/lib/health/crypto.ts](src/lib/health/crypto.ts), [src/app/api/health/connect/route.ts](src/app/api/health/connect/route.ts), and the `HealthConnection` Prisma model at [prisma/schema.prisma:343-360](prisma/schema.prisma#L343-L360). Phase 2's wearable work is graph-extraction integration + subscriber UI surfacing, not a parallel build.

Three phases:

- **Phase 0 — Validation MVP (weeks 1–3, U1–U4):** ship multi-market URL infra, page-data schema with embedded JSON-LD, GEO infrastructure (sitemap / robots / hreflang), and one anchor page per market with auth-gated email capture. **No Stripe, no public no-auth upload, no preview tier, no lifecycle emails.** Just enough to validate that organic search will deliver visitors who upload and convert to email.
- **Phase 1 — Programmatic + monetization (weeks 4–7, U5–U9), gated on Phase 0 hitting ≥100 visitors + ≥5 signups per market:** public no-auth upload + provisional-user pattern, preview Form Intelligence tier (split into compile pipeline + cookie-bound results endpoint), multi-currency Stripe Subscription, lifecycle email sequence with signed unsubscribe.
- **Phase 2 — Scale + retention (weeks 8–12, U10–U11), gated on Phase 1 paid conversion:** wearable-data bridge for month-2 retention (small unit thanks to existing infrastructure), trend dashboard.

The rest of this document is a planning artifact, not implementation. Code is sketched only where directional guidance helps a reviewer.

## Decision Frame

| Decision | Stance |
|---|---|
| **Markets** | UK + US, market-aware from day one. URL prefix `/uk/...` and `/us/...`. Default by Vercel Edge geo (`x-vercel-ip-country`); user can override via banner. Separate sitemaps, separate canonical URLs, hreflang annotations both ways. |
| **Monetization** | Subscription only. Single price tier per market: £19/mo UK, $29/mo US. **The market on a Subscription is locked to `User.signupMarket` at checkout time, not the cookie or current page context** (security finding — see R9). |
| **Regulatory posture** | Path A — tech-first, no public clinician. Phase 0 ships zero LLM interpretation to anonymous visitors; only auth-gated intake. The personalised LLM output (preview tier in Phase 1) is the genuine SaMD-adjacent surface and warrants separate FDA/MHRA legal review **before U6/U7 ship to production**. |
| **Content authoring** | TypeScript page-data files (`content/marketing/{market}/{slug}.ts`) — not MDX. Keeps the `static-copy.test.ts` editorial-QA pattern viable, gives type safety, and the data shape is the contract for Phase 2's programmatic generator. |
| **Programmatic generation** | The "generator" is a CLI scaffolder (cohort schema → page-data file template), absorbed into U2's deliverables — not its own unit. It does not write prose; it scaffolds the typed structure. New page authoring is a rolling content workstream, not an engineering gate. |
| **Existing root page** | [src/app/page.tsx](src/app/page.tsx) is the current landing page. U1's geo-redirect at `/` will replace it. The current homepage is repurposed as `/uk/` (which it already addresses by tone — NHS, GP, £). The US variant is an explicit fork in U2's content authoring. |

## Requirements

Numbered for traceability. **R1–R15 are this plan's own requirement IDs. They are not aligned with the brainstorm's R1–R7 (which are success-metric requirements, not architecture).**

| # | Requirement | Source |
|---|---|---|
| **R1** | The system serves market-aware landing pages at `/{market}/{slug}` for `market ∈ {uk, us}`. Default market is inferred from `x-vercel-ip-country`; visitor can override via in-page banner. Override persists in `mf_market` cookie. | Prompt + research |
| **R2** | Each page renders from a typed `MarketingPage` data record. The TSX template is single, the data is many. The CLI scaffolder generates new records; it does not generate prose. | Prompt + research |
| **R3** | Each page emits valid `MedicalWebPage` and `FAQPage` JSON-LD. Pages include hreflang annotations to the same slug in the other market when an equivalent exists. **All JSON-LD `<script>` blocks escape `</` to `</` to prevent injection.** | Prompt (GEO) + security finding |
| **R4** | A `/{market}/sitemap.xml` and a top-level `/sitemap_index.xml` are generated at build/runtime via Next's `MetadataRoute.Sitemap` API. `/robots.txt` allows the marketing tree, disallows `/api/*`, `/account/*`, `/r/*`. | Prompt (GEO) |
| **R5** | The conversion CTA from any page in Phase 0 is "Upload your last blood panel — see what your numbers actually mean → [email]" routed through the existing magic-link flow at `src/app/api/auth/request-link/route.ts`. Phase 1 replaces this with a public no-auth upload route that produces an immediate preview, then asks for email. | Prompt + carryover |
| **R6** | Editorial copy is gated by an extension of [src/lib/compliance/static-copy.test.ts](src/lib/compliance/static-copy.test.ts) that scans `content/marketing/**/*.ts` for forbidden language: Rx drug names (drawn from [src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts)), imperative-treatment verbs ("take", "start", "begin taking"), specific dose strings, certainty claims about disease state. CI fails if any page-data file violates. | Prompt (clinical safety) |
| **R7** | A `LandingPageVisit` row is written for each first-paint of a marketing page; carries `slug`, `cohortKey`, `market`, `referrer`, `ipHash` (HMAC via session secret, reusing existing helper), `mfAnonymousId`, `userAgentClass`. **The dedupe-within-1-minute is enforced by `@@unique([mfAnonymousId, slug, minuteBucket])` on the model — not by app-layer race-prone checks.** Two new funnel stages added to [src/lib/metrics/activation-funnel.ts](src/lib/metrics/activation-funnel.ts): `anchor-page-visit`, `anchor-page-to-signup`. | Carryover + feasibility finding |
| **R8** | Phase 1 ships a `tier=preview` Form Intelligence output: ≤4 paragraphs, ≤200 tokens each, generated server-side from an uploaded PDF, returned in the upload-results response and stored on a typed `PreviewSummary` model. Preview output carries `Cache-Control: no-store, private` **on both the API endpoint AND the RSC page surface** (the page sets `export const dynamic = 'force-dynamic'` and emits the header explicitly). | Carryover + security finding |
| **R9** | Phase 1 monetization is a Stripe Subscription per market (£19/mo via GBP price, $29/mo via USD price). **Market is locked to `User.signupMarket` at checkout creation; cookie/URL context is ignored.** **A pre-checkout guard rejects creation when an active or grace-period Subscription already exists for `userId`.** Webhook metadata schema is `{ userId, market }` set on **both** `Checkout.Session.create({ metadata, subscription_data: { metadata } })` so subsequent `customer.subscription.*` events also carry it. **Resolver fallback:** if an event arrives with no metadata, the webhook handler resolves `userId` via `Subscription.findUnique({ where: { stripeSubscriptionId } })` before incrementing `stripe-webhook-unmatched`. | Security + feasibility findings |
| **R10** | Phase 1 ships a day-7 + day-14 lifecycle email scheduled at signup time. Unsubscribe links carry a HMAC-signed token over `(email, scheduledFor)` **in the URL query string** (per RFC 8058 §3.2, the POST body carries only the literal `List-Unsubscribe=One-Click`, not the token). The cron at `/api/cron/marketing-emails` validates `Authorization: Bearer ${CRON_SECRET}` before iterating the queue. | Security finding (RFC 8058 body-less POST) |
| **R11** | All pricing strings, tier identifiers, and slug constants live in `src/lib/marketing/constants.ts` (single file). Page templates and Stripe code import from this module. No ESLint rule. **Rate-limit `subjectKind` constants are also exported from this module so callers cannot drift via literal strings.** | Scope-guardian (predecessor) + feasibility finding |
| **R12** | Silent-fallback paths emit a single row to the `DiagnosticEvent` table per emit. **The DiagnosticEvent model is fully specified in U2 (not implicit)** with daily-counter rotation: `model DiagnosticEvent { id, key, day Date, count Int, lastSeenAt }` keyed `@@unique([key, day])`, so each emit is `INSERT … ON CONFLICT (key, day) DO UPDATE SET count = count + 1, lastSeenAt = NOW()`. This caps row growth at `O(N_keys * N_days)`, removes the unbounded write-amplifier vector, and lets the activation-funnel CLI surface counters via `SELECT key, SUM(count) FROM diagnostic_event WHERE day >= :from GROUP BY key`. | Scope-guardian + security finding |
| **R13** | The provisional-user upgrade path enforces **strict AND** binding across two channels: at verify time, **both** (a) the inbound `mf_anon` cookie value MUST equal `User.anonymousSessionToken` AND (b) the inbound `mf_anon` cookie value MUST equal `MagicLinkToken.anonymousId` (a new nullable column added to [prisma/schema.prisma:49](prisma/schema.prisma#L49) MagicLinkToken). Either mismatch rejects the upgrade with diagnostic counter `provisional-claim-cookie-mismatch`. (The token format itself remains opaque random bytes; the binding lives in the DB row, not in the token payload.) | Security finding (OR → AND) |
| **R14** | The provisional-user FK ownership transfer at signup is one explicit transaction with **all five** statements (sequence diagram and U5/U6 specs match): `UPDATE source_document`, `UPDATE preview_summary`, `UPDATE landing_page_visit`, `UPDATE "user"`, and the `DELETE … WHERE email IS NULL` safety net. If `User.email` already exists on a different real user, the upgrade is rejected pre-transaction; visitor sees "sign in to claim this upload" with a separate FK-transfer path. | Adversarial security review |
| **R15** | `User.email` becomes nullable. Schema migration is by `prisma db push --accept-data-loss` (the repo's only deploy mechanism), verified locally to be additive (no column drop). Audit of read sites confirms only ~5 production callers; each handles `null` safely. | Feasibility review of predecessor |

## Key Technical Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Multi-market URL via `[market]` route segment.** | Cleanest seam for App Router. Each market gets a distinct canonical URL. Sitemap is straightforward. hreflang lives on layout metadata. |
| **D2** | **Default market via Vercel Edge geo, user-overridable via cookie + banner.** Vercel Edge strips client-supplied `x-vercel-ip-country` headers in production; this is documented. Preview deployments may differ — preview-only smoke-test is part of U1's verification. | `x-vercel-ip-country` is free and trustworthy in production. |
| **D3** | **Page data in TypeScript, not MDX or CMS.** | Type safety enforces invariants at build. The editorial-QA test scans `.ts` files trivially. CMS migration is non-breaking later. |
| **D4** | **`PreviewSummary` is a new Prisma model, not a `tier` column on `ScribeAudit`.** | `ScribeAudit.scribeId` is a required FK with cascade delete; preview path has no Scribe row to attach to. New model decouples cleanly. |
| **D5** | **Provisional-user pattern: `User.email` becomes nullable; `User.anonymousSessionToken` added; FK ownership transfers explicitly at upgrade.** Audit of `user.email` reads confirms ~5 production sites (verified via grep). | Closes the predecessor's P0 schema contradiction. Postgres allows multiple NULLs in a `@unique` index by default. |
| **D6** | **Editorial-QA via extension of [src/lib/compliance/static-copy.test.ts](src/lib/compliance/static-copy.test.ts).** | Pattern exists. Scans `.ts` source. No RSC-rendering complexity. |
| **D7** | **Stripe via the official `stripe` npm SDK with metadata propagated through both `metadata` and `subscription_data.metadata`.** | Webhook signature verification is the SDK's primary value. Metadata on subscription_data ensures `customer.subscription.*` events also carry `userId`/`market`. |
| **D8** | **Reuse `MagicLinkRateLimit` for upload + signup + visit-beacon rate limits by extending its `subjectKind` enum.** New subject kinds: `upload-ip-1h`, `upload-ip-24h`, `signup-ip-1h`, **`visit-beacon-ip-1h`** (closes the visit-beacon DoS amplifier). Constants exported from `src/lib/marketing/constants.ts`. | Same `(subjectKind, subject, window)` keying as today. No parallel primitive. |
| **D9** | **Reuse the IP-hash helper from [src/app/api/auth/request-link/route.ts:113-119](src/app/api/auth/request-link/route.ts#L113-L119). Factor it out to `src/lib/auth/ip-hash.ts`.** | Same SESSION_SECRET → same hash → same row across all surfaces. |
| **D10** | **Membership state is a typed result: `{ kind: 'free' } \| { kind: 'active', renewsAt } \| { kind: 'past_due', graceUntil } \| { kind: 'cancelled', endedAt } \| { kind: 'error', reason }`.** | Anti-Dexcom discipline: no `string \| undefined`, no defaults, fail-loud. |
| **D11** | **Reuse existing health-data infrastructure for U10 (wearable bridge):** `HealthConnection` model, `encryptToken`/`decryptToken` helpers, `WhoopClient`, `OuraClient`, OAuth callback at `src/app/api/health/callback/[provider]/route.ts`. **Do not introduce a parallel `WearableConnection` model.** | The infra is built; reinventing is the predecessor failure mode. |
| **D12** | **Resend email transport: known gap.** [src/lib/auth/email.ts:16](src/lib/auth/email.ts#L16) currently uses the global URL `https://api.resend.com/emails`. UK-GDPR / Caldicott data-residency for health-context emails wants the EU endpoint `https://api.eu.resend.com/emails`. This plan fixes that in U8 (lifecycle emails), and as a side effect the magic-link flow also moves to EU — implementer must verify Resend dashboard has EU region enabled and re-issue the API key as an EU-scoped key before flipping. | Security finding (Resend EU claim was wrong) |

## Output Structure

```
src/
  app/
    [market]/
      layout.tsx                       # market-aware: hreflang, JSON-LD wrapper, currency context
      page.tsx                         # market homepage (UK or US)
      [slug]/
        page.tsx                       # generic marketing page template, reads from content/
        layout.tsx                     # JSON-LD MedicalWebPage + FAQPage emitter
    sitemap.ts                         # generates per-market sitemaps + index
    robots.ts
    upload/
      page.tsx                         # Phase 1: public no-auth upload UI
      results/
        page.tsx                       # Phase 1: dynamic = 'force-dynamic', Cache-Control: no-store
    api/
      upload/
        route.ts                       # POST PDF, returns { previewId, anonymousSessionToken }
        results/
          [previewId]/route.ts         # GET preview output, two-path access control
      billing/
        checkout/route.ts              # creates Stripe Checkout Session w/ metadata + subscription_data.metadata
        webhooks/
          stripe/route.ts              # signature-verified, idempotent on stripeSubscriptionId,
                                       # resolver fallback via stored ID
      cron/
        marketing-emails/route.ts      # Vercel Cron, validates Bearer CRON_SECRET
      marketing/
        visit/route.ts                 # writes LandingPageVisit, validates slug/market/cohort allowlist,
                                       # rate-limited via MagicLinkRateLimit subjectKind=visit-beacon-ip-1h
        unsubscribe/route.ts           # POST per RFC 8058: token in URL query, body=List-Unsubscribe=One-Click
  components/
    marketing/
      page-template.tsx                # the one TSX that renders all marketing pages
      hero-block.tsx, cta-block.tsx, faq-block.tsx, escalation-module.tsx
      market-banner.tsx                # geo-mismatch override
      visit-beacon.tsx                 # client-side LandingPageVisit emitter
    structured-data/
      medical-webpage.tsx              # JSON-LD emitter, escapes </ to </
      faq-page.tsx                     # JSON-LD emitter, escapes </
  lib/
    marketing/
      constants.ts                     # pricing, slugs, cohort keys, rate-limit subject kinds (single file, R11)
      market.ts                        # getMarketFromRequest, useMarket hook, market types
      currency.ts                      # formatPrice(market, amount)
      cohorts.ts                       # cohort taxonomy (8 keys; allowlist)
      page-schema.ts                   # MarketingPage Zod schema + types
      slug-allowlist.ts                # built at build time from content/marketing/ filesystem
      diagnostic.ts                    # incrementDiagnostic(key) helper (R12 single primitive)
    auth/
      ip-hash.ts                       # factored out from request-link/route.ts
      email.ts                         # MODIFIED: switch RESEND_URL to api.eu.resend.com (D12)
    billing/
      stripe.ts                        # SDK initialiser, single instance
      membership-state.ts              # typed conversion table (D10)
      checkout.ts                      # session creation, locks market = User.signupMarket
    upload/
      preview-compile.ts               # entry point that produces a PreviewSummary (D4)
      blob-storage.ts                  # thin wrapper if intake/storage.ts isn't reusable as-is
    compliance/
      static-copy.test.ts              # extended to scan content/marketing/**/*.ts (R6)
scripts/
  marketing-scaffold.ts                # CLI: scaffolds new content/marketing/{market}/{slug}.ts (absorbed into U2)
content/
  marketing/
    _templates/                        # cohort templates consumed by scaffolder
    uk/
      fatigue-in-men.ts
    us/
      fatigue-in-men.ts
prisma/
  schema.prisma                        # diff:
                                       #   User: email -> String?, +anonymousSessionToken, +signupMarket, +signupCohort, +signupSlug
                                       #   MagicLinkToken: +anonymousId String? (R13 second binding channel)
                                       #   MagicLinkRateLimit: subjectKind values extended via constants only (no schema change)
                                       #   +LandingPageVisit (with @@unique([mfAnonymousId, slug, minuteBucket]))
                                       #   +PreviewSummary
                                       #   +Subscription
                                       #   +MarketingEmailSchedule, +EmailSuppression
                                       #   +DiagnosticEvent (model fully specified, R12)
                                       #   HealthConnection: REUSED, no schema change (D11)
vercel.json                            # crons array only (no buildCommand — vercel-build script remains source of truth)
```

## Visitor → Subscription Sequence (Phase 1) — Complete

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
    V->>DB: LandingPageVisit { slug, cohort, market, ipHash, mfAnonymousId, minuteBucket } via /api/marketing/visit (rate-limited, slug-allowlisted)
    V->>U: POST PDF + Turnstile token + mf_anon
    U->>DB: rate-limit check (MagicLinkRateLimit subjectKind='upload-ip-1h')
    U->>DB: provisional User { email: null, anonymousSessionToken: mf_anon }
    U->>DB: SourceDocument FK to provisional userId
    U->>W: compile preview (≤4 paragraphs)
    W->>DB: PreviewSummary { userId, sourceDocumentId, output }
    U-->>V: { previewId, anonymousSessionToken } + Cache-Control: no-store
    V->>P: GET /upload/results
    P-->>V: preview HTML + email-signup form (CTA: subscribe £19/mo) + Cache-Control: no-store, private
    V->>API: POST { email, anonymousId: mf_anon, signupContext: { market, cohort, slug } }
    API->>DB: write MagicLinkToken { userId, tokenHash, anonymousId: mf_anon }  // R13 second channel
    API-->>V: 200 (link sent to email)
    V->>V2: GET magic-link
    V2->>DB: verify cookie mf_anon == User.anonymousSessionToken AND cookie mf_anon == MagicLinkToken.anonymousId  (R13 strict AND)
    V2->>DB: BEGIN tx (R14 — all 5 statements):
    V2->>DB:   UPDATE source_document SET user_id=:realId WHERE user_id=:provisionalId
    V2->>DB:   UPDATE preview_summary SET user_id=:realId WHERE user_id=:provisionalId
    V2->>DB:   UPDATE landing_page_visit SET email=:email WHERE mf_anonymous_id=:anonymousId
    V2->>DB:   UPDATE "user" SET email=:email, signupMarket=:market, signupCohort=:cohort, signupSlug=:slug, anonymous_session_token=NULL, name=:name WHERE id=:realId
    V2->>DB:   DELETE FROM "user" WHERE id=:provisionalId AND email IS NULL  // safety net
    V2->>DB: COMMIT
    V2-->>V: signed-in session
    V->>CO: POST {} (no market field — market is read from User.signupMarket, not request body)
    CO->>DB: SELECT FROM Subscription WHERE userId=:userId AND status IN ('active','past_due') -- pre-checkout guard
    CO->>DB: User.signupMarket → market='uk'
    CO->>S: createCheckoutSession({ price: GBP_19, metadata: { userId, market: 'uk' }, subscription_data: { metadata: { userId, market: 'uk' } } })
    CO-->>V: 303 → Stripe-hosted checkout
    V->>S: pay
    S->>WH: checkout.session.completed (signed)
    WH->>WH: stripe.webhooks.constructEvent(rawBody, signatureHeader, secret) — fail-closed on mismatch
    WH->>DB: idempotent on stripeSubscriptionId; Subscription { userId, market: 'uk', status: 'active' }
    S->>WH: customer.subscription.updated (later) — metadata still carries userId via subscription_data
    WH->>DB: Subscription update; if metadata missing, fallback resolve via Subscription.findUnique({ stripeSubscriptionId })
    S-->>V: 303 back to /account (signed-in, active)
```

## Implementation Units

### Phase 0 — Validation MVP (weeks 1–3)

#### U1 · Multi-market URL infrastructure

**Goal.** Visitor lands on `/`, gets routed to `/uk` or `/us` by Edge geo, with cookie-overridable preference. The current [src/app/page.tsx](src/app/page.tsx) is rehoused at `/uk` (already UK-toned). `useMarket()` available in any RSC; `formatPrice()` honours market currency. Hreflang and canonical URLs render correctly per market.

**Files.**
- Create: `src/lib/marketing/market.ts` (types: `Market = 'uk' | 'us'`, `getMarketFromRequest(req)`, `useMarket()`, `MarketProvider`)
- Create: `src/lib/marketing/currency.ts`
- Create: `src/lib/marketing/constants.ts` (R11 single file)
- Create: `src/app/[market]/layout.tsx` (root layout for marketing tree)
- Create: `src/app/[market]/page.tsx` (market homepage; `/uk/page.tsx` is the rehoused content from current `src/app/page.tsx`)
- Modify: `src/middleware.ts` — add `/` to matcher; on match: read `mf_market` cookie first, fall back to `x-vercel-ip-country`, redirect 302 to `/uk` or `/us`. **Sub-paths under `/uk/...` and `/us/...` are NOT in the matcher** (no auth gate, no geo logic — they serve unconditionally per their market). Marketing-tree cookie-setting (visit-beacon emission) happens in U3, not here.
- Delete: `src/app/page.tsx` (its content now lives at `/uk/page.tsx`)
- Create: `src/components/marketing/market-banner.tsx`

**Approach.** The middleware change is small and surgical: only `/` is matched for geo logic. Pages under `/uk/[slug]` and `/us/[slug]` are public-by-default per the existing allowlist behaviour. The current homepage is forked: UK version stays as-is (it's already NHS/£/GP-toned); US version is a new file authored separately, not generated. The market-banner component shows on a market-mismatch (e.g., GB visitor on `/us/...`).

**Patterns to follow.** [src/middleware.ts:68-91](src/middleware.ts#L68-L91); [src/app/page.tsx](src/app/page.tsx) (the source content for `/uk/page.tsx`).

**Test scenarios.**
- GET `/` from `x-vercel-ip-country: GB`, no cookie → 302 to `/uk`.
- GET `/` from `x-vercel-ip-country: US`, no cookie → 302 to `/us`.
- GET `/` from any geo, cookie `mf_market=us` → 302 to `/us` (cookie wins).
- GET `/` from `x-vercel-ip-country: FR`, no cookie → 302 to `/us` (default fallback for non-UK/US).
- GET `/uk/fatigue-in-men` → 200, no redirect, no middleware involvement.
- GET `/xx/anything` → 404 (no static params for `xx`).
- Preview deployment smoke: confirm `x-vercel-ip-country` is present (not stripped); document behaviour in case it's missing.
- Integration: `useMarket()` from `/uk/[slug]/page.tsx` returns `'uk'`; `formatPrice('uk', 1900)` returns `"£19"`.

**Verification.** Manual smoke from VPN endpoints in GB and US. Visit `/uk` from US → see market-banner → click → `mf_market=uk` cookie set, banner disappears.

**Dependencies.** None.

**Execution note.** Test-first for the redirect logic. Vitest mock of `NextRequest`.

---

#### U2 · Page-data schema + JSON-LD components + scaffolder + 1 anchor page per market

**Goal.** A typed `MarketingPage` data record. A single TSX template renders any page from data. Two pages shipped: UK and US versions of "Fatigue in men: causes, blood tests, and next steps". JSON-LD for `MedicalWebPage` + `FAQPage` rendered from page-data with safe-string escaping. The CLI scaffolder is shipped as part of this unit (it consumes the same Zod schema). The editorial-QA Vitest gate (R6) extended to scan the content folder.

**Files.**
- Create: `src/lib/marketing/page-schema.ts` (Zod: `MarketingPageSchema` with `slug`, `market`, `cohortKey`, `seoTitle`, `metaDescription`, `h1`, `aboveFold`, `sections[]`, `faq[]`, `escalation`, `cta`, `publishedAt`, `lastReviewedAt`, `reviewerKey`, `qaAllowlist?`)
- Create: `src/lib/marketing/cohorts.ts` (cohort taxonomy + allowlist set)
- Create: `src/lib/marketing/slug-allowlist.ts` (built at build time from content/marketing/ filesystem)
- Create: `src/components/marketing/page-template.tsx`
- Create: `src/components/marketing/{hero-block,cta-block,faq-block,escalation-module}.tsx`
- Create: `src/components/structured-data/medical-webpage.tsx` — JSON-LD emitter; serializes via `JSON.stringify(data).replace(/</g, '\\u003c')` (R3 escape)
- Create: `src/components/structured-data/faq-page.tsx` — same escape pattern
- Create: `src/app/[market]/[slug]/page.tsx` (dynamic route, `generateStaticParams` walks content folder)
- Create: `src/app/[market]/[slug]/layout.tsx` (renders MedicalWebPage + FAQPage JSON-LD from page-data)
- Create: `content/marketing/uk/fatigue-in-men.ts`
- Create: `content/marketing/us/fatigue-in-men.ts`
- Create: `content/marketing/_templates/{cohort}.template.ts` (8 templates, scaffolder consumes)
- Create: `scripts/marketing-scaffold.ts` (CLI: `pnpm marketing:scaffold --cohort=fatigue --slug=ferritin-low --market=uk`)
- Modify: `package.json` — add `marketing:scaffold` script
- Modify: `src/lib/compliance/static-copy.test.ts` — extend file-walk to also scan `content/marketing/**/*.ts`. Page-data file may declare `qaAllowlist?: string[]` for explicit phrase exemptions (each requires a comment).

**Approach.** Pages imported eagerly at build time (Next 14 SSG). `generateStaticParams` walks `content/marketing/{market}/`. The template is intentionally rigid — sections render from a fixed schema (hero, FAQ, escalation, CTA), not freeform components. The slug-allowlist is built at build time and consumed by U3's `/api/marketing/visit` route to validate inbound `slug` values. The scaffolder is a few hundred lines: argv parse → render template → write file → exit 0/1. It runs at dev time; new pages still require a redeploy because `generateStaticParams` is build-time.

**Patterns to follow.** [src/lib/compliance/static-copy.test.ts](src/lib/compliance/static-copy.test.ts); [src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts) (single-source-of-truth phrase list).

**Test scenarios.**
- GET `/uk/fatigue-in-men` → 200, H1 matches, JSON-LD validates against schema.org/MedicalWebPage.
- GET `/us/fatigue-in-men` → 200, USD currency, US-sourced clinical references.
- Edit page-data to insert `body: "start taking creatine"` → editorial-QA fails CI (imperative-treatment regex).
- Edit page-data to insert `</script>` in any string → JSON-LD output contains `</script` (escaped); HTML doesn't break.
- Edit page-data to reference "Adderall" → editorial-QA fails (Rx drug name).
- Scaffolder: `pnpm marketing:scaffold --cohort=testosterone --slug=low-libido --market=us` → file written; passes Zod validation; passes editorial-QA on the template stub.
- Scaffolder: duplicate slug → exit 1 with helpful error.
- Scaffolder: invalid cohort → exit 1, valid keys listed.
- Integration: hreflang on `/uk/fatigue-in-men` includes `<link rel="alternate" hreflang="en-GB" href="...">` AND `<link rel="alternate" hreflang="en-US" href="...">`.
- Integration: JSON-LD includes `mainEntityOfPage`, `lastReviewed`, `medicalAudience`, FAQ entries; `reviewedBy` is `Organization` for Path A.
- DiagnosticEvent: emit at startup if any page-data file fails Zod parse → counter `page-data-zod-fail` increments.

**Verification.** Local test pass; `npm run dev` renders both URLs. Lighthouse SEO ≥95. Google Rich Results Test passes both pages.

**Dependencies.** U1.

**Execution note.** Characterization-first for the editorial-QA extension: write a failing test that asserts the new content folder is scanned BEFORE adding pages.

---

#### U3 · Auth-gated CTA + LandingPageVisit + funnel measurement (merged from prior U3 + U5)

**Goal.** Phase 0's CTA from any anchor page → existing magic-link signup with `cohortKey` and `market` captured on the User row → existing intake pipeline. Every marketing page emits a single `LandingPageVisit` row on first paint, deduped within 1 minute by schema constraint (R7). Activation-funnel report has new stages `anchor-page-visit` and `anchor-page-to-signup`.

**Files.**
- Modify: `prisma/schema.prisma`:
  - `User: +signupMarket String?, +signupCohort String?, +signupSlug String?` (nullable, set only at first signup)
  - Add `LandingPageVisit` model:
    ```
    model LandingPageVisit {
      id              String   @id @default(cuid())
      slug            String
      cohortKey       String
      market          String
      referrer        String?
      ipHash          String
      mfAnonymousId   String
      userAgentClass  String   // 'browser' | 'bot' | 'unknown'
      email           String?  @db.VarChar(320)  // backfilled at signup-time (R14)
      minuteBucket    BigInt   // unix-epoch-minute, computed app-side
      createdAt       DateTime @default(now())
      @@unique([mfAnonymousId, slug, minuteBucket])  // R7 dedupe enforced at schema level
      @@index([slug, market, createdAt])
      @@index([email])
    }
    ```
  - Add `DiagnosticEvent` model (R12):
    ```
    model DiagnosticEvent {
      id          String   @id @default(cuid())
      key         String
      day         DateTime @db.Date
      count       Int      @default(1)
      lastSeenAt  DateTime @default(now())
      @@unique([key, day])
      @@index([day])
    }
    ```
- Create: `src/lib/auth/ip-hash.ts` (factored out from request-link/route.ts)
- Modify: [src/app/api/auth/request-link/route.ts](src/app/api/auth/request-link/route.ts) — import from `lib/auth/ip-hash.ts`; accept optional `signupContext: { market, cohort, slug }` in body; persist on User via upsert (only on first creation — never overwrite existing).
- Modify: `src/components/marketing/cta-block.tsx` — POST email + signupContext to `/api/auth/request-link`.
- Create: `src/components/marketing/visit-beacon.tsx` (client component; POSTs once per pageview)
- Create: `src/app/api/marketing/visit/route.ts` — writes LandingPageVisit. **Validates `slug ∈ slug-allowlist`, `market ∈ {uk,us}`, `cohort ∈ cohort-allowlist`**; rejects with 400 otherwise (DiagnosticEvent: `visit-beacon-input-rejected`). **Rate-limited via MagicLinkRateLimit `subjectKind='visit-beacon-ip-1h'` (D8)** capped at 60/hour per IP. minuteBucket computed and inserted; unique constraint silently dedupes via `INSERT … ON CONFLICT DO NOTHING`.
- Create: `src/lib/marketing/diagnostic.ts` — single helper `incrementDiagnostic(key)` that runs the upsert. All units use this; no parallel implementations (R12).
- Modify: [src/lib/metrics/activation-funnel.ts](src/lib/metrics/activation-funnel.ts) — add stages:
  - `anchor-page-visit`: min `LandingPageVisit.createdAt` per `mfAnonymousId`, joined to `User` via `email` (after signup-time backfill in R14)
  - `anchor-page-to-signup`: time delta from first `LandingPageVisit` to `User.createdAt` (where `signupSlug = LandingPageVisit.slug`)

**Approach.** The visit-beacon does its own client-side dedupe (1 request per page-load); the API also enforces dedupe via the unique constraint. Both layers are needed: client-side stops the obvious double-fire on hydration, schema-side stops bot-rotation attacks. `userAgentClass` is computed server-side via a conservative regex (Googlebot, GPTBot, ClaudeBot, PerplexityBot, GeminiBot, common SEO crawlers); bot visits ARE persisted (we want AI-engine crawl rates).

**Patterns to follow.** [src/app/api/auth/request-link/route.ts:113-119](src/app/api/auth/request-link/route.ts#L113-L119); [src/lib/metrics/activation-funnel.ts](src/lib/metrics/activation-funnel.ts).

**Test scenarios.**
- Visitor lands on `/uk/fatigue-in-men` → LandingPageVisit row, all fields correct.
- Reload within 1 minute → ON CONFLICT DO NOTHING; no duplicate row.
- Reload at minute boundary (61 seconds later) → second row written (different minuteBucket).
- Bot user-agent → `userAgentClass='bot'`; row persists.
- Beacon POST with `slug='../../etc/passwd'` → 400, no row, `visit-beacon-input-rejected` counter.
- Beacon POST 61st time within 1h from same IP → 429, no row, `visit-beacon-rate-limit-1h` counter.
- CTA submit → User created with `signupMarket=uk, signupCohort=fatigue, signupSlug=fatigue-in-men`.
- Returning visitor (existing email) signs up again → `signupSlug` NOT overwritten (preserved on first creation only).
- After signup, LandingPageVisit.email backfilled for all rows matching mfAnonymousId.
- Funnel report shows `anchor-page-visit` and `anchor-page-to-signup` with cohort + market breakdown.
- DiagnosticEvent: emit `visit-beacon-input-rejected` 100 times → table has 1 row with count=100, not 100 rows.

**Verification.** Manual smoke produces visit rows with correct fields; signup populates User context fields; funnel CLI shows new stages.

**Dependencies.** U1, U2 (slug-allowlist + cohort-allowlist).

**Execution note.** Test-first for the dedupe constraint and the input validation. Schema migration runs locally on a copy of prod data first to verify `db push` produces the expected DDL.

---

#### U4 · GEO infrastructure (sitemap, robots, hreflang utility)

**Goal.** Both markets have valid sitemaps. Robots respects the marketing tree. Sitemaps + robots are crawler-discoverable. JSON-LD components themselves live in U2 (where the templates that need them live); U4 owns the discovery surfaces only.

**Files.**
- Create: `src/app/sitemap.ts` — sitemap-index pointing at per-market sitemaps
- Create: `src/app/uk/sitemap.ts`, `src/app/us/sitemap.ts` (each enumerates content/marketing/{market}/)
- Create: `src/app/robots.ts` (allows `/uk/`, `/us/`, `/`; disallows `/api/`, `/account/`, `/r/`, `/share/`, `/intake`, `/onboarding`, `/upload`, `/upload/results`)
- Create: `src/lib/marketing/seo.ts` (`buildCanonicalUrl(market, slug)`, `buildHreflangAlternates(slug, availableMarkets)`)

**Approach.** Sitemap is generated at build time via filesystem walk, same as `generateStaticParams` in U2. Robots disallows the upload tree (R8 — preview surface noindex).

**Patterns to follow.** Next 14 [`MetadataRoute.Sitemap`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) and [`MetadataRoute.Robots`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) APIs.

**Test scenarios.**
- GET `/sitemap.xml` returns sitemap-index with two entries.
- GET `/uk/sitemap.xml` lists all UK pages.
- GET `/robots.txt` matches expected allow/disallow rules.
- Edge case: page with no FAQ → no FAQPage JSON-LD emitted (handled in U2 layout).
- Editorial-QA warning on `lastReviewedAt > 90 days ago`.

**Verification.** Google Rich Results Test passes. Schema.org Validator green. Google Search Console submission accepts sitemap.

**Dependencies.** U2.

**Execution note.** None.

---

### Phase 0 success gate

Before Phase 1 begins:

- ≥100 unique non-bot visits per market across the two anchor pages within 21 days of go-live.
- ≥5 email signups per market within the same window.
- Editorial-QA Vitest gate green on every commit.
- Both anchor pages indexed by Google (verified via `site:` query) and rendering in at least one AI answer engine (Perplexity test query).

If signups are <5 per market, do not build Phase 1. Iterate on copy, distribution, or recommend pivoting to channels 1+2.

---

### Phase 1 — Programmatic + monetization (weeks 4–7)

#### U5 · Public no-auth upload + provisional-user pattern

**Goal.** Visitor on a marketing page can upload a PDF without signing in. A provisional User row is created with `email=null`. SourceDocument is FK'd to that provisional user. At later signup, the upgrade path enforces R13 strict AND binding (cookie + MagicLinkToken.anonymousId) and the R14 atomic five-statement transaction.

**Files.**
- Modify: `prisma/schema.prisma`:
  - `User.email: String?` (was `String @unique`, becomes `String? @unique` — Postgres allows multiple NULLs)
  - `User.anonymousSessionToken: String? @unique` (added)
  - `MagicLinkToken.anonymousId: String?` (added — R13 second binding channel)
- Modify: `MagicLinkRateLimit.subjectKind` constants (no schema change): add `upload-ip-1h`, `upload-ip-24h`, `signup-ip-1h` (visit-beacon already added in U3).
- Create: `src/app/upload/page.tsx` (public, no auth)
- Create: `src/app/api/upload/route.ts` (POST PDF + Turnstile + `mf_anon`)
- Create: `src/lib/upload/blob-storage.ts` (wraps `src/lib/intake/storage.ts:storePdf`)
- Modify: `src/middleware.ts` — add `/upload`, `/upload/results`, `/api/upload/*` to `config.matcher` AND extend the public-allowlist branch to include them; in that branch, set `X-Robots-Tag: noindex`.
- Modify: [src/app/api/auth/request-link/route.ts](src/app/api/auth/request-link/route.ts) — accept `anonymousId` parameter; persist on the new MagicLinkToken row (R13 second channel binding).
- Modify: [src/app/api/auth/verify/route.ts](src/app/api/auth/verify/route.ts) — verify-time strict-AND check (R13): inbound `mf_anon` cookie matches both `User.anonymousSessionToken` AND `MagicLinkToken.anonymousId`. Reject otherwise. Run R14 atomic transaction with all 5 statements.

**Approach.** Middleware change is the predecessor's F4 trap — done correctly here: BOTH the matcher AND the if-branch are extended. The provisional-user creation runs inside the upload route after Turnstile verification + IP rate-limit. `User.anonymousSessionToken` equals `mf_anon`. At verify time, `mf_anon` cookie must match BOTH the User row AND the MagicLinkToken row — single-channel compromise is insufficient.

If `User.email` already exists on a different real user (the `mf_anon` upgrade tries to set an email already in use), the upgrade is rejected pre-transaction and the visitor is offered "sign in to claim this upload" — a separate path that re-runs the FK transfer keyed on the existing User's id with the same R13 strict-AND verification.

**Patterns to follow.** [src/lib/intake/storage.ts](src/lib/intake/storage.ts); [src/lib/auth/magic-link.ts:66-128](src/lib/auth/magic-link.ts#L66-L128); [src/app/api/auth/request-link/route.ts:113-119](src/app/api/auth/request-link/route.ts#L113-L119) (now factored).

**Test scenarios.**
- Anonymous POST PDF + valid Turnstile + valid mf_anon → 200 with `{ previewId, anonymousSessionToken }`. Provisional User exists; SourceDocument FK is provisional userId.
- Invalid Turnstile token → 401, no User row.
- 6th upload from same IP within 1h → 429, `MagicLinkRateLimit.subjectKind=upload-ip-1h`.
- PDF without `%PDF-1.` magic bytes → 415; `upload-magic-byte-rejected` counter.
- Verify-time: cookie missing → reject, `provisional-claim-cookie-mismatch` counter.
- Verify-time: cookie present, matches User.anonymousSessionToken but NOT MagicLinkToken.anonymousId → reject (single-channel compromise blocked).
- Verify-time: cookie present, matches MagicLinkToken but NOT User.anonymousSessionToken → reject.
- Verify-time: both match → proceed; FK transfer runs all 5 statements atomically.
- Verify-time: email collision with another User → reject upgrade, "sign in to claim" UX, no transaction.
- Verify-time: transaction fails partway (forced via fixture) → entire rollback; provisional User intact.

**Verification.** Manual: anonymous upload → DB has provisional User; sign up → atomic transaction completes; provisional User cleaned up.

**Dependencies.** U1, U3 (DiagnosticEvent, ip-hash).

**Execution note.** Characterization-first for the User.email read-site audit — write a failing test that lists every read site BEFORE applying the schema change. Test-first for the strict-AND verification logic.

---

#### U6 · Preview compile pipeline (server-side)

**Goal.** Anonymous visitor's uploaded PDF is processed server-side and produces a ≤4-paragraph, ≤200-tokens-each plain-English summary. Output stored on a typed `PreviewSummary` model. No client-facing surface in this unit — that's U7.

**Files.**
- Modify: `prisma/schema.prisma` — add `PreviewSummary`:
  ```
  model PreviewSummary {
    id                  String   @id @default(cuid())
    userId              String
    sourceDocumentId    String
    output              String   // ≤4 paragraphs of plain text
    lintReport          Json
    createdAt           DateTime @default(now())
    user                User           @relation(fields: [userId], references: [id], onDelete: Cascade)
    sourceDocument      SourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
    @@unique([userId, sourceDocumentId])
    @@index([userId])
  }
  ```
- Create: `src/lib/upload/preview-compile.ts` — entry point: takes SourceDocument, runs extraction (existing pipeline), generates preview prompt with G1–G7 constraints, calls LLMClient, runs output through `forbidden-phrases.ts`, writes PreviewSummary row.
- Create: `src/lib/llm/preview-prompt.ts` — Anthropic prompt with explicit constraints: no Rx names, no doses, no imperative-treatment verbs, no certainty claims, returns JSON `{ paragraphs: string[] }`.
- Modify: [src/lib/llm/linter.ts](src/lib/llm/linter.ts) — extend `LintSurface` union with `'preview'`; new branch handles flat `paragraphs: string[]` shape (no section keys, unlike topic/brief/gp_prep).

**Approach.** Preview prompt is short and constrained: extract markers, identify ≤3 most-anxiety/curiosity-relevant for cohort, write 1 paragraph per. No supplements, no protocols, no comparisons. If PDF lacks recognisable lab markers, fallback to "we couldn't read your panel — upload a Quest, LabCorp, NHS, or Medichecks PDF" with `preview-fallback-no-markers` counter (R12, fail-loud, no synthetic content).

**Patterns to follow.** [src/lib/llm/linter.ts](src/lib/llm/linter.ts); [src/lib/scribe/policy/forbidden-phrases.ts](src/lib/scribe/policy/forbidden-phrases.ts); existing LLMClient with DPA SHA pin and Edge Config kill-switch.

**Test scenarios.**
- Provisional user with valid PDF → preview generated, 4 paragraphs, passes forbidden-phrases scan.
- PDF with no recognisable markers → fallback message; `preview-fallback-no-markers` counter.
- LLM output contains "Adderall" → forbidden-phrases scan rejects; preview not stored; `preview-rejected-rx-name` counter.
- Edge Config kill-switch flipped → preview compile errors loudly; no synthetic fallback.
- LintSurface `'preview'` branch correctly handles flat paragraph array (vs section-keyed shapes for `topic`/`brief`/`gp_prep`).

**Verification.** Synthetic Quest panel → preview renders ≤4 paragraphs, marker-specific. Variations: corrupted PDF, single-marker panel, panel with cancer-related markers (forbidden-phrases must catch).

**Dependencies.** U5.

**Execution note.** Test-first for the linter extension and the forbidden-phrases gate. Both are silent-fail surfaces.

---

#### U7 · Cookie-bound preview results endpoint + RSC page (client-facing)

**Goal.** Authed-or-provisional visitor can view their preview at `/upload/results`. Access control is two-path explicitly: (1) provisional users — `mf_anon` cookie matches `User.anonymousSessionToken`; (2) upgraded users — session cookie matches `User.id`. RSC page surface AND API endpoint both emit `Cache-Control: no-store, private`.

**Files.**
- Create: `src/app/upload/results/page.tsx` (RSC; **`export const dynamic = 'force-dynamic'`**; reads PreviewSummary by id; resolves via two-path access control; emits `Cache-Control: no-store, private` via response headers helper)
- Create: `src/app/api/upload/results/[previewId]/route.ts` — two-path access control:
  ```
  const previewSummary = await prisma.previewSummary.findUnique({ where: { id: previewId } });
  if (!previewSummary) return forbidden();  // 403 not 404 (no resource enumeration)

  const sessionUser = await getCurrentUser();
  if (sessionUser?.id === previewSummary.userId) return ok(previewSummary);

  // Fall back to provisional cookie path
  const mfAnon = req.cookies.get('mf_anon')?.value;
  if (!mfAnon) return forbidden();
  const owner = await prisma.user.findUnique({ where: { id: previewSummary.userId } });
  if (owner?.anonymousSessionToken === mfAnon) return ok(previewSummary);
  return forbidden();
  ```
  Emits `Cache-Control: no-store, private` on success response.

**Approach.** The two-path access control closes the post-upgrade gap. After upgrade, `anonymousSessionToken` is NULL on the User row (per U5's R14 transaction); the provisional-cookie path naturally fails. The session-cookie path then takes over because the user is authed. Day-7/14 email CTAs work because the magic-link sign-in puts the user into the session-cookie path.

**Patterns to follow.** [src/lib/session.ts](src/lib/session.ts) (`getCurrentUser`); existing private-API-route conventions.

**Test scenarios.**
- Provisional user with valid `mf_anon` cookie matching `User.anonymousSessionToken` → 200 with preview output.
- Upgraded user with valid session cookie (own preview) → 200.
- Upgraded user with valid session cookie but trying to fetch ANOTHER user's preview → 403.
- No cookies, no session → 403.
- Wrong `mf_anon` cookie (matches no user) → 403 (not 404 — don't reveal existence).
- Response on success: `Cache-Control: no-store, private` header present.
- RSC page: `dynamic = 'force-dynamic'` set; HTML response carries `Cache-Control: no-store, private`.
- POST attempt to GET-only route → 405.

**Verification.** Manual: provisional view, then sign up, then re-view via session — both paths work. Try cross-user fetch attempt → 403. cURL response inspection confirms cache headers.

**Dependencies.** U5, U6.

**Execution note.** Test-first for the access control branches. This is the security-critical path the predecessor missed.

---

#### U8 · Multi-currency Stripe Subscription + lifecycle emails (Resend EU)

**Goal.** Authed user clicks "Subscribe £19/mo" on the results page → Stripe Checkout Session (with `metadata` AND `subscription_data.metadata`) → Stripe webhook writes `Subscription` row → `getMembershipState(userId)` returns typed result. Day-7 + day-14 lifecycle emails scheduled at signup time. RFC 8058 one-click unsubscribe with token-in-URL-query (not body).

**Files.**
- Add dependency: `stripe` (npm, official SDK).
- Modify: `prisma/schema.prisma`:
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
  model MarketingEmailSchedule {
    id            String    @id @default(cuid())
    userId        String
    segmentKey    String    // 'day-7' | 'day-14'
    scheduledFor  DateTime
    sentAt        DateTime?
    bouncedAt     DateTime?
    attemptCount  Int       @default(0)
    createdAt     DateTime  @default(now())
    user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([userId, segmentKey])  // R12 idempotency
    @@index([scheduledFor, sentAt])
  }
  model EmailSuppression {
    id            String   @id @default(cuid())
    email         String   @unique  @db.VarChar(320)
    reason        String   // 'unsubscribed' | 'bounced' | 'complained'
    createdAt     DateTime @default(now())
  }
  ```
- Create: `vercel.json` — **`crons` array only**, no `buildCommand` field. Single entry: `/api/cron/marketing-emails` at hourly schedule. (Pro tier required.)
- Create: `src/lib/billing/stripe.ts` — single SDK instance, env-keyed.
- Create: `src/lib/billing/checkout.ts` — `createCheckoutSession({ userId })`. **Reads `User.signupMarket` exclusively (R9); ignores cookie/URL.** **Pre-checkout guard: rejects if `Subscription.findFirst({ where: { userId, status: { in: ['active', 'past_due'] } } })` returns a row.** Sets metadata on BOTH `metadata` AND `subscription_data.metadata`.
- Create: `src/lib/billing/membership-state.ts` — `getMembershipState(userId)` typed result (D10). Conversion table maps Stripe's 7+ statuses to our 5.
- Create: `src/app/api/billing/checkout/route.ts` (auth-gated POST; no body params — market derived server-side).
- Create: `src/app/api/billing/webhooks/stripe/route.ts` — webhook signature verified via `stripe.webhooks.constructEvent`; handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`. Idempotent on `stripeSubscriptionId`. **Resolver fallback: if event metadata lacks `userId`, look up Subscription by `stripeSubscriptionId` to recover.** Diagnostic counter `stripe-webhook-unmatched` only when both metadata AND fallback fail.
- Modify: `src/middleware.ts` — add `/api/billing/webhooks/*` to matcher with the public-allowlist branch.
- Modify: `src/lib/marketing/constants.ts` — add `STRIPE_PRICE_IDS: { uk, us }` (env-driven test/live variants).
- Create: `src/app/api/cron/marketing-emails/route.ts` — POST handler, validates `Authorization: Bearer ${CRON_SECRET}` (R10). On match, processes due rows; on mismatch, 401 no DB read.
- Create: `src/lib/marketing/unsubscribe-token.ts` — `signUnsubscribeToken(email): string` and `verifyUnsubscribeToken(token): { email } | null`. HMAC-SHA256 keyed on SESSION_SECRET. 90-day expiry.
- Create: `src/app/api/marketing/unsubscribe/route.ts` — **POST per RFC 8058**: `?token=<signedToken>` in URL query string; body is the literal `List-Unsubscribe=One-Click`. The handler reads token from query param, body parsing is informational only. Body-less POSTs (Gmail/Outlook auto-fire) work because the token lives in the URL.
- Create: `src/app/marketing/unsubscribe/page.tsx` (UX confirmation, links to re-subscribe path)
- **Modify: [src/lib/auth/email.ts:16](src/lib/auth/email.ts#L16) — change `RESEND_URL` from `https://api.resend.com/emails` to `https://api.eu.resend.com/emails`** (D12). All email flows (magic-link AND marketing) move to EU. Implementer must verify Resend dashboard has EU region enabled and re-issue API key as EU-scoped before merge.
- Create: `src/lib/marketing/email.ts` — `sendMarketingEmail({ to, segmentKey, market })`. Adds `List-Unsubscribe: <https://.../unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers per RFC 8058.
- Modify: U5's verify endpoint — at upgrade-completion, write 2 MarketingEmailSchedule rows for `day-7` and `day-14` (idempotent via unique constraint).

**Approach.** Two prices, one product. Stripe Checkout returns to `/account?welcome=1` on success. The webhook is the source of truth; Subscription row is only written by the webhook, never by the checkout endpoint. Idempotency enforced by `stripeSubscriptionId` unique. Pre-checkout guard prevents double-subscriptions.

The lifecycle emails are templated server-side per market. Suppression check happens at SEND time, not at SCHEDULE time. The cron runs hourly; day-7 emails fire as soon as `scheduledFor <= now()`, so actual send delay is 0–60 minutes. Acceptable for marketing.

The Resend EU switch is the side effect of D12: existing magic-link emails also move to EU, which is correct for UK-GDPR but requires the EU API key to be in place first. Operations runbook: roll the API key, then merge the URL change in the same deploy.

**Patterns to follow.** Official Stripe Node SDK (verify version pin at implementation time via context7); [src/lib/auth/email.ts](src/lib/auth/email.ts) (Resend HTTP pattern, with URL change); RFC 8058 §3.

**Test scenarios.**
- Authed user POSTs `/api/billing/checkout` (empty body) → Stripe URL with metadata.userId, metadata.market = User.signupMarket.
- Authed user with cookie `mf_market=us` but `User.signupMarket=uk` → checkout uses `'uk'`; no currency arbitrage.
- Authed user with existing active Subscription → checkout returns 409 Conflict, no Stripe call.
- Webhook `checkout.session.completed` with valid signature → Subscription row written.
- Webhook with invalid signature → 400, no DB write.
- Webhook `customer.subscription.updated` (later) — metadata still carries userId via subscription_data.metadata → Subscription update.
- Webhook with metadata wiped (mocked Stripe edge case) → resolver fallback finds Subscription by stripeSubscriptionId, update succeeds.
- Webhook with metadata wiped AND no Subscription row exists → `stripe-webhook-unmatched` counter, 200 response (Stripe expects).
- Cancellation: `customer.subscription.updated` with status=cancelled → status persisted, cancelAt set.
- Past-due: status=past_due → `getMembershipState(userId).kind === 'past_due'`, graceUntil set.
- Cron POST without `Authorization: Bearer <CRON_SECRET>` → 401, no DB read.
- Cron POST with valid header, no due rows → 200, no-op.
- Day-7 email send → row's sentAt populated; no duplicate within 24h.
- Resend send 5xx → attemptCount incremented; retry next hour. After 3 failures, bouncedAt set, suppression added.
- Suppressed email at schedule time → schedule row written; at send time, suppression check skips, sentAt set to now() with `marketing-suppressed` counter.
- Unsubscribe POST `?token=<valid>` (Gmail-style body-less) → 200, EmailSuppression row.
- Unsubscribe POST `?token=<valid>` with body `List-Unsubscribe=One-Click` (correct RFC 8058) → 200, EmailSuppression row.
- Unsubscribe POST `?token=<expired>` → 400.
- Unsubscribe POST without token in URL → 400.
- Unsubscribe POST `?token=<for-email-A>` for `email-B` request → 400 (token doesn't match request context).

**Verification.** Stripe test-mode end-to-end: checkout → pay 4242… → Subscription row. Cancel via Stripe dashboard → webhook fires → state transitions. Resend EU: send a magic-link, confirm in EU dashboard. Unsubscribe: send a real email to a Gmail account, click → suppression row written.

**Dependencies.** U5 (provisional-user upgrade writes signupMarket).

**Execution note.** Test-first for: (a) the typed conversion table in `membership-state.ts`; (b) the strict market-from-signupMarket guard; (c) the unsubscribe token verify with signed-URL-query path. Resend EU URL change is a single-line edit but must roll out with API key migration.

---

#### U9 · (intentionally absorbed into U8)

This unit number is reserved for future Phase 1 expansion if needed. Lifecycle emails are part of U8.

---

### Phase 1 success gate

Before Phase 2 begins:

- ≥30 free uploads in 4 weeks.
- ≥10 paid Subscription conversions across both markets.
- Webhook idempotency proven in production (no duplicate Subscription rows after manual replay test).
- `forbidden-phrases.ts` rejection rate <5% on real preview output.
- FDA SaMD + FTC HBNR + MHRA legal review complete and on file.

If paid conversions are <10, do not build Phase 2. Run synthetic-persona tests on the wedge framing first.

---

### Phase 2 — Scale + retention (weeks 8–12)

#### U10 · Wearable bridge (reuses existing HealthConnection infrastructure)

**Goal.** Subscribed users can connect Whoop or use Apple Health export to provide ongoing trend data without a new blood panel. **The OAuth, token encryption, callback routing, and provider clients already exist** at [src/lib/health/whoop.ts](src/lib/health/whoop.ts), [src/lib/health/crypto.ts](src/lib/health/crypto.ts), [src/app/api/health/connect/route.ts](src/app/api/health/connect/route.ts), [src/app/api/health/callback/[provider]/route.ts](src/app/api/health/callback/[provider]/route.ts), and [prisma/schema.prisma:343-360](prisma/schema.prisma#L343-L360). This unit is graph-extraction integration + subscriber UI — not a parallel build.

**Files.**
- Modify: existing graph extraction pipeline — accept wearable signals as a `SourceDocument` variant. Wire `HealthDataPoint` rows from the existing sync pipeline into the graph as a third source type alongside PDF and manual entry.
- Create: `src/app/(app)/account/wearables/page.tsx` — surfaces existing connect/disconnect flow to subscribers; gated on `getMembershipState(userId).kind === 'active' || === 'past_due'`. Lists supported providers from existing `src/lib/health/sync.ts`.
- (Optional, scope-flexible) Add Apple Health support if not already in the existing sync service — verify scope at implementation time.

**Approach.** No new schema. No new OAuth code. No new encryption code. The unit is "make existing health data appear in the graph + dashboard" plus the subscriber-facing settings UI.

**Patterns to follow.** [src/lib/health/sync.ts](src/lib/health/sync.ts) (existing 503-line orchestrator); [src/app/api/health/connect/route.ts](src/app/api/health/connect/route.ts); [prisma/schema.prisma:343-360](prisma/schema.prisma#L343-L360) (HealthConnection — REUSE).

**Test scenarios.**
- Active subscriber connects Whoop via existing flow → tokens stored encrypted via existing `encryptToken()`.
- 30 days of HRV data appears in graph extraction pipeline as wearable-source `SourceDocument`.
- Token refresh fails → user sees existing "reconnect Whoop" UX.
- Free-tier user accesses `/account/wearables` → 402, redirect to billing.

**Verification.** Real Whoop account in dev — confirm OAuth + sync end-to-end via existing infrastructure. Confirm wearable data joins blood panel data on trend dashboard timeline.

**Dependencies.** U5, U8.

**Execution note.** None. Cited reuse means this unit is significantly smaller than the predecessor's U11.

---

#### U11 · Trend dashboard (Membership product surface)

**Goal.** Subscribed user has a single dashboard at `/account/trends` showing biomarkers + wearable signals over time. Charts render from the existing graph extraction pipeline; wearable data joins via U10. Dashboard is the visible Membership benefit.

**Files.**
- Create: `src/app/(app)/account/trends/page.tsx`
- Create: `src/components/trends/marker-chart.tsx`
- Create: `src/components/trends/composite-view.tsx`
- Modify: existing graph queries — add `getTrendsForUser(userId, dateRange)` joining HealthDataPoint + biomarker entries.

**Approach.** Read-only product surface. No new mutation paths. Charts via existing `src/components/graph-canvas/*` precedent. Gates on `getMembershipState`.

**Test scenarios.**
- User with 1 blood panel + 30 days Whoop → chart renders both.
- User with 1 blood panel only → chart renders panel; "connect a wearable" prompt for trend continuity.
- Cancelled subscription past grace → 402, redirect to billing.
- Past-due subscription within grace → access granted.
- Integration: HRV from Whoop appears on same timeline as ferritin from blood panel.

**Verification.** Dogfood with real Whoop data.

**Dependencies.** U8, U10.

**Execution note.** None.

---

## Risk Table

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **Cold-organic SEO produces <100 visits/page in 12 weeks** | High | High (Phase 0 gate fails) | Phase 0 detects in 21 days; if it happens, do not build Phase 1. | Phase 0 gate |
| **Multi-market scope expands engineering 30%+** | Medium | Medium | 80% of cost in U1+U2; remaining 20% in U5+U8 is parameterization, not new abstraction. | U1, U2 |
| **`User.email` nullable migration** | Low | Medium | ~5 production read sites verified. Audit gate runs before migration. | U5 |
| **Path A regulatory exposure on preview tier (LLM SaMD-adjacent)** | Medium | High | Phase 0 ships zero LLM interpretation to anonymous visitors. FDA/MHRA legal review is a Phase 1 prerequisite. forbidden-phrases.ts is a mitigation, not the regulatory posture. | Pre-Phase-1 legal |
| **Stripe metadata schema diverges or is missing on subscription events** | Low | Medium | Both `metadata` AND `subscription_data.metadata` set; resolver fallback via stored stripeSubscriptionId. | U8 |
| **Resend EU URL change breaks magic-link emails** | Low | High (auth outage) | EU API key issued + verified in dashboard before URL change. Test in staging. | U8 |
| **U10 wearable integration delayed** | Low | Medium | Existing infrastructure means scope is small. If U10 slips beyond Phase 2, pivot pricing to one-time pay-per-insight. | U10 |
| **Editorial-QA Vitest gate produces false positives that block PRs** | Low | Low | Per-page `qaAllowlist?: string[]` field with required justification comment. | U2 |
| **Provisional-user upgrade race conditions** | Low | High (data leak) | R13 strict-AND across cookie + MagicLinkToken + R14 atomic FK transfer in single transaction. Test-first. | U5 |
| **CRON_SECRET not validated** | Very low | High (bulk email DoS) | R10 explicit; first test scenario is "missing header → 401 no DB read". | U8 |
| **Visit-beacon DoS amplifier** | Low | Medium | Rate-limited via MagicLinkRateLimit subjectKind=visit-beacon-ip-1h capped at 60/hour per IP; slug+market+cohort allowlist. | U3 |
| **DiagnosticEvent table row explosion** | Very low | Low | Daily-counter rotation `(key, day)` unique with INSERT … ON CONFLICT DO UPDATE. O(N_keys × N_days). | U3 |
| **JSON-LD injection from accidental `</script>` in page-data** | Very low | Medium | R3 explicit escape `</` → `</` in `JSON.stringify` output before inlining. | U2 |
| **Multi-market signup → checkout currency arbitrage** | Low | Medium | R9 locks market = User.signupMarket at checkout; cookie/URL ignored. | U8 |
| **Subscription retention <30% at month 3 without wearable data** | Medium | Medium | U10 wearable bridge is plan-level mitigation. If retention is poor even with wearables, pivot pricing. | U10 + U8 |

## Operational Notes

- **Env vars by phase:**
  - Phase 0: existing `SESSION_SECRET`, `RESEND_API_KEY` (re-issued as EU-scoped key — see D12).
  - Phase 1: `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_LIVE`, `STRIPE_PRICE_GBP_19`, `STRIPE_PRICE_USD_29`, `CRON_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`. **Pre-flip checklist:** RESEND_API_KEY rotated to EU-scoped, EU region enabled in Resend dashboard, magic-link smoke-test green in staging.
  - Phase 2: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` (existing — see [src/lib/env.ts](src/lib/env.ts)). `HEALTH_TOKEN_ENCRYPTION_KEY` (existing).
- **Vercel Cron tier:** Phase 1 requires Pro (Hobby caps cron at 1/day). Verify tier before U8 begins.
- **Schema deploy mechanism:** `prisma db push --accept-data-loss`. No migrations directory (verified). `User.email String → String?` is the most-watched diff: confirm `db push` does not decide to drop+recreate.
- **vercel.json:** contains ONLY the `crons` array. **Do not add a `buildCommand` field** — that would silently override `package.json:vercel-build` and skip `prisma db push`.
- **Pre-Phase-1 legal review:** before U6/U7 production, get FDA SaMD + FTC HBNR + MHRA opinions in writing on the personalised LLM preview surface. Path A's "tech-first" framing exposes the application under SaMD's HCP-mediation criterion.
- **Diagnostic counter naming convention (R12):** `<surface>-<failure>` kebab-case. Examples: `provisional-claim-cookie-mismatch`, `stripe-webhook-unmatched`, `preview-fallback-no-markers`, `marketing-suppressed`, `upload-magic-byte-rejected`, `upload-rate-limit-1h`, `visit-beacon-rate-limit-1h`, `visit-beacon-input-rejected`, `page-data-zod-fail`. All emit via `incrementDiagnostic()` to the daily-rotated `DiagnosticEvent` table.
- **Resend EU rollout (D12):** the URL change in [src/lib/auth/email.ts:16](src/lib/auth/email.ts#L16) affects existing magic-link emails. Order of operations: (1) issue EU-scoped Resend API key in dashboard, (2) update Vercel env var, (3) test magic-link in staging, (4) merge URL change.

## Deferred to Implementation

- Whoop API endpoint shapes (verify via context7 MCP at U10 implementation time).
- Stripe SDK version pin (latest stable at impl time).
- Cohort-template prose (founder/clinical reviewer authors).
- Email template HTML (founder designs; implementer wires Resend send).
- Geo-redirect banner UX A/B (product call).

## Scope Boundaries (NOT in this plan)

- Channels 1 + 2 (concierge / founder network).
- Pay-per-insight pricing (£39 / $39 one-time) — explicitly rejected.
- DOB collection at signup.
- Slack-channel marketing pings.
- A/B testing infrastructure (PostHog, GrowthBook).
- Programmatic AI-content generation.
- Real-time wearable push integration.
- GP-prep document generation.
- Localisation beyond EN-GB / EN-US.

## Phased Delivery Summary

| Phase | Weeks | Units | Scope | Success gate |
|---|---|---|---|---|
| **Phase 0 — Validation MVP** | 1–3 | U1, U2, U3, U4 | Multi-market URL, page schema + JSON-LD + scaffolder, auth-gated CTA + funnel + visit-beacon, GEO infra | ≥100 visits + ≥5 signups per market in 21 days |
| **Phase 1 — Programmatic + monetization** | 4–7 | U5, U6, U7, U8 | Public no-auth upload + provisional User, preview compile, cookie-bound results endpoint, Stripe Subscription + lifecycle emails | ≥30 free uploads + ≥10 paid Subscriptions in 4 weeks; FDA/MHRA legal review on file |
| **Phase 2 — Scale + retention** | 8–12 | U10, U11 | Wearable bridge (small thanks to existing infra), trend dashboard | Membership month-2 retention ≥40% |

Total: **11 implementation units across 12 weeks**, with two real success gates that allow honest abandonment if validation fails.

## Revision History

- **2026-05-09 r1:** initial plan (12 units across 3 phases).
- **2026-05-09 r2:** confidence-check revision. Folded P0/P1 findings: U10 reuses existing HealthConnection infrastructure (was: parallel WearableConnection); R13 OR → AND with MagicLinkToken.anonymousId as second binding channel; U7 split into U6 (compile) + U7 (results endpoint) with explicit two-path access control; Stripe metadata on both `metadata` AND `subscription_data.metadata` plus resolver fallback; checkout market locked to `User.signupMarket`; pre-checkout active-Subscription guard; RFC 8058 token in URL query (not body); RSC `Cache-Control` explicit; LandingPageVisit dedupe via `@@unique([mfAnonymousId, slug, minuteBucket])` schema constraint (was: app-layer); DiagnosticEvent model fully specified with daily-counter rotation; visit-beacon rate-limited via MagicLinkRateLimit; visit-beacon input validation against allowlists; JSON-LD `</` escape; Resend EU endpoint switch in [src/lib/auth/email.ts:16](src/lib/auth/email.ts#L16) (D12 — was wrongly claimed already in place); `/` middleware redirect rehouses existing [src/app/page.tsx](src/app/page.tsx) at `/uk/page.tsx`; merged old U3+U5 into single U3; absorbed scaffolder into U2; corrected origin labels (R1–R15 are net-new, not brainstorm carryover).
