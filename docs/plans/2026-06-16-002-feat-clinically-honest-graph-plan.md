---
title: "feat: Clinically honest health graph (derive-from-source, no contradictions)"
type: feat
status: active
date: 2026-06-16
origin: docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md
---

# feat: Clinically honest health graph (derive-from-source, no contradictions)

## Overview

The `/demo/record` graph hand-authors each biomarker's change ring (`change: NodeChangeWire` on the fixture node), so the ring can — and does — contradict the source record it cites: LDL shows a red **worsened** ring while its cited lab says LDL *improved* 3.6→2.9; Free‑T is labelled **new** despite a 2024 value and shows a fabricated 19.5. This plan makes the **source record the single source of truth**: the demo carries recorded readings (values, units, dates, reference ranges), and every visual state — direction, delta, classification, clinical tone — is **derived** from them through the same pure classifier the authed `/record` path already uses (`classifyChange`). A visual state that contradicts its citation becomes structurally impossible, not a thing to police.

On that foundation the plan layers the rest of the CMO requirements: an honest, realistic persona whose mix of outcomes emerges *from the data*; a richer signal that separates *measurement movement* from *clinical judgment* (direction / status / confidence / actionability); safe relationship language in place of `CAUSES`; evidence grading by source strength; and a visible clinical-priority cluster.

Sequenced as the origin requires: **truth integrity (R1–R3) first**, then the honest persona, the richer model, and the relationship/evidence/priority layer.

## Problem Frame

(see origin: `docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md`)

The graph is the product's clearest expression of "every node grounded in a record you could cite." A CMO review found the headline signal — the change rings — contradicts its own grounding because the demo bypasses the real derive engine and hand-authors the decoration. Verified today in `prisma/fixtures/synthetic/graph-narrative.ts`: 3 of 4 change rings disagree with their cited source chunks (LDL direction inverted, HbA1c baseline+direction wrong and a mid-point dropped, Free‑T mislabelled "new" with a fabricated value; Ferritin value+unit mismatch). A red "worsened" ring on an improving marker is a patient-safety pattern. Beyond the data errors, the graph asserts causation (`CAUSES` edges), renders a lab and a self-reported symptom with equal authority, and shows every node at equal salience.

The engine to fix it already exists: `classifyChange` in `src/lib/markers/panel-diff.ts` is a pure, range-relative classifier the authed `/record` path uses. The demo just isn't using it.

## Requirements Trace

From the origin doc (R1–R10) + its acceptance criteria:
- **R1** — Every visual state is *derived* from source-grounded values; authoring a ring/tone is prohibited; a visual state can never contradict its citation.
- **R2** — Fix the current contradictions: LDL, HbA1c, Free‑T, Ferritin match their cited values, units, dates (no fabricated values, no unit mismatch, no "new" when a prior value exists).
- **R3** — Anti-regression: rings/badges are *computed* by a derived-change engine (reuse `classifyChange`), not assigned; the demo stops carrying a hand-authored `change`.
- **R4** — Re-author the persona only through honest source records so a realistic mix emerges from data: ≥1 improves, ≥1 cardiometabolic marker worsens, ≥1 borderline/needs-monitoring, ≥1 genuinely newly measured.
- **R5** — Clinical realism over drama.
- **R6** — Separate dimensions: value direction / clinical status / confidence / actionability (not one collapsed tone).
- **R7** — Dimensions may honestly disagree (ferritin ↑ but status uncertain — acute-phase reactant; HbA1c ↓ but needs-context — iron confounding).
- **R8** — Remove `CAUSES`; replace with `associated_with` / `may_contribute_to` / `changed_after` / `action_targets` / `needs_follow_up` / `supported_by`; causation only when proven.
- **R9** — Evidence grading: lab > wearable estimate > self-report > inferred render with distinct authority.
- **R10** — Surface the clinical-priority cluster (cardiometabolic risk) rather than all-nodes-equal.

## Scope Boundaries

