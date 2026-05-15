---
title: 'feat: World-class /sign-in UX — unified surface + product context lift'
type: feat
status: active
date: 2026-05-15
deepened: 2026-05-15
---

# World-class /sign-in UX

## Overview

Rewrite the `/sign-in` page from a returning-user-only ceremony into a confident, dual-purpose entry that makes account creation obvious without forcing users to pick "new vs returning." The magic-link backend stays untouched — this is a UX-layer change. Layout reserves a slot for the Phase B SSO buttons so they can land without a second rewrite.

## Problem Frame

PR #123 reframed `/sign-in` to be the universal entry post lead-gen pivot, but the live UX (deployed on `morning-form.vercel.app/sign-in`) still fails two tests:

1. **Doesn't feel world-class** — eyebrow `SIGN IN`, headline `See your record.`, and the body `New or returning — same door.` are technically correct but read as a turnstile. The "same door" metaphor is too clever; first-time visitors don't parse it as "you can sign up here." Visual hierarchy is fine; copy is doing the wrong job.
2. **Account creation isn't discoverable** — the page never says "create your account" anywhere. A first-time visitor doesn't know whether submitting their email will create something or fail because they don't have an account yet. The footer link "New here? See a sample record" routes to a marketing demo, not a signup path — it answers "what is this?" when the user is asking "how do I get in?"

The chosen direction (after research + scope discussion):
- One `/sign-in` route. No split into `/sign-up` — splitting forces a "which am I?" decision before the user has invested anything.
- Make the dual-purpose nature explicit in copy: *"Sign in or create your account."*
- Universal CTA: `Continue with email →`. No more `Send sign-in link →` — the link mechanic is microcopy, not the primary verb.
- Lift `/demo` from buried footer link to a co-primary "explore first" CTA, since `/demo` is substantive (4 metric cards, 24-month synthetic arc) and credibly answers "what is this?"
- Reserve a layout slot + visual separator rule for the Phase B SSO buttons (Google + Apple) so they slot in without re-layout.

## Requirements Trace

