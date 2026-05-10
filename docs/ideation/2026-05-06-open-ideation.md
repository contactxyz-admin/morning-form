---
date: 2026-05-06
topic: open-ideation
focus: open-ended (post graph-canvas + branding-alignment session)
---

# Ideation: open-ended polish + product-direction pass

## Codebase Context

**Stack:** Next.js 14 App Router, React 18, TypeScript strict, Tailwind, Prisma + Postgres (prod) / SQLite (dev), Anthropic SDK, Vercel.

**Recent shipped (last ~2 weeks):**
- Synthetic-persona `/demo` walkthrough (overview / record / ask)
- Force-directed graph canvas on `/demo/record` and authed `/graph` desktop
- Home-page branding aligned with `/demo` editorial voice
- App-wide twMerge bug fix (custom font-size tokens were stripping `text-[#hex]` colors → invisible button text)

**Named failure patterns surfaced by past learnings:**
1. **Silent fallback** — twMerge dropping a class without warning, `getOrCreateDemoUser()` returning a fake user without warning, `JSON.parse → null`, redactors filtering empties without logging, cohort filters dropping unmatched rows.
2. **Source-of-truth drift** — `HEADLINE_METRIC_KEYS` duplicated 4 places, fixture data vs editorial copy diverging, paired arrays/configs/types silently going out of sync.

**Pain points:**
- PDF handling fragility (Vercel externalizations, native deps)
- ESLint scoped only to `/src/app/api` at build time
- Sparse hooks (~2 visible) → coupling risk
- Sparse tests
- Doc debt (84KB strategy doc, plans scattered)

**Active but unshipped plans (highest-leverage parked work):**
- [Activation funnel instrumentation](../plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md) — `status: active`
- [Grounding-rate metric](../plans/2026-04-21-001-feat-grounding-rate-metric-plan.md) — sister plan
- [Chat↔record bridge primitives](../ideation/2026-04-21-chat-record-bridge-ideation.md) — handed to `ce:work` 2026-04-21

**Regulatory guardrails (G1–G7) are load-bearing:** drug-name tripwires, dose-string tripwires, imperative-treatment refusal, out-of-scope routing to GP-prep, classification-driven UI, topic scoping, provenance requirement. Crossing any → SaMD classification → different product. GP-handoff (`route_to_gp_prep`) is the existing safety valve.

---

## Ranked Ideas

### 1. Ship the activation-funnel + grounding-rate measurement infra
**Description:** Frozen typed event taxonomy (`signup → essentials → connected → first chat → first grounded answer → retained-7d`), a single `track()` wrapper, and an internal `/admin/health` page surfacing the funnel + grounding rate per cohort + per prompt-version. Backfill the last 60 days from server logs where possible so the first dashboard ships with history, not a cold start.
**Rationale:** Plan exists ([2026-04-21-002](../plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md), `status: active`, unshipped). Measurement-before-reduction is explicitly named in the past learnings: every other activation idea below is conditional on this running first. Unblocks ≥3 downstream decisions (paywall, weekly recap, unit-economics).
**Downsides:** ~2-3 days; admin surface needs auth scoping; results may surface uncomfortable cliffs the team has to act on.
**Confidence:** 95%
**Complexity:** Low
**Status:** Explored — handed to `ce:brainstorm` 2026-05-06

### 2. First-record reveal as guided narrative
**Description:** Wire intake-submit completion into the existing `/reveal/*` directory (begin / expectations / profile / protocol / rationale) anchored to the user's *actual* extracted graph — first 3 nodes, first cited finding, first GP-prep preview.
**Rationale:** The persuasive arc that `/demo` works hard to set up (24 months, one change, inflection at month 14) breaks the moment a real user finishes intake — they get tab nav. `/reveal/*` already exists and is unused post-intake.
**Downsides:** Editorial copy work; needs at least N=3 nodes to land.
**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored

### 3. Marquee GP handoff: ship the letter, never say "prep"
**Description:** Replace `GPPrepCard` (currently buried at section 4 of topic pages) with a top-level `/take-to-your-gp` surface that aggregates across all open topics, generates a copy-pasteable email/referral letter (addressed, signed off, question articulated), supports one-tap PDF print, and surfaces the `route_to_gp_prep` audit trail showing what was excluded.
**Rationale:** "Prep" is meta-work; a sendable letter is the JTBD. The product pitch *is* the GP handoff — currently buried. Stays inside G1–G7 wellness positioning.
**Downsides:** Editorial; needs templating for diverse symptom/finding shapes; share-redaction interaction.
**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored

### 4. Audit + harden silent-fallback paths
**Description:** Bundle: (a) typed ESLint banning string-concat into `className` outside `cn()`, (b) `/debug/silences` dev-only event ledger wired into `JSON.parse` sites, redactors, `getOrCreate*` helpers, (c) Postgres CHECK / partial-unique invariants replacing app-layer `if (!x) return null` branches, (d) G1–G7 guardrails as typed Vitest assertions over rendered output + sampled LLM outputs.
**Rationale:** Closes the named class-of-bug. The twMerge silent-class-drop was a 4-day prod bug; same shape exists at multiple layers. Convergent across all 4 ideation frames.
**Downsides:** Largest scope (likely 2-3 PRs); some dev-time noise from typed-ESLint warnings during ramp.
**Confidence:** 85%
**Complexity:** High
**Status:** Unexplored

