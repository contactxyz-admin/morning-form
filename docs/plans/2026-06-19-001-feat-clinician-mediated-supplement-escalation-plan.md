---
title: "feat: Clinician-mediated supplement escalation — risk-free guidance → clinician handoff → Supply fulfilment, in the chat scribe"
type: feat
status: active
date: 2026-06-19
origin: user request (reuben, 2026-06-19) — "the sleep answer can be better: lead with no-risk guidance, then refer to a 'pharma' specialist that says e.g. magnesium 1h before bed is study-backed, then offer our Supply to buy". Governing posture confirmed during planning → **clinician-mediated middle** (not a live agent recommendation, not a posture reversal). Sits under the locked posture in docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md.
---

# feat: Clinician-mediated supplement escalation in the chat scribe

## Overview

The current sleep & recovery chat answer (the `/ask` surface) is too thin: asked
"what supplements should I take to improve my sleep?", it skips straight to
generic meta-advice (*Track / Measure / Discuss*). It never gives the user the
zero-risk, high-value guidance it safely can (consistent sleep/wake time, a cool
~18 °C bedroom, morning light, caffeine cutoff), and it never gives an honest,
useful answer to the actual supplement question — it just goes quiet, because the
forbidden-phrase scan (rightly) blocks named supplements and doses.

This plan adds a **three-tier escalation** to the chat scribe that delivers what
the user asked for **without reversing the locked in-lane posture**:

1. **Tier 1 — lead with risk-free guidance.** The sleep specialist opens with
   concrete, evidence-based sleep-hygiene the user can act on today, surfaced as
   `behavior` next-steps. No risk, no gate, ships immediately.
2. **Tier 2 — clinician-mediated supplement handoff (the "pharma specialist",
   reframed).** When the question is pharmacological (a supplement or
   medication), the scribe does *not* go silent and does *not* recommend. It
   produces a grounded, evidence-aware **clinician-discussion** item: the general
   (non-directive) evidence context plus a specific, patient-voiced question to
   bring to a Morning Form clinician/pharmacist, and offers to arrange that
   conversation. The accountable human — the clinician — makes the call.
3. **Tier 3 — clinician-/user-initiated Supply fulfilment.** Only *after* a
   clinician conversation (or on an explicit user-initiated reorder) does a
   Supply offer appear, fulfilled through a concierge request flow (reusing the
   existing `BookingRequest` machinery), flag-gated and default-off. The scribe
   facilitates the user's/clinician's request; it never upsells or directs
   supplementation.

The felt experience matches the user's brief — *safe guidance → expert input →
the product* — but the "expert" is a real accountable clinician, not an
autonomous agent making a regulated claim. This is the
**regulated-pathway / clinician-partner route the 2026-06-17 posture memo itself
names** as the right way to reach the directive layer "later … rather than
smuggled in via copy now."

## Problem Frame

The request asks the agent to (a) recommend a named supplement with study
backing and (b) offer a product to purchase. Verified against the code, **both
halves directly contradict a posture the founder locked two days earlier**:

- **Named supplements + doses are hard-blocked.** `src/lib/scribe/policy/forbidden-phrases.ts`
  lists `melatonin`, `magnesium <salt>`, `l-theanine`, `apigenin`, … and a bare
  dose pattern (`\b\d+\s?(mg|mcg|…)`); the sleep specialist system prompt
  (`src/lib/scribe/specialties/sleep-recovery/system-prompt.md`) says *"Never name
  medications or dosages … Behaviour suggestions belong with their clinician."*
  The sleep topic prompt (`src/lib/topics/prompts/sleep-recovery.ts`) makes the
  same rule output-rejecting.
- **The action vocabulary is closed.** `propose_next_steps`
  (`src/lib/scribe/tools/propose-next-steps.ts`) admits only
  `measure | track | discuss | behavior`, and validates every label against the
  forbidden-phrase set. `behavior` is sleep/training/routine only.