- **R1** — A first-time visitor reading the page above the fold understands that submitting their email creates their account (no separate signup step). _Source: explicit user complaint._
- **R2** — Brand voice from `src/app/[market]/page.tsx` is preserved: `font-mono text-[10px] uppercase tracking-[0.14em]` eyebrow, `font-display font-light` headline with `<span className="italic font-light">` emphasis, `text-body-lg text-text-secondary leading-relaxed` body, em-dash microcopy.
- **R3** — The magic-link backend (`/api/auth/request-link` + `/api/auth/verify`) is not touched. Dev `verifyUrl` bypass continues to work invisibly in prod.
- **R4** — Phase B SSO can be wired in (Google + Apple buttons) without re-laying-out the page. A clear seam + comment marks the slot.
- **R5** — Funnel events (`SIGNUP_INITIATED`, `SIGN_IN_COMPLETED`, `SIGNUP_COMPLETED`) continue to fire correctly. The `provider` property continues to use the `AuthProvider` union.
- **R6** — Demo bypass (`ALLOW_DEMO_BYPASS=1` + `demo@morningform.com`) continues to work in preview environments. The empty default for the email input (shipped in PR #123) is preserved — no regression to the pre-fill.

## Scope Boundaries

- **NOT** implementing Phase B SSO providers. Auth.js setup, OAuth credentials, Google/Apple buttons — all deferred. This plan only reserves space.
- **NOT** redesigning the marketing landing pages at `/uk` and `/us`. Their hero CTAs already match the new framing.
- **NOT** changing the magic-link backend.
- **NOT** introducing route-level splits (`/sign-up`, `/auth`). Single `/sign-in` route stays.
- **NOT** adding the "Apple-style email lookahead" flow (probe `/api/auth/exists` then reveal "Creating account…" vs "Welcoming you back…"). It's a delight detail but introduces an enumeration-attack surface and a state-machine fork — out of scope for this iteration.

### Deferred to Separate Tasks

- **Phase B SSO buttons (Google + Apple)** — separate plan, needs OAuth credentials.
- **Component test for the universal form** — no client-page component tests exist anywhere in the repo today; setting that precedent is its own decision. Plan notes the testing gap but does not introduce it.

## Context & Research

### Relevant Code and Patterns

- **`src/app/sign-in/page.tsx`** — current implementation. Client component, state-machine pattern (`{kind: 'idle'} | {kind: 'loading'} | {kind: 'sent'} | {kind: 'error'}`). This is the only file the rewrite primarily touches.
- **`src/app/[market]/page.tsx`** — canonical brand-voice source. The recurring pattern across every section: eyebrow (mono-uppercase tight tracking) → headline (display-light with italic emphasis) → body (text-body-lg secondary) → CTA pair (primary `<Button size="lg">` + adjacent `text-body` ghost link).
- **`src/components/ui/input.tsx`** — `<Input label="..." error={...} autoComplete="email" autoFocus />`. The label renders as the mono-uppercase eyebrow. Keep this as the email field shape.
- **`src/components/ui/button.tsx`** — `<Button size="lg" fullWidth loading={loading}>` is the canonical primary CTA. Loading triggers `animate-pulse-subtle`. Convention: arrow suffix on active label, ellipsis on loading label.
- **`src/app/demo/page.tsx`** — 158-line server component. Renders 4 metric cards (HbA1c, systolic BP, sleep efficiency, free testosterone) with 24-month synthetic sparklines + drill-into-record and /ask links. Strong "what is this?" answer; safe to elevate as a co-primary CTA.
- **`src/lib/funnel/event.ts`** — `SIGNUP_INITIATED`, `SIGNUP_COMPLETED`, `SIGN_IN_COMPLETED` all exist. `AuthProvider` union already supports `'magic_link' | 'google' | 'apple'`. No event-schema changes needed.
- **`src/lib/funnel/track.ts`** — client-side `track(event, properties)` helper. Existing call site at `src/app/sign-in/page.tsx:31` (post-PR-#123) fires `SIGNUP_INITIATED` on submit. Keep this call site.
- **`src/components/marketing/email-capture-form.tsx`** — second email-form surface, uses an older pattern (raw `<input>` styled inline). Not touched by this plan. The sign-in page's `<Input>` + `<Button>` stack is the correct shape; do not regress to the older shape.

### Institutional Learnings

- **`docs/solutions/best-practices/server-action-shared-cta-instrumentation-2026-05-11.md`** — fire funnel events on click/submit, never on page render. The current `track(SIGNUP_INITIATED)` call site at submit is already correct. The doc warns against splitting one counter into two intent-keyed counters after the fact — `SIGNUP_INITIATED` already covers both new and returning submits with `{provider: 'magic_link'}` and is the right shape.
- No prior learnings exist for auth-page UX, form state machines on auth surfaces, or dual-purpose sign-in/sign-up patterns. **After this ships**, capture conventions for the universal-auth-form pattern, button states, and a11y for future surfaces (worth one entry under `docs/solutions/best-practices/`).

### External References

- The unified-surface pattern is industry standard for modern consumer products: Linear, Vercel, Stripe, Notion, Anthropic Console all use "Continue with email" + "Create your account" framing on a single route. Not citing specific URLs — the pattern is convergent.

## Key Technical Decisions

- **One route, not two.** `/sign-in` stays; no `/sign-up`. Rationale: splitting forces a "which am I?" decision before the user has invested. Modern consumer pattern is universal — Linear, Vercel, Stripe, Notion all do this. (User-confirmed direction.)
- **Primary CTA label: "Continue with email"** (not "Send sign-in link"). Rationale: "Continue" doesn't presuppose intent; it's the verb that works for both new and returning users. The magic-link mechanic is microcopy beneath the button.
- **Headline changes from `See your record.` to `Sign in or create your account.`** with `<span className="italic font-light">` emphasis on `account` (the noun the user is making). Rationale: the new headline does the load-bearing work for R1 — it states the dual-purpose nature in plain language. The old "See your record" copy stays alive on the landing-page heroes; the sign-in page leans on a different headline because it has a different job.
- **Eyebrow lock: `SIGN IN · CREATE YOUR ACCOUNT`.** Locked rather than left as a fork. An alternative phrasing like `FREE · MAGIC LINK · NO PASSWORD` doesn't carry R1 on its own (no account-creation language), and offloading R1 entirely onto the headline thins the redundancy that helps R1 land. Implementer may iterate on copy weight/tracking but the semantic content stays — both "sign in" and "create your account" must appear in the eyebrow.
- **Body grows to two sentences.** Current single sentence is too thin. New body names what the user gets (record, labs, wearables, plain-English interpretation) and how it works (magic link, no password) in two short sentences.
- **Secondary CTA promoted.** `See a sample record →` lifted from buried `text-caption` footer link to `text-body` ghost CTA on the same row as (or directly under) the primary button, matching the landing-page CTA-pair pattern.
- **SSO placeholder slot.** A `{/* Phase B: SSO providers slot in here */}` comment + a visible separator rule (`— or —` style or the existing border pattern) below the primary button. No buttons rendered today, but the visual rhythm accommodates them.
- **No state-reveal flow.** The "Welcoming you back…" vs "Creating account…" lookahead is deferred. Adds an enumeration-attack surface (`/api/auth/exists`) and a state fork for marginal UX gain — not worth the cost in this iteration.
- **No new funnel events.** `SIGNUP_INITIATED` continues to fire on submit with `{provider: 'magic_link'}`. The semantic "returning users also fire SIGNUP_INITIATED" was acknowledged as acceptable in the PR #122 review (analytics-side dedup against `SIGNUP_COMPLETED`); not changing here.
- **Motion: minimal.** Framer Motion is installed but the landing page uses none. Add at most a subtle CSS-only entrance (existing `ease-spring` transitions) on the headline + form. No splashy animations.
- **No backend changes.** `/api/auth/request-link`, `/api/auth/verify`, `getCurrentUser()`, and the consent gate are all untouched.
- **Empty email default stays empty.** The `useState('')` shipped in PR #123 is preserved — no regression to `demo@morningform.com` pre-fill.

## Open Questions

### Resolved During Planning

- **Single surface vs split routes?** Single surface (R1, user-confirmed).
- **Add `/api/auth/exists` for lookahead reveal?** No — out of scope; enumeration risk.
- **Add new funnel event for SIGN_IN_SHOWN page-view?** No — existing learning is "fire on action, not on render."
- **Touch the marketing landing pages?** No — `/uk` and `/us` hero CTAs already say `"Free · sign in with email"` post-PR-#123, aligned with the new framing.

### Deferred to Implementation

- **Final body wording.** Two-sentence body; exact phrasing decided at implementation. Draft: *"Your full record — labs, wearables, and what they mean — ready in minutes. Magic link, no password — works whether you're new or returning."* The implementer may rephrase but the body must (a) name the value proposition and (b) explicitly remove the new-vs-returning ambiguity.
- **Eyebrow visual treatment.** Tracking/spacing/separator between "SIGN IN" and "CREATE YOUR ACCOUNT" can be iterated visually — a middle dot, a slash, a line-break, or any of those — provided both phrases remain present and legible. The semantic content is locked; only the typography is open.
- **Secondary CTA placement.** Either inline-right of the primary (landing-page pattern) or stacked below. Pick whichever reads better at narrow viewports.
- **SSO slot styling.** The visual separator pattern (`— or —` rule vs a single border) and the space reserved (height + margin) — decided when laying out the new structure. Don't over-specify; the Phase B plan can adjust.

## High-Level Technical Design

> *This illustrates the intended page shape and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌──── Header (unchanged) ────────────────────────────┐
│ MORNING FORM                                       │
└────────────────────────────────────────────────────┘

           SIGN IN · CREATE YOUR ACCOUNT
                                          (eyebrow)

           Sign in or create
           your account.                  (headline,
                                           italic on
                                           "account")

           Your full record — labs, wearables,
           and what they mean — ready in minutes.
           Magic link, no password — works whether
           you're new or returning.       (body, 2 sentences)

           ┌────────────────────────┐
           │ EMAIL                  │     (Input primitive,
           │ ──────────────────────│       autoFocus,
           │                        │       autoComplete=email)
           └────────────────────────┘

           ┌────────────────────────┐
           │  Continue with email → │     (primary Button)
           └────────────────────────┘

           ── or ───────────────────────  (visual rule
                                           + Phase B SSO
                                           comment marker)

           {/* Phase B: SSO providers slot in here */}

           Want to look around first?
           See a sample record →           (secondary CTA,
                                            text-body weight,
                                            links to /demo)
```

Sent state (after submit) keeps the existing layout but the copy gets a light polish to match the new universal voice (no "back" framing).

## Implementation Units

- [ ] **Unit 1: Restructure the `/sign-in` form page — eyebrow, headline, body, CTA pair, SSO slot**

**Goal:** Rewrite the `idle` state of `/sign-in` to the layout in the design sketch. Universal-surface framing; co-primary `/demo` CTA; SSO slot reserved.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** None

**Files:**
- Modify: `src/app/sign-in/page.tsx`

**Approach:**
- Keep the existing state machine (`'idle' | 'loading' | 'sent' | 'error'`). Only the rendered JSX of the `idle` branch changes.
- Eyebrow: replace `<p className="text-label uppercase text-text-tertiary mb-4">Sign in</p>` with the universal eyebrow (defaulting to `SIGN IN · CREATE YOUR ACCOUNT`). Match the explicit font-mono tracking convention used on the landing page (`font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary`).
- Headline: change `See your <em>record</em>.` to `Sign in or create your <em>account</em>.`, keeping `font-display font-light` and the inline `<span className="italic font-light">` emphasis. The italic word becomes `account` (the noun the user is making).
- Body: grow to two sentences. Default: *"Your full record — labs, wearables, and what they mean — ready in minutes. Magic link, no password — works whether you're new or returning."* Apply `text-body-lg text-text-secondary leading-relaxed max-w-xl -tracking-[0.005em]` (matching landing-page body).
- Primary CTA: change `Send sign-in link →` to `Continue with email →`. Loading label stays as `Sending link…` — unchanged because it's already accurate to the mechanic.
- Secondary CTA: replace the buried `text-caption` "New here? See a sample record" footer with a `text-body text-text-secondary hover:text-text-primary` ghost link reading `See a sample record →` (or `Want to look around first? See a sample record →`), placed below the form rather than under it as legalese. Pattern mirrors the landing-page `Already a member? Sign in →` style.
- SSO slot: add a `<div className="my-8" aria-hidden="true">` with a horizontal rule + "or" centered (using existing border tokens), followed by a `{/* Phase B: SSO providers (Google, Apple) — wired when OAuth credentials provisioned. */}` comment placeholder. Today the slot renders the separator alone. (Do not bake in a path to a Phase B plan file that doesn't exist yet — keep the comment short and self-contained.)
- Sent state: lightly polish to remove any "back" framing. Current copy is acceptable; only change if it reads as returning-user-only.

**Patterns to follow:**
- Eyebrow/headline/body stack: `src/app/[market]/page.tsx` (hero, line ~80 onward; final-CTA section, line ~252 onward).
- CTA pair pattern: `src/app/[market]/page.tsx:262-277`.
- Input + Button stack: existing `src/app/sign-in/page.tsx:120-139` (keep this structure; just relabel CTA).
- Italic-emphasis convention: `src/app/[market]/page.tsx:85` and `src/app/demo/page.tsx` hero.

**Verification checklist (browser-based — no automated test added; no client-page component test precedent exists in this repo):**
- *Happy path:* Visit `/sign-in` in a fresh browser session. Eyebrow reads as universal (no "returning-only" implication). Headline + body make it clear submitting the email creates an account on first use.
- *Happy path:* Type a valid email and click `Continue with email`. Button shows loading state. On 200, form swaps to sent state.
- *Edge case:* Refresh the page. Email field is empty (no `demo@morningform.com` pre-fill regression).
- *Edge case:* Narrow viewport (<= 375px). Layout doesn't break; secondary CTA either wraps gracefully or stacks. Headline and CTA buttons remain full-width tappable targets.
- *Integration:* `track(FUNNEL_EVENTS.SIGNUP_INITIATED, {provider: 'magic_link'})` fires on submit. Server returns 200. Sent state renders.

**Verification:**
- Visit Vercel preview after merge. Page reads as universal entry; new users feel welcome.
- Magic-link round trip (request → email → click → land on `/record`) still works end-to-end.
- `tsc` clean.
- Old "Welcome back" / "Return" copy is fully removed (grep confirms).

---

- [ ] **Unit 2: Enrich the post-submit "sent" state copy to match the new universal voice**

**Goal:** The current sent-state copy (*"We sent a sign-in link to {email}. Open it on this device to continue."*) is functional but thin — and it now sits inside a page whose idle state is doing more product work. Bring the sent state up to the same density so the page feels coherent end-to-end.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (only because both touch the same file; sequencing helps avoid merge conflicts)

**Files:**
- Modify: `src/app/sign-in/page.tsx` (sent-state branch only)

**Approach:**
- Lift the leading copy to a more active framing — e.g. *"Check your inbox."* as a brief headline, then the existing detail in the body: *"We've sent a one-time link to {email} — open it on this device to continue. Links expire after 15 minutes."*
- The expiry sentence already exists below the main paragraph; consolidate into one block rather than two paragraphs.
- "Use a different email" ghost button stays — useful for typos.

**Patterns to follow:**
- Existing sent state (`src/app/sign-in/page.tsx:95-115`) — keep the structural shape (heading + body + ghost button); only the prose changes.

**Verification checklist (browser-based):**
- *Happy path:* Submit email; sent state shows new copy with the user's email interpolated. "Use a different email" returns to idle with the form cleared.

**Verification:**
- Sent state copy carries no "back" / "welcome back" framing.
- "Use a different email" still resets the form.

---

- [ ] **Unit 3: Verification pass against deployed Vercel preview**

**Goal:** Confirm the rewritten page reads as world-class and addresses both failure tests (R1, R2).

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** Units 1 and 2

**Files:**
- None (this is a verification pass, not a code change)

**Approach:**
- After commit + push, open the Vercel preview URL on a fresh browser profile (no cookies, no localStorage).
- Walk the full first-touch flow: `/uk` landing → primary CTA → `/sign-in` → enter email → check inbox → click link → land on `/record`.
- Walk the demo-detour flow: `/uk` → primary CTA → `/sign-in` → "See a sample record" → `/demo` → back-navigate → enter email.
- Confirm the page reads as world-class to a fresh observer (does the eyebrow + headline + body land?). Honest assessment, not self-marking.

**Verification checklist (browser-based, no automated assertions):**

**Verification:**
- A teammate (or a fresh-browser-self-test) reads the new `/sign-in` page and can articulate, unprompted, that signing up and signing in are the same flow.
- All landing-page CTAs and the "See a sample record" link continue to route correctly.
- `tsc` clean. CI green. No regression in `request-link` / `verify` route tests.

## System-Wide Impact

- **Interaction graph:** `/sign-in` is the destination of three sources (`/uk` hero CTA, `/uk` final-CTA, `/us` equivalents). None of those source links need updating — they all already route to `/sign-in`. The marketing anchor pages (`content/marketing/uk/fatigue-in-men.ts` and `us/fatigue-in-men.ts`) updated in PR #123 also point at `/sign-in`; no further change needed.
- **Error propagation:** Unchanged. The existing `error` state in the discriminated union handles 400/429/5xx from `/api/auth/request-link`.
- **State lifecycle risks:** None new. The state machine is unchanged; only the rendered JSX is rewritten.
- **API surface parity:** `/api/auth/request-link` and `/api/auth/verify` are not touched. The dev `verifyUrl` bypass still works.
- **Integration coverage:** Browser-based verification only. The magic-link round trip is already covered by `src/app/api/auth/verify/route.test.ts` (PR #122 hardened those tests post-`&new=1`).
- **Unchanged invariants:** The empty-default email field (PR #123 fix), the `provider: 'magic_link' satisfies AuthProvider` funnel-event property, the existing client-side state machine shape, and the consent-modal flow are all preserved exactly.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| New copy still doesn't land — user reads it again and feels the same UX gap. | Verification step (Unit 3) is an explicit honest-read pass. If it still feels off, iterate copy in a follow-up PR rather than ship-and-forget. |
| The "Continue with email" CTA confuses users who expected "Send sign-in link." | Microcopy below the button (or in the body) names the mechanic clearly: "We'll send you a one-time link — no password needed." |
| Lifting `/demo` as a co-primary CTA inflates demo traffic without conversion. | Acceptable — `/demo` is server-rendered, cached, and exists to answer "what is this?" Letting people explore before committing is the point. If the funnel data shows /demo eating signups instead of supplementing them, adjust visual weight in a follow-up. |
| Phase B SSO arrives and the placeholder slot doesn't fit cleanly. | The slot is intentionally loose (a separator + a comment). The Phase B plan owns the final SSO layout; this plan only reserves space and signals intent. |
| Brand voice drift if the implementer paraphrases the body copy poorly. | Default body copy is specified in Unit 1's approach. The implementer can iterate but the bar is set. |

## Documentation / Operational Notes

- After ship, write a `docs/solutions/best-practices/universal-auth-form-conventions-YYYY-MM-DD.md` capturing the dual-purpose framing pattern, button states, and a11y attributes. Currently no prior learning exists for auth-page UX; this rewrite is the first time the conventions get codified.
- No rollout / monitoring concerns. Pure UX-layer change; no schema, no API, no feature flag.

## Sources & References

- Related PRs: [#122](https://github.com/contactxyz-admin/morning-form/pull/122) (lead-gen pivot, ungate assessment), [#123](https://github.com/contactxyz-admin/morning-form/pull/123) (sign-in copy fix, /onboarding deletion)
- Related plan: `docs/plans/2026-05-15-002-feat-lead-gen-signup-and-optional-assessment-plan.md` — the upstream plan that this UX rewrite completes the spirit of
- Brand-voice reference: `src/app/[market]/page.tsx`
- Past learning: `docs/solutions/best-practices/server-action-shared-cta-instrumentation-2026-05-11.md` — funnel-event timing convention
