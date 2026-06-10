---
title: "feat: Temporal graph canvas — \"the graph shows what changed\" (change signals → scrubber)"
type: feat
status: active
date: 2026-06-10
origin: docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md (§4, §6)
depends_on: docs/plans/2026-06-10-002-feat-longitudinal-health-graph-plan.md (Phase 0 — merged, PR #162)
---

# feat: Temporal graph canvas — Phase 1 (change signals), Phase 2+ (scrubber, causality)

## Overview

Phase 0 (`2026-06-10-002`, merged) made lab markers **storable over time** and shipped two *text/card* surfaces under `/decisions` (a "what changed since last test" card + per-marker sparklines). It did **not** touch the node-link **graph canvas** (`src/components/graph/`), which still renders all of history at once with no temporal cue. The original brief's thesis — *"the graph should show what changed, when, and what moved around it"* — is therefore unmet **in the graph itself**.

This plan makes the **canvas** temporal, smallest-useful-thing first:

- **Phase 1 (ships):** biomarker concept nodes whose latest reading moved carry a flag-gated **change decoration** — a Δ direction badge + a **one-shot pulse** on data-change, reduced-motion → static ring — and tapping the node opens the existing detail sheet with **before → after** and a link to the trajectory. Reuses Phase 0's `diffLatestPanels`/`classifyChange` end-to-end. This is the cheapest path to the canvas *visibly* expressing time.
- **Phase 2 (deferred, validation-gated):** the **time scrubber** (`asOf`) — drag a date axis; nodes dim/hide by when their evidence landed; the graph re-decorates as-of that date; event overlays for uploads/visits/actions.
- **Phase 3 (deferred):** **causality over time** — populate the latent `OUTCOME_CHANGED` / `intervention_event` edges (defined in the schema, never written) so the graph shows "you started X → marker Y moved."

Phase 1 is the recommended stopping point until a real demo/dogfood session validates the feel — same sequencing discipline as `2026-06-08-001` (physics motion: Phase 1 ships, Phase 2 gated).

## Problem Frame

The canvas (`graph-canvas.tsx` + `use-graph-state.ts`) runs a deterministic D3 force sim with a shipped settle-in entrance, spring drag, and zoom — but **zero temporal signal**. The only time-awareness anywhere is a +1 importance bonus for recently-cited nodes (`importance.ts`). Phase 0 added the *data* (dated `observation` instances, `diffLatestPanels`) but routed every temporal *view* to `/decisions`. So a user looking at their health **graph** cannot see that ferritin just moved, or what changed since their last panel. Closing that — on the canvas — is this plan.

## Requirements Trace

Phase-tagged so a stop at the Phase 1 boundary is honest about what's delivered.

- **R1** *(P1)* — A biomarker concept node whose latest reading changed vs the prior panel renders a **direction badge** (range-relative: improved / worsened / stable / new — reusing `classifyChange`'s vocabulary, never causal/alarming).
- **R2** *(P1)* — On load (and on in-session data change), changed nodes play a **one-shot pulse** that **does not perturb the converged layout** (determinism contract from `2026-06-08-001` holds); motion ends at a frozen rest (no perpetual ticking).
- **R3** *(P1)* — `prefers-reduced-motion` / SSR / node-test render the **static end-state** (badge + a static ring, no pulse) — exactly today's no-motion behavior plus the badge.
- **R4** *(P1)* — Tapping a changed node opens `node-detail-sheet` showing **before → after** (value, unit, dates) + a link to `/decisions/marker/[name]`.
- **R5** *(P1)* — All of the above is gated by `LONGITUDINAL_GRAPH_ENABLED`. **Flag off → `/api/record` payload and canvas render are byte-for-byte today's** (verified by a parity test). Instance *writes* remain unconditional (Phase 0 decision).
- **R6** *(P2, gated)* — A time scrubber sets an `asOf` date; nodes whose earliest evidence postdates `asOf` dim/hide; surviving nodes show their value as-of that date; scrub transitions are eased and reduced-motion-safe.
- **R7** *(P3, gated)* — `intervention_event` + `OUTCOME_CHANGED` edges are written from the action lifecycle so "what moved after action X" is graph-native; event overlays mark uploads/visits/actions.

## Scope Boundaries

- ❌ No continuous scrubber in Phase 1 (R6 is deferred).
- ❌ No causality-edge population in Phase 1/2 (R7 deferred — it's data-plumbing, not visualization).
- ❌ No new node/edge **types**; no schema change in Phase 1 (the change signal is a computed decoration on the wire payload, not persisted).
- ❌ No mobile force-graph motion — mobile renders `GraphListView`; canvas motion stays desktop-only via the existing gate. (Phase 1 should still surface the badge in the list view as static text — cheap, and mobile shouldn't be temporally blind.)
- ❌ No change to the 200-node cap, the `/api/record` contract shape (only an **optional additive** field), or the deterministic first-paint layout.
- ❌ No persistence of view state (asOf, toggles) to the DB.

### Deferred to Separate Tasks

- Phase 2 (scrubber) and Phase 3 (causality) — own plans, gated on Phase 1 shipping + a validation trigger (a demo/dogfood session shows the change signal lands but users want to move through time).
- Feeding the history series into the scribe/LLM context — DPIA/consent-gated (brainstorm §9); unrelated to the canvas and out of scope here.

## Key Technical Decisions

- **The change signal is a computed decoration on `/api/record`, not a new persisted field.** The record route computes `diffLatestPanels` (flag-gated, already in a try/degrade pattern from Phase 0) and passes a `joinKey → change` map into `aggregateRecord`, which attaches an **optional** `change?: { direction, classification, beforeValue, afterValue, unit, beforeAt, afterAt }` to matching **biomarker concept** nodes in `nodeRecordToWire`. One round-trip; flag-off omits it entirely (R5).
- **Marker→node join reuses Phase 0's key.** `diffLatestPanels` keys by `registryKey ?? canonicalKey`; biomarker concept nodes carry `canonicalKey` + `attributes.registryKey`. Match on that — no displayName matching (the collision Phase 0's review fixed).
- **Pulse is a pure primitive + the existing `animate()` driver.** Add `pulseScale(easedAlpha) -> number` to `src/lib/graph/motion.ts` (pure, node-testable, like `entranceFrame`). The hook drives it via the same `framer-motion animate(0,1,{duration,ease})` already used for the entrance, on a **transform-scale on the node's own `<g>`** — never on `cx/cy`, so converged positions are untouched (R2 determinism). One-shot; torn down in the same cleanup as the entrance/drag handles (R2 no-perpetual-tick).
- **Reduced-motion / SSR / node-test → badge + static ring, no pulse** (R3) — reuse `computeMotionAllowed()`; the static ring reuses the existing selection-halo render path with a change-hued stroke.
- **Badge colors are data-driven SVG classes → they MUST be safelisted.** `tailwind.config.ts` already has a `safelist`; add the change-hue fill/stroke classes (the documented JIT trap: `tailwind-content-glob-missing-classes-2026-05-16`). Caught by visual audit, not build-green.
- **Optional importance lift (decide at impl):** a changed marker is worth surfacing — consider a small `+1` importance bonus (mirroring the recency bonus in `importance.ts`) so a moved marker isn't hidden below the 200-node cap. Gated by the same flag. Flag this in the unit; default to including it only if the visual audit shows changed markers getting capped out.
- **Test strategy is fixed by the env:** vitest is `node` (no DOM/rAF). The unit-tested surface is the pure pieces — `pulseScale`, the diff→node decoration mapper, the classification→hue map, the flag-off parity of the payload. The gesture/pulse feel is the **visual-audit gate** (mandatory for canvas motion per `visual-audit-non-optional-ui-gate-2026-05-16`).

## Implementation Units (Phase 1)

- [ ] **U1: Change decoration on the record payload.** Add optional `change?` to `GraphNodeWire` (`src/types/graph.ts`) + thread it through `nodeRecordToWire` (`src/lib/record/types.ts`) and `aggregateRecord` (accept a `changeByJoinKey` map, attach to matching biomarker concepts). Record route (`src/app/api/record/route.ts`) computes `diffLatestPanels` flag-gated (reuse the Phase 0 try/degrade) and builds the map. **Test:** mapper attaches change to the right concept by registryKey/canonicalKey; flag-off → no `change` field anywhere (byte-for-byte parity); diff failure → payload still renders (degraded).
- [ ] **U2: Pure pulse primitive + classification hue.** `pulseScale(easedAlpha)` in `motion.ts`; a `changeVisual(classification)` hue map in `visual-encoding.ts` (improved/worsened/stable/new → token classes). **Test:** `pulseScale(0)===1`, peak in the middle, returns to 1 at α=1 (one-shot, no residual); hue map total over the enum.
- [ ] **U3: Render badge + pulse on the canvas.** `use-graph-state.ts` drives a one-shot `animate()` pulse (scale on the node `<g>`) for nodes with `change`, gated by `computeMotionAllowed()`; `graph-canvas.tsx` renders the Δ badge; reduced-motion → static ring via the selection-halo path. Safelist the hue classes. **Visual-audit gate:** dense/sparse, motion-on vs reduced-motion, a node mid-pulse, badge legibility at 320px, and confirmation the converged layout is unchanged (R2).
- [ ] **U4: Detail sheet before→after + list-view badge.** `node-detail-sheet.tsx` shows before→after + the `/decisions/marker/[name]` link when `change` is present; `graph-list-view.tsx` shows the badge as static text (mobile parity). **Test:** sheet renders before→after for a changed node and omits cleanly when absent.
- [ ] **U5: Flag-flip readiness + audit.** Confirm flag-off parity test, reduced-motion parity, visual-audit artifacts on the PR, Tailwind cold-render check for the hue classes. **No new flag** — reuses `LONGITUDINAL_GRAPH_ENABLED`.

## Phase 2+ (sketch only — separate plans, gated)

- **Scrubber (R6):** `asOf` dimension on the read path (per-node first-evidence date + as-of value from the trajectory); eased scrub transitions in `use-graph-state.ts`; event overlays from `SourceDocument.capturedAt` / `Action.*At`. Validation trigger: Phase 1 lands and a session shows demand to move through time.
- **Causality (R7):** write `intervention_event` + `OUTCOME_CHANGED` from the action lifecycle (the loop Phase B already tracks); "what moved after I started X."

## System-Wide Impact

- **Read path:** `/api/record` gains one optional field + (flag-on) one `diffLatestPanels` call already bounded in Phase 0. Flag-off path unchanged.
- **Determinism/motion:** seed + 80-tick solve + converged layout unchanged; pulse is scale-only on the node group, torn down with the existing handles; reduced-motion/SSR/node-test = static. The `2026-06-08-001` contracts (R4 determinism, R6 transient) are explicit requirements here.
- **Unchanged invariants:** node cap, mobile list view, edge rendering, instance exclusion from the canvas (Phase 0 U6), GDPR (no new persisted data in Phase 1).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Pulse perturbs converged positions → fixture/SSR drift | Scale-only on the node `<g>`, never `cx/cy`; characterization test that converged positions are byte-identical (R2) |
| Perpetual ticking / battery drain | One-shot `animate()`, torn down in the existing cleanup; reduced-motion gets none (R3/R6) |
| Data-driven badge hues dropped by Tailwind JIT | Safelist the classes; cold-render check in the audit (documented trap) |
| Changed marker hidden below the 200-node cap | Optional flag-gated importance lift (U1/impl decision), validated in the audit |
| Flag-off behaviour drifts | Byte-for-byte payload parity test (R5) |
| Over-investment before validation | Phase 1 only; scrubber + causality gated on a real trigger |

## Sequencing & Opportunity Cost

This is a pre-launch, flag-gated, zero-real-user surface. **Phase 1 (Units 1–5) is the minimum that makes the graph visibly temporal and reuses already-merged Phase 0 data — and is the recommended stop.** Phase 2 (scrubber) is the headline but materially larger and weakly justified until someone sees Phase 1 and asks to move through time; Phase 3 (causality) is data-plumbing that should follow the action-lifecycle work, not lead it. Building either now would be speculative motion work on a graph no user has yet asked to time-travel.

## Sources & References

- Origin: `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md` (§4 product experience, §6 graph physics & visual language).
- Depends on: `docs/plans/2026-06-10-002-feat-longitudinal-health-graph-plan.md` (Phase 0 — `diffLatestPanels`, `classifyChange`, instance model; merged PR #162).
- Motion contracts: `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` (determinism, transient motion, reduced-motion, node-env test strategy).
- Learnings: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`, `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`, `docs/solutions/best-practices/filter-derived-nodes-at-the-query-layer-not-only-the-aggregator-2026-06-10.md`.
- Code: `src/components/graph/{graph-canvas,use-graph-state,node-detail-sheet,graph-list-view}.tsx`, `src/lib/graph/{motion,visual-encoding}.ts`, `src/lib/record/{aggregate,types}.ts`, `src/app/api/record/route.ts`, `src/lib/markers/panel-diff.ts`, `src/types/graph.ts`.
