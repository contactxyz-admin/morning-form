---
title: "feat: Self-report visual class — split symptoms/mood/energy from Source"
type: feat
status: active
date: 2026-06-18
origin: docs/plans/2026-06-17-003-feat-deferred-graph-items-closeout-plan.md
---

# feat: Self-report visual class — split symptoms/mood/energy from "Source"

## Overview

The graph collapses 18 node types into 4 visual classes (`clinical`, `biomarker`,
`intervention`, `data`). The `data` class currently bundles **source documents
together with patient self-reports** (`mood`, `energy`) — and the filter chip
labelled **"Source"** therefore ghosts mood/energy nodes it never names (review
finding A1). Worse, it conflates two clinically distinct evidence types: a lab
report / uploaded document (provenance) vs a patient-reported outcome.

Per the product decision (2026-06-17-003 review, Q2): **give self-reports their
own visual class.** A source document, a wearable signal, a lab value, and a
patient-reported symptom carry different clinical weight and must be visually
distinct. After this change:
- **"Source"** (`data`) = provenance only: source documents.
- **"Symptoms & self-report"** (new `self_report` class) = patient-reported
  outcomes: `symptom`, `symptom_episode`, `mood`, `energy`.
- No filter chip hides a node type it does not name.

This is a deliberate **taxonomy + encoding** change (new class, color, legend
chip, safelist, selection hue), applied through the single source of truth in
`visual-encoding.ts` so every surface (demo + authed canvas, legend, filter,
selection halo) inherits it.

## Problem Frame

`src/lib/graph/visual-encoding.ts` is the single encoder:
- `NodeVisualClass = 'clinical' | 'biomarker' | 'intervention' | 'data'`.
- `NODE_VISUAL_CLASS: Record<NodeType, NodeVisualClass>` maps each type. Today
  `mood`/`energy` → `data`; `symptom`/`symptom_episode` → `clinical`.
- `NODE_VISUAL_BY_CLASS` (fill/stroke), `SELECTION_STROKE_BY_CLASS` (halo hue),
  `LEGEND_ITEMS` + `LEGEND_LABEL` (chip), all keyed by `NodeVisualClass`.
- `tailwind.config.ts` **safelists** every fill/stroke string (the documented
  JIT-drop trap for `src/lib` class strings).

So adding a class is a contained, well-bounded edit — but it touches a clinical
grouping (`symptom` leaves the `clinical`/alert hue), so the **color choice and
the symptom-membership decision are the load-bearing calls** (Open Questions),
gated by the visual audit + a clinical glance.

## Requirements Trace

- **R1** — New `NodeVisualClass` value `self_report`, with `symptom`,
  `symptom_episode`, `mood`, `energy` mapped to it; `data` keeps only
  `source_document`; `clinical` keeps `condition`, `allergy`.
- **R2** — A distinct, calm color for `self_report` (fill + stroke + selection
  hue), added as a design token and **safelisted** in tailwind.config.ts. Visually
  separable from the other four at a glance; never alarming.
- **R3** — The legend/filter gains a fifth chip **"Symptoms & self-report"**;
  "Source" now reads as provenance only. Each chip hides exactly the class it
  names (closes review A1). Layout holds at the demo's desktop width.
- **R4** — Single source of truth: all changes flow through `visual-encoding.ts`
  (+ the safelist); no surface hard-codes the mapping. `visualForNode` /
  `selectionStrokeClass` / `LEGEND_ITEMS` cover both demo and authed by
  construction.
- **R5** — No behavior change beyond the re-class + the new chip: positions,
  determinism, the source-detail body, the scrubber, and the importance cap are
  untouched. The filter mechanism (ghost predicate, useCategoryFilter) is
  unchanged — it just has five classes now.

## Scope Boundaries

- ❌ No change to node **types** (the `NodeType` enum) or the data model — only
  the type→visual-class mapping.
- ❌ No change to the filter/ghost mechanism, the source-detail body, the
  scrubber, or layout forces.
- ❌ Not introducing per-type colors (still a small fixed set of classes — five,
  not 18).
- ❌ No evidence-hierarchy weighting/ordering changes (that's the clinical-flag
  plan); this is purely the visual class + chip.

## Context & Research

### Relevant Code
- `src/lib/graph/visual-encoding.ts` — `NodeVisualClass`, `NODE_VISUAL_CLASS`,
  `NODE_VISUAL_BY_CLASS`, `SELECTION_STROKE_BY_CLASS`, `LEGEND_LABEL`,
  `LEGEND_ITEMS`, `visualForNode`, `selectionStrokeClass`.
- `src/lib/graph/visual-encoding.test.ts` — asserts "one of the 4 visual
  classes" and "exactly 4 stroke classes"; these become 5.
