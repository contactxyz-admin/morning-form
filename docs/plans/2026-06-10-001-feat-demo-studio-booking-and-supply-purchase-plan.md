---
title: "feat: Demo commerce — Studio blood-draw booking + Supply purchase, agent-led in the canned chat"
type: feat
status: active
date: 2026-06-10
origin: user request (demo the deck's Layer I + Layer III through the chat agent); relates to docs/brainstorms/2026-06-05-deck-product-gap-requirements.md
---

# feat: Demo commerce — Studio blood-draw booking + Supply purchase, agent-led in the canned chat

## Overview

The deck sells a three-layer product: **Studios** (Layer I, acquisition, $299 visit, pilot at month 9), **Form Intelligence** (Layer II, the shipped product), **Supply** (Layer III, the hero, $69/mo). The public demo today shows only Layer II. This plan adds two scripted, interactive sequences to `/demo/ask` so a visitor experiences the full vision through the agent: (1) the assistant books the persona's next blood draw at a **Morning Form Studio** — answer → studio card → tap a slot → confirmation; (2) the assistant helps the visitor **purchase a Supply product sourced by Morning Form** — restock request → product card → confirm → order confirmation. Everything stays canned, client-side, and public: no LLM call, no schema change, no payment, no new flags. The wow is interaction, not infrastructure.

## Problem Frame

The demo's chat tab (`src/app/demo/ask/page.tsx`) is four single-turn Q/A swaps — it demonstrates grounded answers and specialist referrals, then stops exactly where the deck's story gets interesting: *acting* on the answer. Verified in code: no Studio, Appointment, Slot, Product, or Order model exists anywhere (`prisma/schema.prisma`); the only booking machinery is the concierge `BookingRequest` (gift-code mechanic, real ops email loop — plan 2026-06-06-001), and Supply commerce is explicitly "a future phase" (brainstorm 2026-06-05, Scope Boundaries). The live scribe cannot demo these flows either: agent-directed supplement purchase is an intervention posture the May pivot excluded, and the brainstorm rejected "as-if-studios" slot UX for real users. The demo surface is the one place the full loop can be shown today — and its own docstring names the extension path ("canned keeps it cheap and safe to share publicly").

## Requirements Trace

- R-A. **Studio booking sequence**: from a suggestion chip, the visitor sees a grounded answer tied to the synthetic persona's narrative (the HbA1c reversal worth confirming next quarter), a Studio card with location + tappable slots, and — on tap — a booked confirmation with reference and what-happens-at-the-draw copy.
- R-B. **Supply purchase sequence**: from a chip, the visitor sees the agent respond to a *user-initiated* restock request with a Supply product card (named product, sourced/third-party-tested framing, $69/mo), and — on confirm — an order confirmation.
- R-C. **Canned and contained**: both sequences are deterministic client-side state; no DB writes, no LLM, no payment, no auth, no new env flags. The real `/ask` surface and its types are untouched.
- R-D. **Scan-safe, posture-safe copy**: all new copy passes the static-copy compliance scan and keeps the descriptive register; the purchase is framed as the user's request that the agent facilitates — the agent never directs supplementation, even in fiction.
- R-E. **Honest labelling**: the surface keeps its "pre-recorded" framing; Studio and Supply cards carry an explicit preview tag (these layers are not yet launched); the footer caption says bookings/orders are simulated.
- R-F. **Pricing/naming single source of truth**: $299 studio visit and $69/mo Supply come from `src/lib/marketing/constants.ts`, aligned with the deck — never literals in components.

## Scope Boundaries

- **No live agent tools.** `book_studio_draw` / `purchase_supply` scribe tools, policy judgment kinds for commerce, and flag-gated live wiring are all out. Every gate (advisor review, Stripe pause, studios existing, the intervention posture) fires before a live version is honest — that is the real Supply/Studio workstream, not this demo.
- **No schema or API changes.** No Studio/Product/Order models, no reuse of `BookingRequest` (it triggers real ops email + rate-limit machinery for fiction).
- **No Decisions-timeline writes.** The confirmation copy may *say* "this lands in your Decisions timeline" as product narrative; it does not seed or render timeline state.
- **`/demo` overview and `/demo/record` untouched** (an overview teaser chip is an open question, default no).
- **No payment simulation theater** (no fake card sheets / Apple Pay mockups) — a single confirm affordance and an order-confirmed state.

## Context & Research

### Relevant Code and Patterns

- **The canned surface**: `src/app/demo/ask/page.tsx` — `CannedTurn { id, question, answer, topicKey, referrals, citations?: never[] }`, suggestion chips swap the visible turn, renders through the real `MessageList`/`MessageBubble`. Citations are typed `never[]` because the `<Mention>` chip calls an authed provenance endpoint — that contract carries over to every new sequence.
- **Bubble contract is closed**: `src/components/chat/message-bubble.tsx` exports `BubbleModel = UserBubbleModel | AssistantBubbleModel` (no card slot); `message-list.tsx` is a plain `gap-6` mapper with autoscroll. Cards therefore render in a demo-local stack composed *around* exported `MessageBubble`s — the shared chat types never change.
- **Demo component home**: `src/components/demo/` (`demo-tab.tsx`, `demo-graph-section.tsx`; `sparkline.tsx` was promoted out in Phase B) — new cards live here.
- **Compliance scan is an allowlist of roots and a skip-list of names**: `src/lib/compliance/static-copy.test.ts` — `SCAN_ROOTS` includes `src/app` and `src/components` (new copy is scanned automatically), but the walker **skips any filename containing "fixtures"** and any `.test.ts`. The forbidden families: named drugs (incl. ferrous salts), dose quantities (`14mg`, `1000 IU`, `1g`), medication/dose directives, and `take <n> tablet|capsule|pill...`. Generic nutrient nouns ("magnesium") don't trip the static scan, but product copy stays brand-level anyway (R-D).
- **Persona truth to write against**: `prisma/fixtures/synthetic/metabolic-persona.ts` — HbA1c 5.85 → 6.10 (peak) → 5.78; sleep efficiency 81 → 85.5%; HRV 38 → 47 ms; quarterly lab cadence. The booking sequence is "confirm the reversal at the next quarterly draw"; the supply sequence ties to the recovery narrative.
- **Pricing SOT precedent**: `src/lib/marketing/constants.ts` holds `MEMBERSHIP_PRICE` per market; the acquisition plan (2026-05-06-001) established the no-literal-prices discipline. `SUPPLY` ($69/mo) and `STUDIO_VISIT` ($299) constants do not exist yet — added here.
- **Test reality**: vitest `environment: 'node'`, zero `.test.tsx`, UI verified by the visual-audit gate. So the sequence logic must be a pure, lib-level state machine with node tests; components stay thin.

### Institutional Learnings

- Parallel-implementation check ran clean: no sibling booking/shop/order surfaces under `src/app` (`search-adjacent-dirs-before-planning-2026-05-16.md` discipline).
- Visual audit is non-optional for new UI — desktop + mobile screenshots on the PR (`visual-audit-non-optional-ui-gate-2026-05-16.md`).
- The "as-if-studios" rejection (brainstorm 2026-06-05) was about *deceiving real users at the slot step*. A pre-recorded, preview-labelled demo presenting the deck's own roadmap is a different claim — but only if the labelling does the work; R-E is load-bearing, not decoration.

## Key Technical Decisions

- **Canned-interactive on the public demo, not live tools** (the central decision). Rejected: live scribe tools behind a demo flag — requires commerce judgment kinds in the safety policy, advisor review of agent-led purchase language, and infrastructure (products, orders, payment) that is deliberately paused; a flag does not waive the posture. Rejected: wiring the concierge `BookingRequest` — real ops emails and rate-limit slots consumed by a public fiction. Rejected: canned-static (just two more Q/A swaps) — fails the "agent helps you" brief; the tap-a-slot / confirm-order interaction *is* the demo.
- **Sequences, not turns**: the canned model generalizes from `CannedTurn` to a sequence of steps — `bubble` steps (existing `BubbleModel` content) and `card` steps (`studio-booking` / `supply-order`) — advanced by a pure reducer in `src/lib/demo/ask-sequences.ts`. Existing four turns become single-step sequences; zero visual change to them. The reducer is the unit-testable core (node vitest); the page stays a thin `useState` consumer.
- **Compose around `MessageBubble`, never extend `BubbleModel`**: the demo page renders its own `gap-6` column interleaving exported `MessageBubble`s and the two new cards. The real `/ask` types and `MessageList` are untouched (no demo variants leaking into the live chat contract). Citations stay `never[]` per the existing contract.
- **Content module is scanned by construction**: sequence copy lives in `src/lib/demo/ask-sequences.ts` and the card components — both under `SCAN_ROOTS`. The filename deliberately avoids the substring "fixtures" (the walker skips those names — naming it `demo-fixtures.ts` would silently unscan the exact copy this plan most needs scanned).
- **User-initiated purchase framing**: the supply chip is the *user* asking to reorder ("I'm nearly out of my Form stack — can you reorder it?"); the agent's answer is descriptive (what the stack is, sourced and third-party tested by Morning Form, tied to the recovery protocol) and facilitates the user's request. No "you should take/add" anywhere; no compounds, no doses, no capsule counts (R-D). This keeps the demo consistent with the May posture even as marketing fiction.
- **Honesty tags on the cards**: each card carries a mono label in the established register — Studio card: `Studios · pilot preview`; Supply card: `Supply · launching soon` (exact strings at build, copy-reviewed). Footer caption gains "bookings and orders here are simulated." The header's "pre-recorded" framing stays.
- **Deterministic-but-fresh slots**: `upcomingSlots(now: Date)` pure helper returns the next 2–3 weekday-morning slots ("Thu 12 Jun · 8:40"); `now` injected for tests, called with `new Date()` in the client component. No hardcoded dates that rot in the demo.
- **Pricing from constants**: `STUDIO_VISIT_PRICE` and `SUPPLY_PRICE` added to `src/lib/marketing/constants.ts` (display-string + minor-units shape, matching `MEMBERSHIP_PRICE`); cards import them. Deck values: $299 visit, $69/mo.

## Open Questions

### Resolved During Planning
- Where the flows live → public canned `/demo/ask`, interactive sequences (central decision above).
- Live tools / flags / schema → all rejected for this scope (Scope Boundaries).
- How cards meet the chat UI → demo-local stack around exported `MessageBubble`; shared types untouched.
- Scan coverage → automatic via `SCAN_ROOTS`, with the "fixtures"-filename trap named.

### Deferred to Implementation
- Exact card microcopy (slot labels, confirmation lines, preview tags) — authored against the scan patterns, joins the copy-review pass (U4).
- Slot count and rendering at 320px (2 vs 3 slots; chip wrap) — visual audit decides.

### Open for Reuben
- **Studio city**: default **"Morning Form Studio — SoHo, New York"** (deck is US-first; NYC is a named warm-partnership city). London instead is a one-string change in the content module.
- **Supply product name**: placeholder **"Form Supply — Recovery Stack"** (ties to the persona's sleep/HRV arc). Naming is brand strategy; flag before the PR merges.
- **Presentation of $69/mo**: default monthly-subscription framing per the deck; a one-off purchase framing is a copy swap.
- Whether `/demo` (overview) gets a one-line teaser pointing at the new chips — default no.

## Implementation Units

- [ ] **Unit 1: Pricing constants + sequence engine + content**

**Goal:** The two sequences exist as data + a pure state machine, fully tested, scan-covered.

**Requirements:** R-C, R-D, R-F

**Dependencies:** None

**Files:**
- Modify: `src/lib/marketing/constants.ts` (`STUDIO_VISIT_PRICE`, `SUPPLY_PRICE`)
- Create: `src/lib/demo/ask-sequences.ts` (types: `DemoSequence`, `DemoSequenceStep`, `DemoAskItem`; reducer `advanceSequence`; `upcomingSlots(now)`; the booking + supply sequence content; existing four turns re-expressed as single-step sequences)
- Create: `src/lib/demo/ask-sequences.test.ts` (node vitest)

**Approach:** Steps are `{ kind: 'bubble', bubble: BubbleModel }` or `{ kind: 'studio-card' | 'supply-card', ... }`; reducer input is `(sequence, event: 'select' | 'slot-picked' | 'order-confirmed')` returning the visible item list — no component state beyond the active sequence id + event log. Slot helper rolls forward to the next weekday mornings from injected `now`.

**Test scenarios:**
- Happy path: booking sequence advances select → slot-picked → confirmation items in order; supply sequence select → order-confirmed.
- Edge: `upcomingSlots` on a Friday evening / Sunday returns Monday-first slots; injected `now` makes assertions exact.
- Edge: re-selecting a sequence resets its state (chips behave like today's turn swap).
- Integration: static-copy scan passes over the new module (it runs in the same suite — a planted-phrase check is unnecessary, the root is already characterized).

**Verification:** `npx vitest run src/lib/demo src/lib/compliance` green.

- [ ] **Unit 2: Studio booking card + sequence wiring**

**Goal:** R-A end-to-end on `/demo/ask`.

**Requirements:** R-A, R-C, R-E

**Dependencies:** Unit 1

**Files:**
- Create: `src/components/demo/studio-booking-card.tsx` (location line, `Studios · pilot preview` tag, `STUDIO_VISIT_PRICE`, slot chips, post-pick booked state with reference e.g. `MF-STU-4821`)
- Modify: `src/app/demo/ask/page.tsx` (chips render sequences; demo-local item stack interleaving `MessageBubble` + cards; autoscroll-on-advance mirroring `MessageList`'s effect)

**Approach:** New chip: "Can you book my next HbA1c draw?" Assistant bubble answers in persona ("the reversal is worth confirming at your next quarterly draw — I can hold a slot at the Studio"), card renders below it; slot tap appends the confirmation bubble (draw mechanics in the descriptive register: a standard venous draw, results land in your record) and flips the card to its booked state. Card visual language: `rounded-card border border-border bg-surface` family, mono caption labels — match the existing surface, not a new design system.

**Test scenarios:** (logic covered in U1; this unit's checks are visual/manual)
- Chip → answer + card; slot tap → booked card + confirmation bubble; switching chips away and back resets.
- 320px: slot chips wrap without truncation; card stays inside the 85% bubble column.

**Verification:** Visual audit screenshots (desktop + mobile) of pre-pick and booked states on the PR.

- [ ] **Unit 3: Supply order card + sequence wiring**

**Goal:** R-B end-to-end on `/demo/ask`.

**Requirements:** R-B, R-C, R-D, R-E

**Dependencies:** Unit 1 (Unit 2's page wiring lands first; this unit adds the second sequence)

**Files:**
- Create: `src/components/demo/supply-order-card.tsx` (product name, `Supply · launching soon` tag, sourced/third-party-tested line, `SUPPLY_PRICE`, confirm affordance, ordered state with reference e.g. `MF-SUP-1107`)
- Modify: `src/app/demo/ask/page.tsx` (register the supply sequence chip)

**Approach:** Chip: "I'm nearly out of my Form stack — can you reorder it?" Assistant bubble: descriptive framing of the stack as part of the persona's recovery protocol, sourced and tested by Morning Form — facilitation language only ("I can place the reorder — confirm below"), never recommendation language. Confirm tap → ordered card state + confirmation bubble (dispatch framing, "manage it any time" narrative line). Copy authored against every forbidden family in the scan (no compounds, doses, capsule counts, or directive verbs).

**Test scenarios:**
- Confirm advances to ordered state exactly once (idempotent tap).
- Static-copy scan green over the final card copy.
- 320px wrap check.

**Verification:** Visual audit screenshots of pre-confirm and ordered states; full vitest suite green.

- [ ] **Unit 4: Copy, honesty, and audit pass (the gate)**

**Goal:** The surface tells the truth and looks institutional; the PR carries the proof.

**Requirements:** R-D, R-E

**Dependencies:** Units 2–3

**Files:**
- Modify: `src/app/demo/ask/page.tsx` (footer caption: pre-recorded + "bookings and orders here are simulated"; intro paragraph mentions the agent can also arrange tests and Supply)
- Modify (if needed from review): card copy in U2/U3 files

**Approach:** Single copy-review pass across both sequences against (a) the scan families, (b) the descriptive register, (c) the preview-label honesty bar; then the visual audit. New demo copy is marketing-voice, not clinical guidance — it does not enter the clinical-advisor packet, but the Studio draw-mechanics line follows the test-routes register ("a standard venous blood draw") so nothing here outflanks plan 2026-06-06-001's content discipline.

**Test scenarios:** full suite green (`npx vitest run`), including the compliance scan; lint clean.

**Verification:** Desktop + mobile screenshots of: chips row, booking pre/post, supply pre/post, footer caption — on the PR description.

## System-Wide Impact

- **No schema, no API, no auth surface, no env**: the change is two components, one lib module, one page, one constants addition.
- **Real chat untouched**: `BubbleModel`, `MessageList`, turn loop, tools, and policies unchanged — the demo composes around exported components only.
- **Compliance scan**: new copy is inside existing `SCAN_ROOTS`; no roots added; the "fixtures"-filename skip is avoided by naming.
- **`/api/health/demo`**: unaffected (it checks seeded persona data, not the ask page).
- **SEO/sharing**: `/demo` layout already carries noindex; nothing new is indexable.
- **Unchanged invariants**: citations empty on the public surface; concierge booking (real) and the Decisions timeline are not written to by demo fiction.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Demo fiction read as live capability (investor or visitor) | R-E labels: pre-recorded header, per-card preview tags, simulated-orders caption; this is the condition under which the "as-if-studios" rejection doesn't apply |
| Supply copy drifts into directive register over edits | Copy lives in scanned roots; U4 review pass; user-initiated framing is structural (the chip text itself is the request) |
| Compliance scan trips late in the PR | Copy authored against the named pattern families from the start (they're quoted in this plan); scan runs in the normal suite on every push |
| Slot dates go stale or flake in CI | `upcomingSlots(now)` is pure with injected `now`; component passes `new Date()`; no fixed dates in content |
| Card visuals drift from the chat surface (AI-slop risk) | Reuse `MessageBubble` for all conversation content; cards use the existing card/mono-label idiom; visual audit is the gate |
| Deck pricing changes ($299/$69) | Single constants source; one-line change |

## Sources & References

- **Origin context:** docs/brainstorms/2026-06-05-deck-product-gap-requirements.md (three layers, Supply deferred, as-if-studios rejection, "a known demo date justifies reordering")
- Related plans: docs/plans/2026-06-06-001-feat-priority-get-tested-path-plan.md (real booking; descriptive register), docs/plans/2026-06-06-002-feat-decisions-that-compound-phase-b-plan.md (Action/timeline the confirmation copy narrates), docs/plans/2026-04-25-001-feat-synthetic-demo-and-referral-scribes-plan.md + 2026-05-16-001 (demo surface lineage), docs/plans/2026-05-06-001-feat-acquisition-anchor-pages-plan.md (pricing SOT discipline)
- Code: src/app/demo/ask/page.tsx, src/components/chat/message-bubble.tsx, src/components/chat/message-list.tsx, src/components/demo/, src/lib/compliance/static-copy.test.ts, src/lib/marketing/constants.ts, prisma/fixtures/synthetic/metabolic-persona.ts
- Practices: docs/solutions/best-practices/search-adjacent-dirs-before-planning-2026-05-16.md, docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md

## Next Steps

- Resolve the four "Open for Reuben" items (city, product name, price framing, overview teaser) — none block starting U1.
- `/ce:work` this plan: U1 → U2 → U3 → U4; visual audit screenshots on the PR.
- The *live* versions of these flows remain owned by their real workstreams: concierge booking (2026-06-06-001) and the future Supply phase — this demo creates no precedent for either.
