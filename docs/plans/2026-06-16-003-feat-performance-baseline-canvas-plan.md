---
title: "feat: Performance-baseline canvas — interpretation engine, consumer dimensions, flag taxonomy, priority cluster"
type: feat
status: active
date: 2026-06-16
origin: docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md
---

# feat: Performance-baseline canvas — interpretation engine, consumer dimensions, flag taxonomy, priority cluster

## Overview

The clinically-honest graph now derives every change ring from source (no contradictions, no causal overclaim, evidence-graded) and carries an honest cardiometabolic mix (LDL-C worsened, ApoB newly captured) — all shipped on branch `feat/clinically-honest-graph`. This plan adds the **clinical safety layer the CMO specified**: an interpretation engine that turns each marker's derived change into **four consumer-facing dimensions** (Where it is now / What changed / How clear the signal is / What to do next), a **three-tier flag taxonomy** (attention / clinician-discussion / escalation), and the **performance-baseline canvas reframe** (a top authority cue, enriched marker cards, and one "Cardiometabolic baseline" priority cluster).

The governing constraint, from the CMO and treated as a hard guardrail: **this must read as a performance-baseline canvas with clinical safety underneath — NOT a medical dashboard.** Per MHRA, a product's *intended purpose* is shaped by its language and presentation, so the copy must keep it in the wellness / information / clinician-prep lane; anything potentially diagnostic routes to clinician handover, never a user-facing conclusion.

## Problem Frame

(see origin: `docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md` → "CMO Direction — locked 2026-06-16")

The graph currently shows an honest *range-relative* ring (improved/worsened/stable/new) and provenance, but it collapses *measurement movement* and *clinical judgment* into one tone and offers no "what do I do with this" — and the source-chunk text (where the attention-threshold / not-a-diagnosis framing lives) is buried in provenance. A worsened LDL ring reads as an alarm without telling the user it's an *attention* signal (not a treatment trigger) or what the next step is. The CMO's fix: separate the dimensions, grade the flag, and surface it in plain English with a clear next step — while keeping the canvas calm and non-diagnostic.

The clinical content is **locked** (the CMO authored the per-marker matrix, the flag tiers, the thresholds, and the copy verbatim). This plan is about *building to that spec*, not re-deciding clinical logic.

## Requirements Trace

From the origin doc + the locked CMO direction:
- **R6** — Four consumer dimensions (internally status / trend / confidence / actionability), shown as **Where it is now · What changed · How clear the signal is · What to do next**.
- **R7** — Dimensions may honestly disagree with raw movement (ferritin ↑ but context-dependent — acute-phase reactant; HbA1c ↓ but needs-context if iron status abnormal). Encoded from the CMO matrix.
- **R10** — Surface ONE priority cluster, "Cardiometabolic baseline" (LDL-C increased, ApoB newly captured, full lipid context needs review), not all-nodes-equal.
- **CMO-Flag** — Three visually-distinct flag tiers: **attention** ("worth watching"), **clinician-discussion** ("worth discussing with a GP"), **escalation** ("requires clinical review before user-facing interpretation"). Most of the product lives in attention + clinician-discussion.
- **CMO-Canvas** — Top authority cue; enriched marker cards (name · current · previous · trend · one plain-English sentence · one next-step); the one priority cluster; **no four loud visual channels**.
- **CMO-Guardrail** — Performance-baseline canvas, not a medical dashboard; attention threshold ≠ treatment threshold; nothing diagnostic shown as a conclusion (escalation → clinician handover).

## Scope Boundaries

- Demo-only (`/demo/record`), the public performance-baseline surface. Not the authed `/graph`/`/record` UX; new model fields are additive and demo-populated.
- The clinical content (the per-marker interpretation matrix, flag thresholds, the verbatim copy) is **CMO-locked input**, not re-decided here. The engine encodes it as a data table.
- **Not a medical dashboard:** no grid of all markers; the force graph stays the canvas/map, cards appear on tap + in the one priority cluster.
- Not building: a real per-user interpretation engine for the authed path (this proves the model on the demo; porting is a later plan), a confounder *inference* engine, or escalation *workflow* (escalation here = a routing label + handover copy, not a clinician queue).

### Deferred to Separate Tasks

- Porting interpretation + flags to the authed `/graph` once validated.
- A real clinician-review/handover workflow behind the escalation tier.

## Context & Research

### Relevant Code and Patterns