- **Agent-directed purchase was deliberately excluded.** Commerce exists only as
  a canned, preview-labelled **demo** (`docs/plans/2026-06-10-001-…-supply-purchase-plan.md`);
  there is no `Product`/`Order`/`Supply` schema, and "a flag does not waive the
  posture."
- **The posture is LOCKED, with reasons.** `docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md`
  excludes "named supplement recommendations, dose suggestions, and direct
  medication changes" as an explicit non-goal, on three aligned grounds (moat,
  liability, shippability), and names the directive layer's correct path as "a
  **regulated pathway or a clinician partner** … not smuggled in via copy now."

So the literal request can't ship as-is without a regulatory re-gate (MHRA
intended-purpose, EU MDR Rule 11). **But the user's underlying goal — a better,
more useful, escalating answer that ends in the product — is fully reachable
in-lane** by routing the pharmacological step through a clinician. That is the
design here.

Two assets already exist and are under-used:

- **The three-tier shape is already canon** in the sleep *topic page*
  (`Understanding` / `What you can do now` / `Discuss with a clinician`). The
  chat scribe simply doesn't lead with it. Tier 1 is a prompt-discipline change,
  not new capability.
- **A clinician-handoff substrate already exists**: `route_to_gp_prep`
  (produces a patient-voiced GP-prep question), the typed `discussWithClinician`
  out-of-scope route (`src/lib/scribe/policy/types.ts`), and the concierge
  `BookingRequest` flow (request → reference-only ops email → one-time in-app
  reveal, flag-gated, rate-limited — `src/app/api/booking/request/route.ts`).
  Tier 2/3 compose these rather than inventing an agent-purchase tool.

## Requirements Trace

- **R-A. Tier 1 leads with risk-free guidance.** For sleep questions (incl.
  "what should I take?"), the chat sleep specialist opens with concrete,
  evidence-based, zero-risk hygiene — consistent sleep/wake time, cool (~18 °C)
  dark bedroom, morning light, caffeine cutoff, wind-down, alcohol timing —
  surfaced as `behavior` next-steps, *before* any track/measure/discuss meta.
  The content is the same canon as the sleep topic page's "What you can do now".
- **R-B. Tier 2 is a clinician-mediated handoff, never a recommendation.** A
  supplement/medication question yields a grounded, evidence-aware
  **discuss-with-clinician** item: general (non-directive) evidence context + a
  specific patient-voiced question, plus an offer to arrange the clinician
  conversation. No named dose, no brand, no "you should take", no efficacy claim.
- **R-C. Tier 3 Supply is clinician-/user-initiated fulfilment.** A Supply offer
  appears only after a clinician conversation or on explicit user reorder, is
  fulfilled via a concierge request (reuse `BookingRequest` pattern),
  flag-gated (default off), and is framed as facilitating the user's/clinician's
  request — never an agent upsell.
- **R-D. Locked posture preserved end-to-end → no regulatory re-gate.** No
  forbidden-phrase pattern is removed; the action vocabulary is unchanged; every
  new prompt and surface passes the forbidden-phrase scan, the static-copy scan,
  AND the clinician-review checklist. No diagnosis, dose, causal-efficacy claim,
  or "you should take" anywhere on the path.
- **R-E. Grounded + honest separation of registers.** Evidence framing is
  general-information register, clearly separated from the user's own data; the
  clinician is the accountable line for anything pharmacological; Supply commerce
  stays flag-gated and gated on clinician/user initiation.
- **R-F. The escalation is auditable.** Tier transitions and the clinician
  handoff are recorded (reuse the scribe audit chain + the booking ops trail), so
  "why did the user see a Supply offer" is always answerable.

## Scope Boundaries

- **No autonomous supplement recommendation.** The agent never names a dose or
  brand, never says "take X", never asserts n=1 efficacy. No forbidden-phrase
  pattern is lifted. The "pharma specialist" is a *clinician-prep* role, bounded
  by construction to `discuss` / clinician-handoff output.