- `tailwind.config.ts` — `colors` (add the token) + `safelist` (add the new
  fill/stroke; the legend's hidden-state `fill-none`/`stroke-…/70` already exist).
- `src/components/graph/graph-filter-legend.tsx` — renders `LEGEND_ITEMS`; gains
  a fifth chip automatically. Check wrap at the demo width.
- `src/lib/graph/importance.ts` / canvas — class is render-only; no scoring tie.

### Institutional Learnings
- The Tailwind content-glob trap (`docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`):
  every new fill/stroke string **must** be safelisted (they live in `src/lib`).
- Visual-audit gate (`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`):
  the new color + five-chip legend are browser-verified.

## Key Technical Decisions
- **One new class, not per-type colors.** Keeps the pre-attentive 3-5 color cap.
- **Symptoms are patient-reported → they join self-report.** A symptom is a
  subjective, reported finding; conditions/allergies are the objective clinical
  layer. So `clinical` = {condition, allergy}; `self_report` = {symptom,
  symptom_episode, mood, energy}. (Alternative — mood/energy only — in Open
  Questions; the chosen mapping matches the product direction's named members.)
- **Color from a new calm token**, not a reuse of alert/positive/caution (those
  carry status meaning). A muted, low-saturation hue (e.g. slate/indigo family)
  distinct from the graphite `data` grey and the accent biomarker blue — picked
  in the audit.
- **Drive everything from `visual-encoding.ts` + safelist** — no surface edits
  beyond what reads `LEGEND_ITEMS`/`visualForNode`.

## Open Questions
- **Symptom membership (the load-bearing call):** move `symptom` +
  `symptom_episode` into `self_report` (recommended — matches "Symptoms &
  self-report"), or keep symptoms in `clinical` and make the class mood/energy
  only (label just "Self-report")? Moving symptoms changes the `clinical` class's
  visual weight (loses the alert hue for subjective findings) — wants a clinical
  glance + visual audit. **Recommend: move them**, per the product direction.
- **Exact color token** — dialed in the audit (must clear contrast on the canvas
  background and be distinct from the other four).
- **Chip label length** — "Symptoms & self-report" is long; confirm the 5-chip
  legend wraps cleanly at the demo's desktop width (else shorten to "Self-report").

## Implementation Units
- [ ] **U1: Add the `self_report` visual class (encoder + tests)**
  - `visual-encoding.ts`: extend `NodeVisualClass`; remap `symptom`,
    `symptom_episode`, `mood`, `energy` → `self_report`; add `NODE_VISUAL_BY_CLASS`,
    `SELECTION_STROKE_BY_CLASS`, `LEGEND_LABEL` ("Symptoms & self-report"),
    `LEGEND_ITEMS` entries.
  - `tailwind.config.ts`: add the color token + safelist the new fill/stroke (+
    selection stroke).
  - `visual-encoding.test.ts`: update the "valid classes" set to 5; assert the
    new mapping (symptom/mood/energy → self_report; source_document → data;
    condition → clinical); `LEGEND_ITEMS` lists 5 in order; selection strokes = 5.
  - Verify: demo + authed canvas render the new hue; the filter shows 5 chips and
    "Source" no longer ghosts mood/energy.
- [ ] **U2: Legend/filter layout + audit**
  - `graph-filter-legend.tsx`: confirm 5 chips wrap; no code change beyond what
    `LEGEND_ITEMS` drives (verify, adjust spacing if needed).
  - Visual audit (demo + a real record): color distinctness, calmness, label fit,
    and that each chip hides only what it names.

## System-Wide Impact
- All canvas surfaces inherit the class via `visual-encoding`. The filter ghost
  predicate (`visualForNode(type).visualClass`) automatically routes the new
  class. The source-detail body, scrubber, and positions are untouched.
- `selectionStrokeClass` count goes 4→5 (the test asserting "exactly 4" updates).

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| New fill/stroke JIT-dropped (src/lib trap) | Safelist every new class in tailwind.config.ts; test asserts class shape |
| Moving `symptom` out of `clinical` loses a clinically-meaningful hue | Open Question + clinical glance + visual audit; alternative mapping documented |
| 5th chip breaks legend layout at narrow desktop | Verify wrap; shorten label if needed |
| Color clashes / indistinct | Visual-audit gate; pick a calm, contrast-clearing token |

## Sources & References
- Review origin: `docs/plans/2026-06-17-003-…` (Q2 decision).
- Encoder: `src/lib/graph/visual-encoding.ts` (+ test), `tailwind.config.ts`.
- Tailwind trap: `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`.

## Future Considerations
- A formal **evidence hierarchy** (lab > clinician > device > self-report) could
  later drive ordering/weight, not just color — pairs with the clinical-flag plan.