- `src/lib/demo/derive-change.ts` — derives `NodeChangeWire` from readings (the "What changed" dimension; the interpretation engine consumes its output + the readings/range).
- `src/lib/markers/classify-change.ts` — the shared range-relative classifier (status seed before clinical overrides).
- `src/lib/markers/change-presentation.ts` (+ test) — `changeClassificationLabel`/`changeDirectionGlyph`; the single-sourced change vocabulary to extend for the consumer-dimension labels.
- `src/components/graph/node-detail-sheet.tsx` — the existing card surface (`ChangeSince` renders "Since your last test"; evidence label already added). U3 enriches this into the marker card.
- `src/components/demo/demo-graph-section.tsx` — the `/demo/record` section (authority cue + priority cluster live here; legend pattern to mirror).
- `src/lib/demo/graph-adapter.ts` — wires derived `change`, `firstSeenAt`, `evidenceGrade` onto wire nodes (additive pattern to mirror for `interpretation`).
- `src/types/graph.ts` — `NodeChangeWire`, `EvidenceGrade` (additive wire fields; `interpretation` follows the same additive shape).
- `prisma/fixtures/synthetic/graph-narrative.ts` — the locked persona (LDL-C 2.7→3.4, ApoB 0.98 new, the `ldl-attention` item); the priority-cluster nodes.
- Test patterns: `src/lib/demo/{derive-change,evidence-grade,graph-adapter}.test.ts`, `src/lib/markers/change-presentation.test.ts`, `tailwind.config.ts` safelist.

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` — the canvas/card/cluster render carries a **mandatory human visual-audit gate**; the user (CMO) explicitly will review the live canvas. Runnable on the public prod demo.
- `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md` — new flag-tier / dimension classes must be safelisted.
- Prior plans `2026-06-15-001` (scrubber), `2026-06-16-002` (truth integrity / persona) — the determinism/motion contracts and the additive-wire-field + prod-parity pattern to preserve.

### External References

None. Clinical content is CMO-locked (matrix, copy, thresholds, flag tiers); MHRA intended-purpose guardrail captured in the origin doc. Patterns are in-repo.

## Key Technical Decisions

- **The interpretation matrix is a CMO-authored data table, not free logic.** Per-marker rules (canonicalKey → how to compute the four dimensions + flag, with the verbatim copy) live in one data module. Rationale: the *language IS the intended purpose* (MHRA) — keeping the exact copy in a reviewable table makes it auditable and prevents drift; the engine is a thin evaluator over it.
- **The four consumer dimensions are derived, never authored on the node.** A pure engine maps (marker, derived change, value, range, available-context) → `{ whereItIsNow, signalClarity, nextStep, flag }`. "What changed" reuses the existing derived `change` (single source of truth holds). Status/clarity/flag may disagree with raw movement (R7) via marker-specific overrides.
- **The force graph stays the canvas/map; "marker cards" = the enriched detail sheet + the one cluster summary.** A grid of all markers would be the medical dashboard the CMO forbids. Cards appear on tap and in the single "Cardiometabolic baseline" cluster — the calm, explore-a-map model, not a cockpit.
- **Flag tiers are visually distinct and never blurred; escalation routes to handover.** Attention / clinician-discussion / escalation get three distinct treatments; escalation shows a clinician-handover message, never a user-facing diagnostic conclusion (CMO-Guardrail). The demo persona lives in attention + clinician-discussion (no escalation case).
- **Threshold language is "attention," not "treatment," everywhere it surfaces** (the LDL 3.0 line). Copy mirrors the CMO's verbatim wording.
- **Prod parity:** `interpretation` is an additive optional wire field the authed path never sets; the authed `/graph`/`/record` render is unchanged. New classes safelisted.
- **One dominant hierarchy on the canvas** (CMO): authority cue (top) → priority cluster → marker cards. No additional loud visual channels on the graph dots themselves (the evidence-grade canvas cue stays deferred to avoid clutter).

## Open Questions

### Resolved During Planning
- *Card grid vs force-graph + enriched cards?* → force graph stays; cards on tap + one cluster (the guardrail decides it).
- *Where does interpretation live?* → a pure engine over a CMO-authored data table; attached additively by the adapter.
- *Is "What changed" a new dimension?* → no, it reuses the derived `change` (don't duplicate the source of truth).
- *Escalation = workflow?* → no, a routing label + handover copy for now.

### Deferred to Implementation
- Exact shape of the `interpretation` wire object + the data-table schema — resolve against the engine signature.
- The marker-card visual layout (how the four dimensions + flag + next-step sit in the detail sheet without clutter) — tuned in U3 against the live card + the CMO's eye.
- The priority-cluster surfacing (a summary section above the graph vs. a subtle on-graph halo for the cluster nodes vs. both) — decided in U5 against the live canvas.
- Flag-tier visual treatments (hue/icon/chip) — decided in U6 with the safelist + audit; must stay distinct and non-alarming.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. Treat it as context, not code to reproduce.*

The interpretation engine sits on top of the already-derived change; the surfaces render its output. "What changed" is not recomputed — it reuses the derived `change`:

```
readings ──► deriveChange ──► change { direction, classification, before→after }   (shipped)
   │              │
   │              └────────────┐
   ▼                           ▼