- The graph's clinical logic, demonstrated on `/demo/record`. Not a regulated decision tool; the existing non-advice framing stays.
- The derived-change classifier is the **real, shared** logic (reuse `classifyChange`); only the *persona content* is fixture-only.
- The authed `/graph` and `/record` user experience is **not** changed. Shared-engine reuse must preserve the authed path's current behaviour; new model fields are additive.
- **Not in scope:** a full assay-interference / confounder *inference* engine or a formal ≥3-point trend-statistics model. R6's `needs-context` status + R7's examples deliver the *honesty* (flagging uncertainty) without a reasoning engine. A multi-point trend model is a separate future brainstorm (the fixture may carry a 3rd HbA1c point for display, but trend *inference* is out).

### Deferred to Separate Tasks

- Porting the richer signal model / evidence grading / priority cluster to the authed `/graph` once validated on the demo — its own plan (the classifier is already shared; the rest would follow).

## Context & Research

### Relevant Code and Patterns

- `src/lib/markers/panel-diff.ts` — **`classifyChange(before, after, low, high)`** (pure: direction + range-relative classification, `unclassified` when no range, `new` handled by the caller) and `distanceToRange`. The R3 reuse target. `diffLatestPanels` is DB-coupled (Prisma) — **not** reusable in the demo; the demo needs its own panel-diff over fixture readings that calls the same pure classifier.
- `src/lib/demo/graph-adapter.ts` — `nodeToWire` currently passes the hand-authored `node.change` straight to the wire (the line to replace with derived change).
- `prisma/fixtures/synthetic/graph-narrative.ts` + `prisma/fixtures/demo-navigable-record.ts` — the persona records + `DemoNode`/`DemoEdge`/`DemoSource` types (`DemoSource.kind` already encodes source type — the R9 basis).
- `src/types/graph.ts` — `NodeChangeWire` (collapses direction+classification today; R6 extends it).
- `src/lib/graph/types.ts` — `EDGE_TYPES`/`EdgeType` (canonical set incl. `CAUSES`); `src/lib/graph/edge-validation.ts` + test.
- `src/lib/graph/visual-encoding.ts` + test, `src/lib/markers/change-presentation.ts` + test — the change-vocabulary → visual mapping (single-sourced; extend here for R6/R9).
- `src/components/graph/graph-canvas.tsx`, `src/components/graph/node-detail-sheet.tsx`, the demo legend in `src/components/demo/demo-graph-section.tsx` — render surfaces.
- Test patterns: `src/lib/markers/panel-diff.test.ts`, `src/lib/graph/{visual-encoding,edge-validation}.test.ts`, `src/lib/markers/change-presentation.test.ts`.

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` — canvas/visual changes (R6/R9/R10 encoding) carry a mandatory human visual-audit gate; runnable on the public prod demo.
- `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md` — any new data-driven tone/evidence classes must be safelisted in `tailwind.config.ts` (the change-tone classes already are; new status/evidence classes must be added).
- `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` — determinism/motion contracts any canvas change must preserve.

### External References

None. Internal logic + the existing classifier; clinical reference ranges are standard guideline values (ADA HbA1c, NICE/lipid targets, age/sex lab ranges) for CMO sign-off, not external research.

## Key Technical Decisions

- **Reuse the pure `classifyChange`, not `diffLatestPanels`.** The demo carries recorded readings and runs a small demo-side panel-diff that calls the *same* pure classifier the authed path uses — one classification semantics, zero divergence. The DB walker stays authed-only.
- **The demo node stops carrying an authored `change`; it carries `readings`.** Change is *always* derived in the adapter. This makes contradiction structurally impossible (R1) and is the anti-regression mechanism (R3), enforced by an integrity test.
- **Clinical interpretation is a separate pure layer above `classifyChange`.** `classifyChange` gives value-direction + range-relative movement; a marker-aware rule layer maps that (+ value/range/available-context) to **clinical status / confidence / actionability**, so status can honestly disagree with movement (R7). Marker rules are data-driven CMO content.
- **Causation requires proof.** Replace `CAUSES` with a safe vocabulary; an edge may assert causation only behind an explicit "proven" flag (none in this persona).
- **Evidence grade is derived from source kind**, not authored — strongest supporting `DemoSource.kind` wins (lab_pdf > wearable_window > gp_record/intake_text > self-report/inferred).
- **The priority cluster is an explicit CMO-authored tag**, not an inferred risk score — honest (it's a stated clinical judgment) and simple.
- **Prod parity:** `classifyChange` is reused unchanged; `NodeChangeWire` gains *optional* dimensions; `EDGE_TYPES` is *extended* (additive); the authed `/record`/`/graph` behaviour is unchanged.

## Open Questions

### Resolved During Planning
- *Reuse `diffLatestPanels` or just `classifyChange`?* → just the pure `classifyChange` (DB-coupling makes the walker unusable in the demo).
- *Derive vs author the change?* → derive, always; the node carries readings, not a tone.
- *Can clinical status be pure-derived from movement?* → no; a marker-aware interpretation layer is required (R7).
- *Priority cluster: inferred or tagged?* → CMO-authored tag (honest + simple).

### Deferred to Implementation
- Exact `readings` data shape on `DemoNode` (per-panel array vs panel-keyed) and how the demo panel-diff picks "latest two" — resolve against `classifyChange`'s signature.
- The per-marker clinical-interpretation rule table (which markers carry acute-phase / confounding / on-threshold context) + the reference ranges — drafted in U5 for CMO sign-off.
- The four-dimension **visual language** on the canvas (which dimension is the ring hue, which is style/opacity, which lives only in the detail sheet) — resolved in U6 against the live canvas to avoid over-encoding.
- Whether the safe edge vocabulary extends `EDGE_TYPES` or maps a demo-local edge-semantics field — resolve so the authed schema stays valid.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. Treat it as context, not code to reproduce.*

Today vs. target — the contradiction is born at the authoring step the target deletes:

```
TODAY:   fixture node.change (HAND-AUTHORED tone)  ─────────────► wire.change ─► ring
            └─ can disagree with the cited source values ✗