- **No live storefront in this plan.** Tier 3 fulfilment is a **concierge
  request** (mirroring `BookingRequest`), not a Stripe checkout with a
  `Product`/`Order` catalog. A real transactable storefront — with its own
  payment, tax, fulfilment, and advertising-law review — is a separate,
  separately-gated workstream. This plan deliberately stops at "request received,
  our team follows up".
- **No MHRA re-gate.** Stays in the wellness/information lane; the intended
  purpose is unchanged. (If a future decision wants the agent itself to make the
  pharmacological call, that is the posture-reversal path — explicitly out here.)
- **No new diagnostic capability.** No condition-naming, no differential ranking.
- **The clinician is a real dependency, not a UI label.** This plan assumes a
  real accountable clinician/pharmacist partner staffs the Tier-2 conversation
  (concierge ops at first). Tier 2/3 do not ship live until that human exists —
  see Open Questions.
- **Demo surface unchanged by default.** The existing canned `/demo/ask` supply
  sequence stands; this plan is about the *live* scribe. An optional alignment
  pass (Unit 5) only touches copy/labels if they drift from the live framing.

## Context & Research

### Relevant Code and Patterns

- **Chat scribe orchestration**: `src/lib/scribe/execute.ts` runs the per-topic
  tool loop; `src/lib/chat/turn.ts` wraps a turn, persists the `ChatMessage`, and
  persists validated actions *only after* `enforce()` classifies the answer
  `clinical-safe`. New behaviour is mostly prompt + tool-payload, not loop
  surgery.
- **Specialist referral**: `src/lib/scribe/tools/refer-to-specialist.ts` —
  depth-1, general-only, audit-chained (`parentRequestId`). A dedicated
  "medication & supplement review" specialist (Unit 3, optional) slots in here as
  a registry entry promoted stub→core.
- **Specialty registry**: `src/lib/scribe/specialties/registry.ts` — one-file
  taxonomy; `nutrition` already exists as a **stub**. A clinician-prep
  medication/supplement specialist is either a promotion of a stub or a new core
  entry with a `discuss`-only safety policy.
- **Safety policy + routes**: `src/lib/scribe/policy/types.ts` already defines
  `OutOfScopeRoute = 'discussWithClinician' | 'gpPrep'` and the `JudgmentKind`
  set (`citation-surfacing`, `investigation-avenues`, …). A clinician-prep policy
  uses only non-directive judgment kinds and `outOfScopeRoute:
  'discussWithClinician'`.
- **Clinician handoff tool**: `src/lib/scribe/tools/route-to-gp-prep.ts` — pure,
  produces `{ reason, suggestedQuestion }`, rendered as an "Add to GP prep"
  affordance by `InlineExplainCard`; folded into `gpPrep.questionsToAsk` at
  compile time. Tier 2 enriches this payload with an optional, non-directive
  `evidenceNote` + `category`.
- **Next-steps vocabulary + UI**: `src/lib/scribe/tools/propose-next-steps.ts`
  (closed verbs, label scanned) and `src/components/chat/next-steps.tsx`
  (`Try` = `behavior`, `Discuss`, `Measure`, `Track`). Tier 1 = richer `behavior`
  actions; Tier 2 = a `discuss` action bound to the clinician handoff.
- **Concierge fulfilment**: `src/app/api/booking/{request,reveal,cancel,ops}` +
  `prisma.BookingRequest` (`status: requested|arranged|delivered|cancelled`,
  encrypted redemption code, reference-only ops email, per-user rate-limit,
  flag `CONCIERGE_BOOKING_ENABLED`). Tier 3 mirrors this exactly for Supply
  (new `SupplyRequest` model or a `kind` discriminator on a shared request
  table), under a separate flag (default off).
- **Tier-1 content source of truth**: `src/lib/topics/prompts/sleep-recovery.ts`
  "What you can do now" — caffeine timing, morning light, **bedtime
  consistency**, wind-down, alcohol timing, **bedroom environment**. The chat
  specialist should draw from the *same* canon so the page and the chat agree.