CMO matrix (per marker) ──► interpret(marker, change, value, range, context)
                               → interpretation {
                                   whereItIsNow,     // "Above attention threshold" / "New baseline captured"
                                   signalClarity,    // "Medium–High" / "Context-dependent" / "Needs context if iron abnormal"
                                   nextStep,         // CMO verbatim per marker
                                   flag,             // attention | clinician_discussion | escalation
                                   plainEnglish,     // one-sentence summary
                                 }
                               (status/clarity/flag MAY disagree with raw movement — R7)
   │
   ▼  adapter attaches `interpretation` (additive, demo-only)
   ▼
SURFACES (CMO hierarchy, one dominant order):
  ① authority cue  — "Built from verified lab results… Flagged items are for tracking or clinician discussion, not diagnosis."
  ② priority cluster "Cardiometabolic baseline" — LDL-C ↑, ApoB new, full lipid context to review
  ③ marker card (detail sheet) — name · current · previous · trend · plainEnglish · nextStep · flag chip
  escalation flag → clinician-handover copy, never a user-facing conclusion
```

Flag tier × surface (decision matrix the renderers honor):
```
attention            → calm chip "Worth watching"            (most markers)
clinician_discussion → chip "Worth discussing with a GP"     (LDL-C, ApoB)
escalation           → handover banner, interpretation hidden (none in this persona; path must exist)
```

## Phased Delivery

### Phase A — Interpretation engine (clinical safety underneath)
The pure engine + the CMO data table + the additive wire field. No UI yet; fully unit-tested against the CMO matrix.

### Phase B — Surfaces (the calm consumer render)
Enriched marker card, top authority cue, the one priority cluster. Visual-audit-gated; the CMO reviews the live canvas.

### Phase C — Flag taxonomy distinctness + audit
The three-tier flag treatments (distinct, non-alarming), the escalation→handover path, and the mandatory visual + regulatory-language audit.

## Implementation Units

- [x] **Unit 1: Clinical interpretation engine + CMO matrix (Phase A)**

**Goal:** A pure engine that maps each marker's derived change to the four consumer dimensions + flag, from a CMO-authored data table.

**Requirements:** R6, R7, CMO-Flag

**Dependencies:** None (consumes the shipped `derive-change` output)

**Files:**
- Create: `src/lib/markers/clinical-interpretation.ts` (the engine + the per-marker matrix data table, copy verbatim from the origin doc)
- Create: `src/types/graph.ts` addition — `NodeInterpretation` + `FlagTier` types, optional `interpretation?` on `GraphNodeWire`
- Test: `src/lib/markers/clinical-interpretation.test.ts`

**Approach:**
- Input: `(canonicalKey, change, latestValue, range, context?)`; output `{ whereItIsNow, signalClarity, nextStep, flag, plainEnglish }`. Default status from the range-relative classification, then marker-specific overrides (ferritin → context-dependent regardless of direction; HbA1c → needs-context if iron abnormal; LDL above attention threshold → clinician-discussion; ApoB new → attention, no-trend clarity).
- Copy is verbatim from the CMO matrix; thresholds use "attention," not "treatment."
- Unknown marker / missing data → conservative default (`signalClarity: low`, `flag: clinician_discussion`, neutral copy) — never a false-reassuring "favourable/normal".

**Execution note:** Implement test-first — the matrix outputs are the spec; the engine makes them green.

**Test scenarios:**
- Happy path: LDL-C worsened above attention threshold → whereItIsNow "Above attention threshold", flag `clinician_discussion`, nextStep = CMO LDL copy.
- Happy path: ApoB `new` → "New baseline captured", clarity "Medium", flag `attention`, no trend claim.
- Edge (R7): ferritin `stable`/up → signalClarity "Context-dependent" (acute-phase), not "favourable", even though it rose.
- Edge (R7): HbA1c improved but context flag → "Needs context if iron status abnormal".
- Edge: value exactly on the attention threshold → still surfaces as attention (boundary inclusive).
- Error path: unknown marker / no change → conservative default (low clarity, clinician_discussion, never false-favourable).

**Verification:** every CMO matrix row reproduced exactly; dimensions can disagree with movement; defaults conservative.

- [x] **Unit 2: Attach interpretation to demo nodes (Phase A)**

**Goal:** The adapter computes + attaches `interpretation` per biomarker node, additively.

**Requirements:** R6, prod parity

**Dependencies:** Unit 1

**Files:**
- Modify: `src/lib/demo/graph-adapter.ts` (attach `interpretation` where `change`/`evidenceGrade` are attached)
- Test: `src/lib/demo/graph-adapter.test.ts`

**Approach:** mirror the `evidenceGrade`/`change` additive attach; only nodes with a derived change get an interpretation; authed path never sets it.

**Test scenarios:**
- Happy path: LDL/ApoB wire nodes carry `interpretation` with the expected flag/copy.
- Edge: a node with no readings → no `interpretation` (absent, shape parity).
- Integration: `adaptDemoFixture` output is deterministic with the new field.

**Verification:** decorated nodes carry interpretation; undecorated unchanged; deterministic.

- [x] **Unit 3: Enriched marker card (detail sheet) (Phase B)**

**Goal:** Render the four consumer dimensions + plain-English + next-step + flag chip in the detail sheet, with the "not a diagnosis" framing.

**Requirements:** R6, R7, CMO-Canvas, CMO-Guardrail

**Dependencies:** Unit 2

**Files:**
- Modify: `src/components/graph/node-detail-sheet.tsx` (extend `ChangeSince`/header into the marker card: Where it is now · What changed · How clear · What to do next + flag chip + non-advice line)
- Modify: `src/lib/markers/change-presentation.ts` (+ test) for any new consumer labels
- Modify: `tailwind.config.ts` (safelist flag/dimension classes)
- Test: `src/lib/markers/change-presentation.test.ts` (pure label mappings)

**Approach:** keep the existing before→after + evidence label; add the four labelled dimensions reading from `node.interpretation`; the flag as a calm chip; the next-step as a clear label; preserve the non-advice disclaimer. Plain, calm, not a cockpit.

**Execution note:** Visual-audit-gated; pure label maps unit-tested, the layout is the human gate.

**Test scenarios:**
- Happy path (pure): each `whereItIsNow`/`flag` maps to its consumer label + safelisted class.
- Edge: a node with no interpretation renders today's card unchanged (no empty dimensions).
- Integration (visual-audit-gated): LDL card shows "Above attention threshold / Increased 2.7→3.4 / Medium–High / Review lipid context" + clinician-discussion chip; reads calm, not alarming.

**Verification:** label tests green; the card shows the four dimensions + next-step honestly; CMO audit confirms tone.

- [x] **Unit 4: Top authority cue (Phase B)**

**Goal:** The one-line trust banner on `/demo/record`.

**Requirements:** CMO-Canvas, CMO-Guardrail

**Dependencies:** None

**Files:**
- Modify: `src/components/demo/demo-graph-section.tsx` (authority cue above the graph)
- Modify: `tailwind.config.ts` if new classes

**Approach:** verbatim CMO copy — "Built from verified lab results, wearable trends and your intake. Flagged items are for tracking or clinician discussion, not diagnosis." (+ the "safety-reviewed where required" variant as a prop for later). Quiet, trust-setting.

**Test scenarios:**
- Test expectation: none — static copy/styling; verified in the U6 visual audit.

**Verification:** the cue renders above the graph; copy matches the CMO verbatim.

- [x] **Unit 5: "Cardiometabolic baseline" priority cluster (Phase B)**

**Goal:** Surface the one priority cluster (LDL-C ↑, ApoB new, full lipid context) — not all-nodes-equal — without a dashboard grid.

**Requirements:** R10, CMO-Canvas

**Dependencies:** Unit 2

**Files:**
- Modify: `prisma/fixtures/synthetic/graph-narrative.ts` (a CMO cluster tag on the cardiometabolic nodes) + `prisma/fixtures/demo-navigable-record.ts` (tag field if needed) + `src/lib/demo/graph-adapter.ts` (pass it through)
- Modify: `src/components/demo/demo-graph-section.tsx` (a compact "Cardiometabolic baseline" summary surfacing the 2–3 cluster markers as cards + the cluster copy; optional subtle on-graph emphasis of the tagged nodes)
- Test: a cluster-membership derivation test (pure)

**Approach:** an explicit CMO-authored cluster tag (not an inferred risk score); render a single compact cluster card with the verbatim cluster copy ("worth watching because one lipid marker moved upward and a new particle marker was captured… not a diagnosis") and the LDL/ApoB mini-cards. Keep it one cluster, calm.

**Execution note:** Visual-audit-gated.

**Test scenarios:**
- Happy path: tagged nodes resolve to the cluster; untagged don't.
- Edge: the cluster surfaces exactly the cardiometabolic markers (LDL, ApoB, lipid context), nothing else.
- Integration (visual-audit-gated): the cluster reads as the priority without a dashboard feel or layout/determinism regressions.

**Verification:** membership test green; one calm priority cluster present; CMO audit confirms it's not a cockpit.

- [x] **Unit 6: Flag-tier distinctness + escalation handover + audit (Phase C)**

**Goal:** Three visually-distinct, non-alarming flag treatments; escalation routes to clinician handover; the mandatory visual + regulatory-language audit.

**Requirements:** CMO-Flag, CMO-Guardrail

**Dependencies:** Units 3, 5

**Files:**
- Modify: the flag chip rendering (detail sheet + cluster), `tailwind.config.ts` (safelist), and the escalation handover copy/branch
- Test: pure flag→treatment mapping test

**Approach:** attention / clinician-discussion / escalation get three distinct chips (calm hues, plain words — "Worth watching" / "Worth discussing with a GP" / handover). Escalation hides the user-facing interpretation and shows the handover message (none triggers in this persona, but the path exists). Run the visual audit on the live prod build; verify no diagnostic conclusion is shown and the tiers are not blurred.

**Test scenarios:**
- Happy path (pure): each tier → its distinct treatment + copy.
- Edge: escalation → interpretation hidden, handover shown (synthetic case).
- Integration (visual-audit-gated): the three tiers are visually distinguishable and none reads as a diagnosis/alarm; "attention" dominates.

**Verification:** mapping test green; audit confirms distinct, calm, non-diagnostic tiers + the handover path.

## System-Wide Impact

- **Interaction graph:** interpretation flows adapter → wire `interpretation` → detail sheet + cluster (same additive path as `change`/`evidenceGrade`). No new fetch/DB; pure derivation.
- **API surface parity:** `NodeChangeWire` neighbourhood gains an additive `interpretation`; authed `/api/record` + `/graph` render unchanged (never set).
- **Integration coverage:** the engine's CMO-matrix fidelity (U1) + the flag-tier non-diagnostic rendering (U6 audit) are the cross-cutting guarantees; the canvas must stay calm (visual audit).
- **Unchanged invariants:** the derived change (single source of truth), the truth-integrity anti-regression guard, evidence grading, no-causal-overclaim, the scrubber, determinism/motion contracts, the authed surfaces.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Medical-dashboard creep** (the #1 CMO guardrail) | Force graph stays the canvas; cards on-tap + one cluster only; no all-marker grid; mandatory CMO visual audit (U6) |
| **Regulatory: language drifts toward diagnosis/treatment** | Copy is CMO-verbatim in a reviewable data table; "attention" not "treatment"; escalation → handover, never a conclusion; language audit in U6 |
| Canvas clutter from new channels | One dominant hierarchy (cue → cluster → card); dimensions live in the card, not on graph dots; evidence-grade canvas cue stays deferred |
| New flag/dimension classes dropped by Tailwind JIT | Safelist + cold-render check in the audit |
| Interpretation contradicts the derived change | "What changed" reuses the derived `change`; status/clarity may differ but the *movement* is the single source of truth; engine tests assert consistency |
| Prod parity drift | Additive `interpretation` the authed path never sets; parity asserted |

## Documentation / Operational Notes

- No flag/schema/API change. Demo-only; ships to the live demo where the **CMO visual + language audit** runs on the prod build (the user will review the live canvas — their stated gate).
- Candidate `docs/solutions/` note: "performance-baseline, not medical-dashboard — interpretation as a CMO-authored data table so language (the regulatory intended-purpose surface) stays auditable."

## Sources & References

- **Origin (locked CMO direction):** [docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md](docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md) → "CMO Direction — locked 2026-06-16".
- Predecessor (R1–R5, R8, R9 shipped): `docs/plans/2026-06-16-002-feat-clinically-honest-graph-plan.md` (branch `feat/clinically-honest-graph`).
- Code: `src/lib/demo/{derive-change,evidence-grade,graph-adapter}.ts`, `src/lib/markers/{classify-change,change-presentation}.ts`, `src/components/graph/node-detail-sheet.tsx`, `src/components/demo/demo-graph-section.tsx`, `src/types/graph.ts`, `prisma/fixtures/synthetic/graph-narrative.ts`.
- Learnings: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`, `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`.
- Regulatory: [MHRA — Software & AI as a Medical Device](https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device/software-and-artificial-intelligence-ai-as-a-medical-device); [NICE NG238 — CVD risk](https://www.nice.org.uk/guidance/ng238).