TARGET:  fixture node.readings (values, units, dates, ranges)
                  │                                    (cited source = same numbers)
                  ▼
           demo panel-diff ──► classifyChange(before,after,low,high)   ← shared pure engine
                  │                 → { valueDirection, rangeMovement }
                  ▼
           clinical interpretation (marker-aware rules)
                  │   → { clinicalStatus, confidence, actionability }   ← may disagree w/ movement (R7)
                  ▼
           wire.change (DERIVED) ──► ring/badge + detail sheet
           evidence grade  ◄── strongest supporting DemoSource.kind
           edges: safe vocabulary (no CAUSES);  priority cluster: CMO tag
```

Anti-regression invariant (the test that guards R1/R3): *for every biomarker node, the derived `valueDirection` agrees with the sign of (after − before) from its readings, and those readings equal the values in its cited source chunk.* No code path can produce a ring that contradicts the citation.

## Phased Delivery

### Phase 1 — Truth integrity (R1–R3) — the committed core
Recorded readings replace the authored change; the ring is derived through `classifyChange`; the four contradictions are gone and cannot recur. Independently shippable and the urgent fix.

### Phase 2 — Honest persona (R4–R5)
Re-author the records so an honest mix (improve / worsen / borderline / new) emerges *from the data* now that tones are derived.

### Phase 3 — Richer signal (R6–R7)
Separate value-direction from clinical status / confidence / actionability via the interpretation layer; encode on the canvas + detail sheet.

### Phase 4 — Relationships, evidence, priority (R8–R10)
Replace `CAUSES` with safe vocabulary; grade evidence by source strength; surface the priority cluster.

## Implementation Units

- [x] **Unit 1: Recorded readings on the demo model + corrected cited values (Phase 1)**

**Goal:** Give biomarker nodes their real recorded readings (value, unit, date, reference range) and correct the four markers to exactly match their cited source chunks.

**Requirements:** R2 (and the data foundation for R1/R3)

**Dependencies:** None

**Files:**
- Modify: `prisma/fixtures/demo-navigable-record.ts` (add a `readings` shape to `DemoNode`; keep `change` temporarily until U2 removes it)
- Modify: `prisma/fixtures/synthetic/graph-narrative.ts` (author readings from the cited chunks: HbA1c 5.9→5.7 incl. the 6.1 mid-point; LDL 3.6→2.9; Ferritin 42→68 ng/mL; Free‑T 9.5→11.8, not "new"; + reference ranges from the chunks)
- Test: `src/lib/demo/graph-adapter.test.ts` or a new `prisma/fixtures/fixture-integrity.test.ts`

**Approach:**
- `readings` carries per-panel `{ value, unit, at, referenceLow, referenceHigh }`; ranges come from the source chunk text (e.g. Free‑T 9.3–26.5, Ferritin 30–400). Units match the chunk verbatim (ng/mL, not µg/L).
- Author only what the chunks state; no invented values.

**Execution note:** Pair with a fixture-integrity test (below) — author the readings to *make the test green*, i.e. each node's readings equal its cited chunk values.

**Test scenarios:**
- Happy path: each decorated biomarker's `readings` values/units/dates equal the numbers in its cited source chunk (parse the chunk text or assert against pinned expected values).
- Edge case: a marker with a mid-point reading (HbA1c 6.1) carries all three readings in date order.
- Edge case: Free‑T has a 2024 reading (so it can never be classified "new").

**Verification:** integrity test green; no fabricated values; units match chunks.

- [x] **Unit 2: Derived change engine + anti-regression guard (Phase 1)**

**Goal:** Compute each ring from the readings via the shared `classifyChange`; the adapter attaches the *derived* change; the hand-authored `change` is removed. A test makes contradiction impossible.

**Requirements:** R1, R3

**Dependencies:** Unit 1

**Files:**
- Create: `src/lib/demo/derive-change.ts` (demo panel-diff over `readings` → `NodeChangeWire`, calling `classifyChange`)
- Modify: `src/lib/demo/graph-adapter.ts` (derive change from readings instead of passing `node.change`)
- Modify: `prisma/fixtures/demo-navigable-record.ts` + `prisma/fixtures/synthetic/graph-narrative.ts` (remove the `change` field)
- Test: `src/lib/demo/derive-change.test.ts` (+ extend `graph-adapter.test.ts`)

**Approach:**
- Pick the latest two readings per marker; `before`/`after`/range → `classifyChange`; `new` when only one reading exists. Reuse the pure classifier verbatim (no reimplementation).
- The adapter no longer reads an authored `change`; it derives. Removing the field deletes the ability to author a tone (R1).

**Execution note:** Test-first — the anti-regression integrity test *is* the deliverable; write it before wiring the adapter.

**Test scenarios:**
- Happy path: improved (closer to range), worsened (further), stable (in range both), `new` (one reading), `unclassified` (no range) — one per classifier branch.
- **Anti-regression (the guard):** for every biomarker wire node, derived `direction` agrees with `sign(after − before)` and `classification` is consistent with the range — assert across the whole fixture so no node can contradict its readings.
- Edge case: the four previously-contradictory markers now derive tones matching their cited sources (LDL→improved, HbA1c→improved, Ferritin→improved, Free‑T→improved/up, none "new").
- Integration: `adaptDemoFixture` output carries derived change; no node carries an authored tone.

**Verification:** the four contradictions are gone and re-deriving from readings reproduces them; deleting the `change` field still compiles (nothing authors tones).

- [ ] **Unit 3: Honest, realistic persona (Phase 2)**

**Goal:** Re-author the records so the derived tones show a clinically realistic mix: ≥1 improves, ≥1 cardiometabolic marker worsens, ≥1 borderline/needs-monitoring, ≥1 genuinely new in 2026.

**Requirements:** R4, R5

**Dependencies:** Unit 2

**Files:**
- Modify: `prisma/fixtures/synthetic/graph-narrative.ts` (readings + matching source chunks + dates)
- Test: extend the fixture-integrity + a "tone mix" assertion

**Approach:**
- Keep the lifestyle-recovery arc but make it realistic: e.g. HbA1c stays borderline at 5.7 (on the prediabetes line → monitor); most lipids improve; **one cardiometabolic marker genuinely worsens** despite the gains (a plausible non-responder — drafted with CMO input, e.g. a marker that drifts up); **one marker is first measured in 2026** (the panel expanded scope — a genuine `new`). Every reading has a matching cited chunk.
- Tones follow from the data — no styling.

**Test scenarios:**
- Happy path: derived tones across the fixture include ≥1 improved, ≥1 worsened, ≥1 stable/borderline, ≥1 new.
- Edge case: the "new" marker has exactly one reading (2026) and no earlier chunk.
- Integration: every reading maps to a source chunk with the same value/date (integrity test still green).

**Verification:** the demo shows an honest mix, each tone traceable to data; no manual styling introduced.

- [ ] **Unit 4: Multi-dimensional change model (Phase 3)**

**Goal:** Carry the four dimensions (value direction / clinical status / confidence / actionability) on the wire, additively.

**Requirements:** R6

**Dependencies:** Unit 2

**Files:**
- Modify: `src/types/graph.ts` (extend `NodeChangeWire` with optional `clinicalStatus`, `confidence`, `actionability`; `direction` already covers value-direction)
- Modify: `src/lib/markers/panel-diff.ts` or a sibling (shared vocab types) as needed
- Test: type/shape coverage via the derive + interpretation tests (Unit 5)

**Approach:**
- Additive optional fields so the authed path is unchanged; the demo populates them (Unit 5), the authed path may later.

**Test scenarios:**
- Edge case: absent dimensions (authed path) leave the wire shape byte-compatible (parity assertion).

**Verification:** types compile; authed `NodeChangeWire` consumers unaffected.

- [ ] **Unit 5: Clinical interpretation layer (Phase 3)**

**Goal:** Map `classifyChange` output + marker context → clinical status / confidence / actionability, allowing honest disagreement with raw movement.

**Requirements:** R6, R7

**Dependencies:** Unit 4

**Files:**
- Create: `src/lib/markers/clinical-interpretation.ts` (+ a per-marker rule table)
- Modify: `src/lib/demo/derive-change.ts` (attach the dimensions)
- Test: `src/lib/markers/clinical-interpretation.test.ts`

**Approach:**
- Pure rules: default status from range-movement (improved→favourable, worsened→unfavourable, in-range→favourable/uncertain), then **marker-aware overrides** — ferritin up → `uncertain` unless TSAT/CRP present (acute-phase reactant); HbA1c down while iron is changing → `needs-context`; a value on a decision threshold (HbA1c 5.7) → actionability `monitor`. Confidence from evidence grade + data density.
- Rule table is CMO content (drafted here for sign-off).

**Test scenarios:**
- Happy path: improved-toward-range → favourable; worsened → unfavourable.
- Edge case (R7): ferritin increased + no TSAT/CRP → status `uncertain` (disagrees with the "favourable" a naive map would give).
- Edge case: HbA1c decreased while ferritin rising → `needs-context`.
- Edge case: value exactly on a threshold → actionability `monitor`.
- Error path: unknown marker / no rule → safe default (`uncertain`, `low` confidence, `clinician-review`), never a false `favourable`.

**Verification:** dimensions can disagree with movement; defaults are conservative.

- [ ] **Unit 6: Canvas + detail-sheet encoding for the dimensions (Phase 3)**

**Goal:** Render status/confidence/actionability distinctly without clutter.

**Requirements:** R6, R7

**Dependencies:** Unit 5

**Files:**
- Modify: `src/lib/graph/visual-encoding.ts` (+ test), `src/lib/markers/change-presentation.ts` (+ test)
- Modify: `src/components/graph/graph-canvas.tsx`, `src/components/graph/node-detail-sheet.tsx`
- Modify: `tailwind.config.ts` (safelist new status/confidence classes)

**Approach:**
- Ring **hue = clinical status** (not raw direction); confidence as ring style/opacity; actionability + the full four dimensions in the detail sheet (where there's room). Keep the canvas legible — prefer the detail sheet over piling encodings on the dot.

**Execution note:** Visual-audit-gated (canvas motion/encoding) — pure encoding maps are unit-tested; the look is the human audit.

**Test scenarios:**
- Happy path: each clinical status maps to its safelisted hue; each confidence to its style.
- Edge case: `uncertain`/`needs-context` renders visibly distinct from favourable/unfavourable (not just "calm").
- Integration (visual-audit-gated): the four markers read correctly; no canvas clutter regression; Tailwind cold-render shows the new classes.

**Verification:** encoding tests green; audit confirms legibility; safelist holds.

- [ ] **Unit 7: Safe relationship vocabulary — replace CAUSES (Phase 4)**

**Goal:** Remove causal overclaim; relationships use non-causal language unless proven.

**Requirements:** R8

**Dependencies:** None (can run parallel to Phase 3)

**Files:**
- Modify: `src/lib/graph/types.ts` (`EDGE_TYPES` — add the safe vocabulary; decide whether to retire `CAUSES` or gate it behind a proven flag)
- Modify: `prisma/fixtures/demo-navigable-record.ts` (`DemoEdge` type), `prisma/fixtures/synthetic/graph-narrative.ts` (re-map the 5 `CAUSES` edges → `may_contribute_to` / `associated_with`)
- Modify: `src/lib/graph/visual-encoding.ts`, `src/lib/graph/edge-validation.ts` (+ tests)
- Test: `src/lib/graph/edge-validation.test.ts`

**Approach:**
- Map ferritin→fatigue, low‑T→libido/fatigue, sleep→symptoms to `may_contribute_to` (the honest relation). Edge rendering must not imply proven causation.

**Test scenarios:**
- Happy path: each safe edge type validates and renders.
- **Guard:** no `CAUSES` edge exists in the fixture unless flagged `proven` (none here) — assert across the fixture.
- Edge case: authed graph still accepts the existing canonical types (additive, no break).

**Verification:** no causal overclaim remains; edge-validation green; authed schema valid.

- [ ] **Unit 8: Evidence grading by source strength (Phase 4)**

**Goal:** Render node/edge authority proportional to its strongest supporting source.

**Requirements:** R9

**Dependencies:** None (parallel-safe)

**Files:**
- Create/modify: a grade-derivation helper (from `DemoSource.kind`), `src/lib/demo/graph-adapter.ts`
- Modify: `src/lib/graph/visual-encoding.ts` (+ test), the demo legend in `src/components/demo/demo-graph-section.tsx`, `tailwind.config.ts`
- Test: `src/lib/demo/*` grade-derivation test

**Approach:**
- Grade order lab_pdf > wearable_window > gp_record/intake_text > self-report (checkin/mood/energy) > inferred (no source). A node's grade = strongest supporting source. Encode as a subtle authority cue (stroke weight/opacity), legend explains it.

**Test scenarios:**
- Happy path: a lab-backed node grades above a self-reported node above an inferred one.
- Edge case: a node supported by multiple kinds takes the strongest.
- Edge case: an inferred node (no source) renders at the lowest authority.

**Verification:** grading derivation tests green; a self-reported node no longer reads with lab authority.

- [ ] **Unit 9: Clinical-priority cluster (Phase 4)**

**Goal:** Surface the cardiometabolic-risk cluster as the salient signal.

**Requirements:** R10

**Dependencies:** None (parallel-safe; pairs visually with U6)

**Files:**
- Modify: `prisma/fixtures/synthetic/graph-narrative.ts` (a CMO-authored cluster tag on the relevant nodes)
- Modify: `src/components/graph/graph-canvas.tsx` / a cluster overlay, the demo section copy
- Test: cluster-membership derivation test

**Approach:**
- Tag the cardiometabolic cluster (prediabetes, lipids, BP, central adiposity) and render it emphasised (grouping/halo/section callout) so it doesn't sit equal among all nodes. Tag is an explicit clinical judgment, not an inferred score.

**Execution note:** Visual-audit-gated.

**Test scenarios:**
- Happy path: tagged nodes resolve to the cluster; untagged don't.
- Integration (visual-audit-gated): the cluster reads as the priority without breaking the force layout/determinism.

**Verification:** membership test green; audit confirms the cluster is the salient signal.

## System-Wide Impact

- **Interaction graph:** the derived change flows through `adaptDemoFixture` → wire → canvas/detail-sheet (same path as today's authored change, just computed). The interpretation layer + evidence grade are additive derivations in the adapter. No new fetch/DB.
- **Error propagation:** demo is fixture-driven, pure; a marker with no range → `unclassified` (direction only); unknown marker → conservative interpretation default (never false-favourable).
- **API surface parity:** `NodeChangeWire` gains optional fields; `EDGE_TYPES` is extended — both additive. The authed `/api/record` payload and `classifyChange` behaviour are unchanged.
- **Integration coverage:** the anti-regression integrity test (U2) is the cross-cutting guard — it proves no node can contradict its readings/citation, across the whole fixture.
- **Unchanged invariants:** the authed `/record`/`/graph` UX; `classifyChange` semantics (reused, not modified); the graph's determinism/motion contracts; the scrubber (it reads `change.afterAt` + `firstSeenAt`, both still present — derived change keeps the same shape).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Scope (4 phases) overruns the urgent fix | Phase 1 (U1–U2) is the committed, independently-shippable core (kills the contradictions); Phases 2–4 are gated follow-ons |
| Clinical content wrong (ranges, per-marker rules, re-authored persona) | The one human dependency — drafted in U1/U3/U5 for **CMO sign-off**; conservative defaults where unsure (never false-favourable) |
| Removing the authored `change` breaks the scrubber (reads `change.afterAt`) | Derived change keeps the same `NodeChangeWire` shape incl. `afterAt`; covered by the existing scrubber tests + the integrity test |
| Over-encoding the canvas (4 dims + evidence + priority) → clutter | Ring hue = clinical status only; push the rest to the detail sheet; visual-audit-gated (U6/U9) |
| New data-driven tone/evidence classes dropped by Tailwind JIT | Safelist in `tailwind.config.ts` + cold-render check in the audit (documented trap) |
| `EDGE_TYPES` change ripples to the authed graph | Additive (don't remove existing types); edge-validation test guards; authed schema stays valid |
| Prod parity drift on the shared classifier | `classifyChange` reused unmodified; authed-path parity asserted |

## Documentation / Operational Notes

- No flag, schema migration, or API change. Demo-only surface; ships on merge to the live demo where the visual audit (U6/U9) runs on the prod build.
- Candidate `docs/solutions/` note: "derive visual state from source, never author it — the single-source-of-truth rule that makes contradiction impossible."

## Sources & References

- **Origin:** [docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md](docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md)
- Reuse engine: `src/lib/markers/panel-diff.ts` (`classifyChange`, `distanceToRange`), `src/lib/markers/change-presentation.ts`.
- Demo surface: `src/lib/demo/graph-adapter.ts`, `prisma/fixtures/{synthetic/graph-narrative,demo-navigable-record}.ts`, `src/components/demo/demo-graph-section.tsx`, `src/components/graph/{graph-canvas,node-detail-sheet}.tsx`.
- Graph model: `src/types/graph.ts`, `src/lib/graph/{types,edge-validation,visual-encoding}.ts`.
- Prior temporal/longitudinal lineage: `docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md`, `docs/plans/2026-06-15-001-feat-demo-graph-time-scrubber-plan.md`.