### 5. Persistent intake drafts (server-side or OPFS)
**Description:** Replace the explicitly-not-persisted intake store ([src/lib/intake/store.ts:6-10](../../src/lib/intake/store.ts#L6-L10)) with a draft persisting PDF page-1 thumbnail + content hash + form state. Pair with a re-upload detection prompt: "this looks like a re-upload of X — merge or keep both?"
**Rationale:** First real-world test of the product is multi-session intake. Losing a 4MB PDF because you closed the tab is the highest-impact "I don't trust this" moment. Quarterly bloods is the canonical re-upload moment.
**Downsides:** Storage: OPFS is browser-only; server-side adds cleanup TTLs; thumbnail extraction adds dependency surface.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 6. Wearable surface: gate Apple Health + per-provider freshness on /home
**Description:** Apple Health currently 400s with "requires native iOS app" ([api/health/connect:34-43](../../src/app/api/health/connect/route.ts#L34-L43)) — gate behind a "request the iOS beta" flow that captures the email and sets expectations, OR remove the tile until the bridge ships. Add per-provider freshness indicator on `/home` (last sync, expired-token warning, silent-failure red dot when 4xx/5xx). Render zeros only when the provider explicitly returned zeros.
**Rationale:** The home hero promises *"Whoop, Oura, Apple Health, blood panels"*. Apple Health silently slot-machining into a dead-end is brand damage. Day-8 token expiry currently shows blank `/home` (silent fallback at `home/page.tsx:62-69`).
**Downsides:** Two surfaces; the expectations-capture flow is itself a small product decision.
**Confidence:** 85%
**Complexity:** Low-Medium
**Status:** Unexplored

### 7. Single source-of-truth: design tokens + HEADLINE_METRICS
**Description:** Collapse `HEADLINE_METRIC_KEYS` (4 places) into one typed module + presence test. Generate Tailwind tokens (color, spacing, font-size, radii, motion) from a single TS file consumed by both `tailwind.config.ts` and runtime, with a CI drift check. Closes [Issue #90](https://github.com/contactxyz-admin/morning-form/issues/90).
**Rationale:** The other named class-of-bug (source-of-truth drift). Token rationalization lets editorial / brand changes ship in days instead of weeks. Small but exemplary.
**Downsides:** Token migration touches many files even when values are 1:1; CI drift check needs careful threshold setting.
**Confidence:** 85%
**Complexity:** Low-Medium
**Status:** Unexplored

---

## Honorable mention

**Visual-regression gate + deterministic fixture seed** — headless screenshot diff on `/demo`, `/demo/record`, `/graph` per PR with a frozen seed. Would have caught the twMerge invisible-text bug pre-merge. Defer until #4 lands; the typed ESLint + token-coverage tests cover most of the same surface at lower infra cost.

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| R1 | Kill the graph, ship one number | Whiplash — graph canvas just shipped; reframe too aggressive without funnel data |
| R4 | Bloods 10×, demote wearables | Premature without funnel data showing wearable-OAuth is the cliff |
| R6 | 30-second visitor wearable demo | Privacy + OAuth complexity; ephemeral-session infra; speculative |
| R7 | Make demo obviously synthetic | Opposite of recent direction; no signal users distrust the synthetic |
| R8 | Collapse 4 node classes to 1 | Information loss; 4-class encoding is working |
| R9 | "Show my mum" shareable view | Speculative without user signal; share infra exists |
| R10 | 8 minutes wrong on both sides | A/B-infra dependency; better as brainstorm variant |
| R2 | Weekly "what changed" as primary AI surface | Premature — funnel must run first |
| I4 | Delete /demo, generate from /record | Erases recent editorial polish |
| I6 / C9 | PDF rendering refactors | PDF gen isn't the named bottleneck |
| I7 | PR description generator | `ce:work` + `ce:review` already do this |
| I9 | Pre-commit dead-link scan | Orphan routes are intentional drafts |
| I10 | SSR-precompute canvas | Speculative perf; not a named pain |
| C3 | Chat-record bridge package | Already in flight (`ce:work` 2026-04-21) |
| C5 | Multi-reviewer plan template | Already a habit |
| C10 | Frozen public surface contract | Bureaucracy without proven need |
| P1 | Re-upload detection (standalone) | Subsumed into #5 |
| P7 | Provenance chip on every claim | G7 already requires; needs verification before action |

---

## Session Log

- **2026-05-06**: Initial open-ended ideation. 40 raw candidates generated across 4 frames (user/operator pain, inversion/automation, assumption-breaking, leverage/compounding). 18 rejected with reasons; 7 survivors. User selected #1 (activation funnel) for `ce:brainstorm` handoff.