- **Pricing SOT**: `src/lib/marketing/constants.ts` holds `DEMO_SUPPLY_PRICE`
  (deck $69/mo, deliberately `DEMO_`-prefixed). A live Supply constant is added
  only when/if Tier 3 goes transactable (out of this plan's default scope).
- **Compliance gates**: `src/lib/scribe/policy/enforce.ts` +
  `forbidden-phrases.ts` (LLM-output scan), `src/lib/compliance/static-copy.test.ts`
  (static copy scan over `src/app`, `src/components`, scoped `src/lib/demo`),
  `src/lib/llm/linter.ts`, and the **human** gate
  `docs/compliance/clinician-review-checklist.md` (tone/causation/severity —
  what the scanners can't catch). All four apply to everything this plan adds.

### Institutional Learnings

- **The posture is enforced in copy, and copy drifts** (2026-06-17 memo): "the
  one thing to do", "what worked", "our clinicians decide what's next" creep back
  because they're more compelling. The fixed action-vocabulary table in
  `docs/brand-guidelines.md` + the clinician-review checklist are the human gate;
  this plan adds to those, it does not weaken them.
- **Descriptive-register booking precedent**: plan 2026-06-06-001 (priority
  get-tested path) established the concierge `BookingRequest` flow and its
  reference-only ops discipline (no health data in email/logs; row-then-email
  -then-delete-on-failure). Tier 3 reuses that discipline verbatim.
- **The "as-if" honesty bar**: the demo-supply plan (2026-06-10-001) is allowed
  to *show* the layer only because it is preview-labelled and non-transactable.
  The live path must clear a higher bar — a real clinician and a real
  fulfilment, or it does not ship.
- **Generic nutrient nouns vs named salts**: per the demo plan's research, the
  static scan does not trip on bare "magnesium" but does on `magnesium glycinate`
  / doses. The safe stance: the agent frames the *category and the question*; the
  *clinician* names specifics. Tier-2 copy is authored against the named pattern
  families from the start.

## Governing Tension — RESOLVED (clinician-mediated middle, reuben, 2026-06-19)

The request, read literally, is a directive, managed-care posture (agent names a
supplement, asserts study-backed efficacy, and sells a product). The locked
posture is the opposite. **Resolution, chosen by the founder during planning:
the clinician-mediated middle.** Tier 1 ships live within the locked posture;
Tier 2 reframes the "pharma specialist" as a *clinician-prep* role whose output
is bounded to `discuss` / clinician-handoff (the accountable human is the line);
Tier 3 is concierge fulfilment of a clinician-/user-initiated request, not an
agent upsell. This is exactly the "regulated pathway / clinician partner" route
the 2026-06-17 memo names — it keeps the felt promise *and* the lane, and ships
without a regulatory re-gate.

The one non-code dependency this resolution creates: **a real accountable
clinician/pharmacist must staff Tier 2** before it goes live. Code can land
behind a flag; the live flip waits on the human.

## Key Technical Decisions

- **The "pharma agent" is a clinician-prep role, bounded by construction — not a
  recommender.** Two ways to realise it; the plan phases them:
  - **Phase 1 (Unit 2), default**: an *escalation pattern* in the existing sleep
    + general scribes plus an enriched clinician-handoff payload. No new
    specialist, no new safety policy, fastest path to the better answer.
  - **Phase 2 (Unit 3), optional**: promote a dedicated **"Medication &
    supplement review"** specialty (stub→core in the registry) with a
    `discuss`-only safety policy (`allowedJudgmentKinds` = `citation-surfacing` +
    `investigation-avenues`; `outOfScopeRoute: 'discussWithClinician'`; the full
    forbidden-phrase set). This honours the user's "refer to a pharma specialist"
    mental model and makes the bound *structural* (the specialist literally
    cannot emit a recommendation), but needs its own prompt + advisor sign-off.
  Recommendation: ship Phase 1 first; promote to Phase 2 if handoff quality or
  the referral UX demands it.
- **Tier 1 reuses the topic-page canon, it does not re-invent hygiene advice.**
  The sleep specialist system prompt gains a "lead with risk-free guidance"
  section drawn from `topics/prompts/sleep-recovery.ts`'s "What you can do now",
  so the chat and the page never disagree. Surfaced as `behavior` next-steps.
- **Tier 2 enriches `route_to_gp_prep`, it does not add a recommend tool.** Add
  optional `evidenceNote` (general, non-directive, ≤ N chars, scanned) and
  `category` to the handoff payload; render them in the InlineExplainCard /
  GP-prep as "context for your clinician". Route via `discussWithClinician`. The
  evidence text comes from a **curated, clinician-reviewed evidence-note set**
  (see Open Questions), not free LLM citation of studies.
- **Tier 3 reuses `BookingRequest` machinery; it does not add an agent purchase
  tool.** A `SupplyRequest` flow (new model, or a `kind` on a generalised request
  table) mirrors the concierge pattern: reference-only ops email, one-time
  reveal, per-user rate-limit, flag `SUPPLY_CONCIERGE_ENABLED` (default off). The
  Supply card is gated on a prior clinician-discussion record OR an explicit
  user-initiated reorder — never offered unprompted by the agent. Pricing stays
  `DEMO_SUPPLY_PRICE` until a real transactable launch (out of scope).
- **Enforcement is additive, never subtractive.** No forbidden-phrase pattern is
  removed. New fixtures pin that the *entire escalation path* (Tier 1→2→3) emits
  no dose, brand, "take", or efficacy claim — including the new `evidenceNote`
  field, which is scanned with the same gate as action labels. Every new prompt
  and surface goes through the clinician-review checklist with a recorded sign-off.

## Open Questions

### Resolved During Planning
- Posture → **clinician-mediated middle** (Governing Tension above).
- Where the escalation lives → the **live chat scribe** (sleep specialist +
  general), not the demo.
- Tier-3 mechanism → reuse concierge `BookingRequest` pattern, flag-gated,
  default off; no Stripe/Product/Order in scope.
- "Pharma specialist" realisation → escalation pattern first (Phase 1), dedicated
  clinician-prep specialty optional (Phase 2).

### Deferred to Implementation
- Exact Tier-1 hygiene checklist wording and how many `behavior` actions surface
  at 320 px without crowding the answer (visual audit decides).
- The shape of the enriched handoff payload (`evidenceNote` length cap, whether
  `category` is an enum) and its render in `InlineExplainCard`.
- `SupplyRequest` as a new model vs. a `kind` discriminator on a shared request
  table (DRY vs. blast-radius on the booking flow's tests).
- Whether the Supply gate reads a persisted "clinician-discussion happened"
  signal or a lighter user-initiation flag for the first cohort.

### Open for Reuben
- **Clinician staffing for Tier 2.** Who is the accountable
  clinician/pharmacist, and is the first version concierge-ops-mediated (email
  loop, like booking) or a scheduled consult? Tier 2/3 do not flip live until
  this is answered. *(Hard dependency.)*
- **Evidence-note library.** Source and ownership of the curated, clinician
  -reviewed general-information snippets ("the evidence on magnesium timing is
  …") the handoff surfaces — so the agent is not free-citing studies. Who
  authors/reviews them?
- **Supply catalogue + claims.** Which products, the sourcing / third-party
  -tested framing, and whether/when Tier 3 becomes transactable (which reopens
  advertising-law + payment scope, separate from this plan).
- **Phase 2 go/no-go.** Do you want the dedicated "Medication & supplement
  review" specialist now (matches your "refer to the pharma agent" model), or is
  the Phase-1 escalation pattern enough to start?

## Implementation Units

- [x] **Unit 1: Tier 1 — risk-free guidance leads the sleep answer** *(done 2026-06-19 — sleep + general scribes lead with hygiene `behavior` steps; ships on merge after clinician-checklist sign-off)*

  **Goal:** The chat sleep specialist opens supplement/sleep questions with
  concrete, zero-risk hygiene guidance as `behavior` next-steps, drawn from the
  topic-page canon — shippable alone, fully in-lane.

  **Requirements:** R-A, R-D

  **Dependencies:** None

  **Files:**
  - Modify: `src/lib/scribe/specialties/sleep-recovery/system-prompt.md`
    ("Lead with risk-free guidance" section; the hygiene canon; "name the
    category, route specifics to a clinician" for anything pharmacological).
  - Modify: `src/lib/scribe/specialties/general/system-prompt.md` (sleep
    escalation note so the general scribe leads the same way before referring).
  - Add: tests/fixtures asserting a supplement-shaped question yields
    hygiene `behavior` actions and no forbidden phrase (extend
    `propose-next-steps`/turn fixtures or `guardrail-fixtures.ts`).

  **Approach:** Prompt-only behaviour change; reuse `propose_next_steps` with
  `behavior` verbs. Canon lifted verbatim from `topics/prompts/sleep-recovery.ts`
  "What you can do now" so chat and page agree.

  **Test scenarios:** supplement question → answer leads with hygiene; ≥1
  `behavior` action; zero forbidden-phrase hits; no "track/measure/discuss"-only
  answer. Enforce() classifies `clinical-safe`.

  **Verification:** `npx vitest run src/lib/scribe src/lib/chat` green; one
  manual `/ask` transcript in the PR.

- [x] **Unit 2: Tier 2 — clinician-mediated supplement handoff (Phase 1)** *(done 2026-06-19 — `route_to_gp_prep` carries a curated evidence note; landed DARK behind SUPPLEMENT_HANDOFF_ENABLED + per-note clinician sign-off; UI card render deferred to flag-flip)*

  **Goal:** A supplement/medication question produces a grounded, evidence-aware
  `discuss`-with-clinician item + an offer to arrange the conversation — never a
  recommendation.

  **Requirements:** R-B, R-D, R-E, R-F

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/lib/scribe/tools/route-to-gp-prep.ts` (+ schema/types) to carry
    optional non-directive `evidenceNote` + `category`, scanned with the
    forbidden-phrase gate.
  - Modify: the InlineExplainCard / GP-prep render to show the handoff context.
  - Modify: sleep + general system prompts (escalation pattern: pharmacological
    question → enriched `route_to_gp_prep` via `discussWithClinician`).
  - Add: a curated evidence-note set (clinician-reviewed snippets) + a loader.
  - Add: tests pinning the handoff shape and that `evidenceNote` cannot smuggle a
    dose/brand/"take".

  **Approach:** No new "recommend" tool — the existing handoff, enriched. The
  scribe frames the category and the patient-voiced question; the clinician owns
  specifics. Audit via the existing scribe request chain.

  **Test scenarios:** "should I take magnesium for sleep?" → Tier-1 hygiene +
  a `discuss` action bound to a clinician handoff whose `evidenceNote` is general
  -register and scan-clean; never a dose/brand/efficacy claim; `discussWithClinician`
  route fires. Adversarial fixture: a planted "take 200 mg magnesium glycinate"
  in any field is dropped.

  **Verification:** vitest green incl. forbidden-phrase fixtures; clinician
  -review checklist signed off on the new copy/prompt (recorded on the PR).

- [x] **Unit 3 (optional, Phase 2): dedicated "Medication & supplement review" clinician-prep specialist** *(done 2026-06-19 — core specialty with a discuss-only policy (citation-surfacing + investigation-avenues), discussWithClinician route, forbidden-phrase backstop; referable via refer_to_specialist; no flag — safe by policy; needs clinician-checklist sign-off before merge)*

  **Goal:** Honour the "refer to the pharma specialist" model with a real core
  specialty whose output is structurally bounded to clinician-prep.

  **Requirements:** R-B, R-D, R-F

  **Dependencies:** Unit 2; **Open-for-Reuben "Phase 2 go/no-go"**

  **Files:**
  - Modify: `src/lib/scribe/specialties/registry.ts` (promote/add a core entry).
  - Add: `src/lib/scribe/specialties/medication-supplement/system-prompt.md`.
  - Add: `src/lib/scribe/policy/medication-supplement.ts` (`discuss`-only
    judgment kinds; `outOfScopeRoute: 'discussWithClinician'`; full
    forbidden-phrase set).
  - Modify: general system prompt (mention the new referable specialist).

  **Approach:** Reuse `refer_to_specialist` (depth-1, audit-chained). The policy
  makes the recommendation-bound *structural*: the specialty cannot emit a
  treatment-directive judgment kind. Advisor sign-off required before core status
  ships.

  **Test scenarios:** referral runs, returns a clinician-prep response;
  `core-specialists.test.ts` parity (prompt + policy non-null); enforce() rejects
  any recommend-shaped output from the new policy.

  **Verification:** vitest green; advisor sign-off recorded; only then flip the
  registry entry to `core`.

- [ ] **Unit 4: Tier 3 — clinician-/user-initiated Supply fulfilment (concierge)**

  **Goal:** A flag-gated Supply request flow, mirroring `BookingRequest`,
  surfaced only after a clinician discussion or an explicit user reorder.

  **Requirements:** R-C, R-D, R-E, R-F

  **Dependencies:** Unit 2 (gate signal); **Open-for-Reuben "Clinician staffing"
  + "Supply catalogue"**

  **Files:**
  - Modify: `prisma/schema.prisma` (`SupplyRequest`, or a `kind` on a shared
    request table) + migration.
  - Add: `src/app/api/supply/request` (+ reveal/cancel/ops as needed), reusing
    the booking rate-limit + reference-only-ops-email + delete-on-failure
    discipline.
  - Add: a Supply card surfaced *only* when the gate (clinician-discussion record
    or user-initiated reorder) is satisfied; facilitation copy only.
  - Add: env flag `SUPPLY_CONCIERGE_ENABLED` (default off).

  **Approach:** Copy the `BookingRequest` route's safety patterns verbatim
  (no health data in email/logs, refund rate-limit on failure, no orphan rows).
  No agent purchase tool; the card is gated UI, not an agent-emitted upsell.
  Pricing from constants (`DEMO_SUPPLY_PRICE` until a real launch).

  **Test scenarios:** gate closed → no Supply card; gate open → request creates a
  row + ops email; email failure → row deleted + slot refunded; flag off → 404;
  no "you should take/buy" copy (scan-clean).

  **Verification:** vitest green; flag stays **off** in prod until clinician
  staffing + catalogue resolved; visual audit of the card (desktop + mobile).

- [ ] **Unit 5: Compliance, honesty, and human-gate pass** *(partial 2026-06-19 — the human-enforcement docs are done: brand-guidelines.md gains the clinician-mediated supplement section, clinician-review-checklist.md gains the handoff gates + the merge-gate trigger for Units 1 & 3. The path-wide fixtures and Supply-card copy wait on Unit 4.)*

  **Goal:** The whole escalation tells the truth and stays in-lane; the PR carries
  the proof.

  **Requirements:** R-D, R-E

  **Dependencies:** Units 1–4

  **Files:**
  - Add: forbidden-phrase + static-copy fixtures covering the Tier 1→2→3 path
    (incl. `evidenceNote` and the Supply card copy).
  - Modify: `docs/brand-guidelines.md` + `docs/compliance/clinician-review-checklist.md`
    (record that the supplement path is clinician-mediated; add a checklist line
    for the handoff/Supply surfaces).
  - Modify (if drift found): the demo supply copy to match the live framing.

  **Approach:** One copy-review pass against the scan families, the descriptive
  register, and the checklist; visual audit of any new UI; recorded clinician
  sign-off.

  **Test scenarios:** full `npx vitest run` green incl. compliance scans; lint
  clean; checklist sign-off recorded on the PR.

  **Verification:** desktop + mobile screenshots of the escalation in the PR
  description; sign-off field populated.

## System-Wide Impact

- **Live posture unchanged**: no forbidden-phrase pattern removed, action
  vocabulary intact, MHRA intended-purpose lane unchanged → no regulatory re-gate.
- **Scribe loop**: Tiers 1–2 are prompt + tool-payload changes; the executor/turn
  loop and the `enforce()` contract are untouched in shape (one new optional
  payload field, scanned).
- **Schema**: one additive model (`SupplyRequest`) or a discriminator on the
  request table; migration is additive, flag-gated, default off.
- **Compliance surface**: gains coverage (new fixtures + checklist lines); it is
  strengthened, never loosened.
- **Demo**: unaffected by default; Unit 5 only realigns copy if it drifts.
- **Ops**: Tier 2/3 create a real operational dependency (a clinician + a Supply
  fulfilment loop) — code lands behind flags; live flips wait on those humans.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Copy drifts from "discuss with a clinician" into a recommendation over edits | Forbidden-phrase scan + static-copy scan on every push; clinician-review checklist as the human gate; `evidenceNote` scanned like an action label; recorded sign-off |
| Tier 3 read as a live storefront / agent upsell | Concierge-request only (no payment), gated on clinician/user initiation, `SUPPLY_CONCIERGE_ENABLED` default off, facilitation-only copy |
| Tier 2 ships before a real clinician exists (handoff to nobody) | Hard Open-for-Reuben dependency; flags stay off until staffing resolved; code can land dark |
| `evidenceNote` becomes a backdoor for study-cherry-picking / overclaim | Curated, clinician-reviewed evidence-note set (not free LLM citation); general-register, length-capped, scanned |
| Posture-reversal creep (the literal request) sneaks back in | This plan is explicitly the in-lane route; any agent-makes-the-call version is a separate posture decision + re-gate, named out of scope |
| New `SupplyRequest` regresses the booking flow's safety tests | Reuse the exact `BookingRequest` patterns + tests; prefer additive model over editing the booking route |
| Pricing fiction mistaken for launched pricing | Keep `DEMO_SUPPLY_PRICE` until a real transactable launch; no un-prefixed Supply constant in this plan |

## Sources & References

- **Origin**: user request (reuben, 2026-06-19); governing posture confirmed via
  AskUserQuestion → clinician-mediated middle.
- **Locked posture**: docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md
  (in-lane lock, intervention-posture exclusion, "regulated pathway / clinician
  partner" route); docs/brand-guidelines.md (action-vocabulary table);
  docs/compliance/clinician-review-checklist.md (human gate).
- **Related plans**: docs/plans/2026-06-06-001-feat-priority-get-tested-path-plan.md
  (concierge `BookingRequest`, descriptive register), docs/plans/2026-06-10-001-feat-demo-studio-booking-and-supply-purchase-plan.md
  (Supply as preview-labelled demo, pricing SOT), docs/plans/2026-04-25-001-feat-synthetic-demo-and-referral-scribes-plan.md
  (refer-to-specialist lineage), docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md
  (safety-policy types).
- **Code**: src/lib/scribe/specialties/{sleep-recovery,general}/system-prompt.md,
  src/lib/scribe/specialties/registry.ts, src/lib/scribe/policy/{types,forbidden-phrases,sleep-recovery}.ts,
  src/lib/scribe/tools/{route-to-gp-prep,refer-to-specialist,propose-next-steps}.ts,
  src/lib/topics/prompts/sleep-recovery.ts, src/components/chat/next-steps.tsx,
  src/app/api/booking/request/route.ts, prisma/schema.prisma (BookingRequest),
  src/lib/marketing/constants.ts, src/lib/compliance/static-copy.test.ts.

## Next Steps

- Resolve the four **Open for Reuben** items — clinician staffing (Tier 2/3
  blocker), evidence-note library, Supply catalogue/claims, and Phase-2 go/no-go.
  Only the first blocks a live Tier 2/3 flip; Unit 1 (Tier 1) can start now.
- `/ce:work` this plan: **Unit 1 first** (immediate, in-lane value), then Unit 2;
  Units 3–4 gated on the Open-for-Reuben answers; Unit 5 closes out.
- The live flips for Tier 2/3 stay **flag-off** until a real accountable clinician
  and a real Supply fulfilment loop exist — code can land dark behind the flags.
