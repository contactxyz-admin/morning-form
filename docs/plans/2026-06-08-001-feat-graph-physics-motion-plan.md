---
title: "feat: Physics-based motion for the health graph (settle-in + spring drag)"
type: feat
status: active
date: 2026-06-08
deepened: 2026-06-08
---

# feat: Physics-based motion for the health graph

## Overview

The node-link health graph (`src/components/graph/`) already runs a D3 force simulation, but it pre-warms ~80 ticks, `.stop()`s, writes positions once, and freezes — no live motion, no drag. This plan **un-freezes it deliberately**, in two phases:

- **Phase 1 (ships — solves the actual complaint "the graph looks lifeless"):** nodes animate from their seed into the force-solved positions on load (an eased "physics settling"). Motion runs only during the entrance then stops; reduced-motion and SSR render the frozen layout instantly.
- **Phase 2 (deferred, validation-gated):** spring **drag** and smooth **relayout-on-data-change** — higher-risk, weaker-justified interactions (see Sequencing). Built only after Phase 1 proves the feel and a real reason to manipulate the layout appears.

The motion model is ported from Manim Community (inspiration, not a dependency — this is a React/TS/SVG/D3 app): Manim's "physics" is a one-shot solver plus a reactive **ValueTracker + updater + rate-function + `alpha = elapsed/run_time`** interpolation stack. We already *have* the solver (D3 force) and an animation driver (`framer-motion`, already a dependency); we add only the eased-tween/updater wiring.

## Problem Frame

The graph appears fully-formed and static — no sense of the physics underneath. The owner's request: make it feel physical, using Manim as inspiration. Research confirmed "the graph" = the node-link knowledge graph in `src/components/graph/` (not the marker sparklines), whose D3 simulation is currently run-to-convergence-then-discarded. No upstream requirements doc; built directly from the request + repo/Manim research. This is owner-driven polish, not validated demand — so it is scoped tight and sequenced so the part that solves the complaint ships first (see Sequencing & Opportunity Cost).

## Requirements Trace

Phase-tagged so a stop at the Phase 1 boundary is honest about what's delivered.

- **R1** *(Phase 1)* — On load, nodes animate from seed into the force-solved layout (eased settle-in), with edges tracking endpoints each frame.
- **R4** *(Phase 1)* — The **first-paint** converged layout for a given seed/data, **with no user interaction**, is byte-identical to today's frozen layout (so fixtures/SSR don't regress). *Post-interaction positions (drag, relayout) intentionally diverge — see non-goal.*
- **R5** *(Phase 1)* — `prefers-reduced-motion` (and the existing desktop-only/SSR gates) render the frozen end-state instantly: no entrance tween, and in Phase 2 no drag-spring — i.e. exactly today's behavior.
- **R6** *(Phase 1+2)* — Motion is transient: every animation loop stops when it settles (no perpetual ticking / battery drain), and is torn down on unmount/re-init.
- **R2** *(Phase 2, gated)* — Dragging a node moves it under the pointer, springs connected neighbors via the existing forces, and settles to a frozen rest on release.
- **R3** *(Phase 2, gated)* — When graph data changes in-session, existing nodes stay pinned and only new/affected nodes animate into place (no full reflow).

## Scope Boundaries

- ❌ A continuously-living simulation that perpetually wobbles/reflows — rejected; motion always ends at a frozen rest state.
- ❌ Zoom / pan / minimap (the canvas already deliberately omits these).
- ❌ Mobile force-graph motion — mobile renders `GraphListView`; motion is desktop-only via the existing `hidden md:block` gate.
- ❌ Persisting drag positions to the DB / changing `/api/graph` payload or the 200-node cap.
- ❌ Changing the marker trajectory sparklines (`src/components/ui/sparkline.tsx`).
- ❌ Swapping rendering tech (stay on SVG + D3; no Canvas/WebGL/react-flow/visx).
- ❌ **Post-interaction determinism** — once a user drags or data changes, the layout is intentionally seed+offset, NOT the deterministic solve. R4 covers first paint only.

### Deferred to Separate Tasks

- **Phase 2 itself (drag R2, relayout R3)** — built only after Phase 1 ships and a validation trigger fires (see Sequencing). R3 additionally depends on confirming an in-session data-change path exists on these surfaces.
- Persisting a user's manual arrangement to `GraphNodeLayout` (a data-model change) — would give drag a lasting outcome; separate plan.
- Keyboard-operable node repositioning (WCAG 2.5.1) — out of scope for this cosmetic interaction; documented as a **conscious accessibility gap**, not an oversight.
- Animated focus/expand transition when opening a node's detail sheet.

## Context & Research

### Relevant Code and Patterns

- **Physics engine (primary edit target):** `src/components/graph/use-graph-state.ts` — `useGraphState`, `SimulationNode` (declares `fx/fy/vx/vy` — confirmed), `SimulationEdge`; builds `forceSimulation` + `forceManyBody(-260)` + `forceLink` + `forceCenter(0.15)` + `forceCollide`, seeds via Mulberry32 `makeRng(seed)` (RNG drawn **once**, in fixed order: two draws per node for seed positions, then handed to the sim via `.randomSource(rng)` for the 80 ticks), pre-warms `TICKS = 80`, then `.stop()`s and **holds** the sim in `simulationRef` (retained, not discarded — so `alphaTarget().restart()` is viable). The cleanup `useEffect` runs `simulationRef.current?.stop(); simulationRef.current = null` on every `dataSignature` change and unmount; `initGraph` does `selectAll('*').remove()` and rebuilds.
- **SVG wrapper + interaction:** `src/components/graph/graph-canvas.tsx` — `GraphCanvas`; renders empty `<svg>`, D3 fills it; hover/focus dims non-neighbors via imperative `style.opacity` swaps using a 1-hop `neighbourIds` set (built from `edge.fromNodeId/toNodeId`). **Pre-existing footgun:** the dim path also parses `data-edge-id` by splitting on `__`, but `data-edge-id` is set to the raw edge id (cuid, no `__`) — so that split is suspect/likely-broken; **do not copy it.** Header comment says "No zoom/pan, no drag."
- **Visual encoding:** `src/lib/graph/visual-encoding.ts` — `radiusForTier` (12/9/7), `visualForNode`, `visualForEdge`.
- **Render sites:** `src/components/demo/demo-graph-section.tsx` (`DemoGraphSection`, **public** `/demo/record`, "The graph — interactive") and `src/components/record/vault-layout.tsx` (`VaultMapMode`, authed `/record?mode=map`, desktop-only).
- **Deps (package.json):** `d3 ^7.9.0` (bundles `d3-drag@3` — `d3.drag` available, no extra dep), `framer-motion ^11.18.2` (ships `animate()` imperative driver), `react ^18.3.1`, `next 14.2.35`. No react-spring.
- **Test env:** `vitest.config.ts` → `environment: 'node'` (no jsdom, no DOM, no `requestAnimationFrame`/`window.matchMedia`). **There are zero `.test.ts(x)` files under `src/components/graph/`.** This hard-constrains the test strategy (see Key Decisions).

### Institutional Learnings (load-bearing)

- **Determinism is a contract** (`docs/plans/2026-05-01-001-feat-graph-canvas-viz-plan.md`): Mulberry32 seed → byte-identical positions; pre-warm-then-stop avoids load jitter; StrictMode handled by ref-guards. The tween must change only the *path*, not the converged target (R4).
- **Desktop-only + 200-node cap + seed-from-pinned** (`docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`).
- **D3 silently drops edges whose target node isn't in the node array** (`docs/plans/2026-05-15-001-feat-show-graph-at-any-density-plan.md`) — Phase 2 relayout must keep node/edge arrays consistent.
- **Tailwind JIT drops data-driven SVG classes from `src/lib/**` unless in the `content` glob** (`docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`) — any new cursor/drag class must be safelisted or it renders invisibly while checks pass green.
- **Visual audit is a non-optional gate** (`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`) — code review can't catch invisible-canvas / motion-feel failures.
- **No existing rAF / matchMedia / animation-loop precedent in the repo** — confirmed by grep; the motion wiring is net-new (worth a `/ce:compound` writeup after).

### External References — Manim motion model (inspiration)

Web-portable stack, exact files studied: reactive scalar + updaters (`manim/mobject/value_tracker.py`, `manim/mobject/mobject.py`); easing (`manim/utils/rate_functions.py` — `smooth`/smoothstep is the default S-curve); normalized-time interpolation `alpha = elapsed/run_time` snapping to 1 (`manim/animation/animation.py`); one-shot layout + edges-follow-vertices (`manim/mobject/graph.py`'s `update_edges`); and the key insight that **`d3-force` *is* the continuous Fruchterman-Reingold spring sim** Manim delegates one-shot to networkx — so Phase 2 drag re-energizes the existing D3 sim rather than writing a physics engine.

## Key Technical Decisions

- **Use the existing D3 simulation as the physics and `framer-motion`'s `animate()` as the tween driver — write no custom rAF loop.** `animate(0, 1, { duration, ease, onUpdate, onComplete })` gives a cancellable, rAF-backed alpha; `onUpdate(alpha)` writes node `transform` + edge endpoints (the "updater"). This avoids reinventing a loop the repo already has and removes the YAGNI `rafLoop`/`thereAndBack` from scope.
- **Easing stays pure and testable; everything DOM/rAF is thin.** `src/lib/graph/motion.ts` exports only pure functions: easing (`smooth`, `easeOutCubic`) and a DOM-free frame-stepper `entranceFrame(start, target, easedAlpha) -> positions[]`. These are the unit-tested surface. The hook wires `animate()` → `entranceFrame` → D3 writes. **This extraction is mandatory, not a fallback** — because vitest runs in `node` with no DOM, the hook itself cannot be unit-tested; only the pure seams can.
- **R4 (determinism), stated precisely:** keep `makeRng(seed)` + the 80-tick solve **exactly as-is and constructed once** — the RNG single-stream order (seed positions then `.randomSource`) defines today's frozen output. The entrance must **snapshot `start` from the existing `simNodes` array immediately after seeding (before the tick loop) and `target` from the same array after the loop** — never re-instantiate `makeRng` or re-solve for the tween. R4 holds at first paint, pre-interaction, only; post-drag/relayout divergence is an explicit non-goal.
- **Reduced-motion / SSR short-circuit to today:** read `prefers-reduced-motion` inside `initGraph` (already client-only; guard `typeof window`), write the target instantly, attach its change-listener removal to the existing cleanup. In node tests `matchMedia` is absent ⇒ the reduced-motion (instant) path is the default tested path.
- **One real animation controller, not three loops (Phase 2):** a single controller owns the current transition with an explicit priority/state machine `idle → entrance → drag → relayout`; starting a higher-priority transition cancels the active one (the `animate()` handle / `alphaTarget`). Define the handoff for **every** ordered pair, not just entrance→drag.
- **Edges are written from the bound D3 datum (`d.source.x/y`, `d.target.x/y`), never by parsing `data-edge-id`** — sidesteps the suspect `__` split; flag that split as a separate pre-existing bug to verify.
- **Phase 2 drag settles deterministically-stopped:** `dragstart` → `alphaTarget(0.3).restart()` + pin `fx/fy`; `drag` → update `fx/fy` (clamped to `[r, w-r]×[r, h-r]`); **`alphaTarget(0)` runs on EVERY termination path** (dragend, pointercancel, pointer-up-outside-SVG, unmount/re-init, data-change-mid-drag) + a watchdog max-duration cap, else the loop ticks forever at alpha→0.3 (R6). Drag retains `fx/fy` for the session (no spring-back, no persist).
- **Reduced-motion drag is a non-force path** (or disabled): moving `fx/fy` while the sim ticks pulls neighbors via `forceLink` regardless of `alphaTarget`, so "move-only" requires writing **only** the dragged node's transform + its incident edges imperatively with the sim stopped. Default for reduced-motion: **disable drag** (simplest, unambiguously honors R5).
- **Drag-vs-click disambiguation:** a movement threshold (~4px) distinguishes a drag from a click-to-open-`NodeDetailSheet`; below threshold the click/sheet-open fires on pointer-up and focus returns to the node first. Touch pointers are filtered out of `d3.drag` (touchscreen laptops: tap still opens the sheet). State whether d3's built-in click-suppression is relied on or overridden.

## Open Questions

### Resolved During Planning

- Continuous vs. settle → settle-in + (deferred) spring-to-frozen; no perpetual sim.
- Which "graph" → the node-link graph in `src/components/graph/`.
- New engine vs. reuse → reuse D3 sim + `framer-motion animate()`; no custom loop/engine.
- Custom tween vs. existing lib → use `framer-motion animate()`; `motion.ts` holds only pure easing + frame-stepper.
- Drag release → retain `fx/fy` for the session, no spring-back, no persist (Phase 2).
- R4 scope → first-paint/no-interaction only.

### Deferred to Implementation

- Exact `run_time` + easing per transition (entrance vs. relayout vs. drag-settle) — tune to feel; start `smooth`/ease-out ~0.6–0.8s entrance.
- Entrance start-state read (seeded cloud vs. center) — pick what the visual audit favors; must be the pre-tick `simNodes` snapshot per R4.
- Session re-animation policy: entrance always plays on the public `/demo`; on the authed route, gate behind a **session play-once** flag (survives route re-entry, not refresh) so back-navigation doesn't re-animate. Confirm the exact mechanism at impl.
- Whether to keep the 80-tick pre-warm (it defines the deterministic target — likely keep).

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

Manim stack → this codebase:

```
networkx spring_layout (1-shot)  →  existing D3 forceSimulation + 80-tick solve   (UNCHANGED → R4)
ValueTracker / alpha=elapsed/rt  →  framer-motion animate(0,1,{duration,ease})    (Phase 1)
add_updater (per frame)          →  animate onUpdate(alpha) → write transforms+edges
rate_functions.smooth            →  pure smooth()/easeOutCubic() in motion.ts      (tested)
Graph.update_edges               →  edges written from d.source/d.target each frame (NOT data-edge-id)
real spring physics (avoided)    →  Phase 2: re-energize existing D3 sim (alphaTarget), cool to rest
```

Phase-1 settle-in (directional):

```
initGraph (motion allowed, not reduced-motion):
  seed simNodes (rng draws)           # start = snapshot here, before ticks  → R4
  for 80: simulation.tick()           # target = snapshot here, after ticks  → identical to today
  animate(0, 1, {duration, ease: smooth, onUpdate(a):
      pos = entranceFrame(start, target, ease(a))   # pure, tested
      writeTransforms(pos); writeEdges(from d.source/d.target)
  , onComplete: writeTransforms(target)})           # exact end-state
reduced-motion / SSR / node-test: writeTransforms(target) immediately   # == today
```

## Implementation Units

### Phase 1 — Settle-in (ships; solves the complaint)

- [ ] **Unit 1: Pure motion primitives (easing + frame-stepper)**

**Goal:** A DOM-free, dependency-light module with the only genuinely-testable logic: easing + position interpolation.

**Requirements:** R1, R4 (foundation)

**Dependencies:** none

**Files:**
- Create: `src/lib/graph/motion.ts` — `smooth(t)`, `easeOutCubic(t)` (pure `(t)→t'`, clamped to [0,1]); `entranceFrame(start, target, easedAlpha) -> {id,x,y}[]` (pure lerp). No React, no DOM, no rAF, no framer-motion import.
- Test: `src/lib/graph/motion.test.ts`

**Approach:** keep the API tiny; the rAF driver is `framer-motion`'s `animate()` in Unit 2, not here. Drop `thereAndBack`/generic `rafLoop` (YAGNI).

**Execution note:** Test-first — this is the reusable, regression-prone core.

**Patterns to follow:** repo test convention (`visual-encoding.test.ts`) — assert behavior/properties, not math identities.

**Test scenarios:**
- Happy: `entranceFrame(start,target,0)===start`, `(…,1)===target`, midpoint strictly between per-node.
- Edge: easing inputs <0 / >1 are clamped; `smooth`/`easeOutCubic` monotonic non-decreasing (sampled).
- Edge: empty node set → empty array; single node → one interpolated point.

**Verification:** pure, DOM-free, deterministic; vitest green in the `node` env.

- [ ] **Unit 2: Settle-in entrance animation**

**Goal:** On mount, drive `framer-motion animate()` to lerp nodes seed→target via Unit 1, edges tracking each frame; honor reduced-motion; tear down cleanly.

**Requirements:** R1, R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/graph/use-graph-state.ts` (snapshot start before ticks / target after; `animate()` onUpdate writes transforms + edges-from-datum; reduced-motion + SSR guard; cancel the `animate()` handle in the existing cleanup; session play-once gate for the authed route)
- Modify: `src/components/graph/graph-canvas.tsx` (only if threading a motion flag / start snapshot)
- Test: `src/lib/graph/motion.test.ts` (the pure frame-stepper carries the testable logic — the hook is not unit-testable in the `node` env; its behavior is covered by the visual-audit gate)

**Approach:** keep seed + 80-tick solve and the single-RNG-stream order unchanged (R4). `prefers-reduced-motion` / SSR / no-`animate` → write target instantly. Hold the `animate()` handle in a ref; `.stop()` it in the same cleanup that stops the sim (StrictMode-safe). Write edges from `d.source/d.target`, never the `__` split.

**Execution note:** Add a **characterization test of today's frozen positions** for a seeded fixture (pure: seed → 80 ticks → positions) BEFORE wiring, and assert the post-change target array is identical — locks R4. Assert `makeRng` is constructed exactly once.

**Patterns to follow:** existing ref-guard / StrictMode lifecycle + imperative transform writes in `use-graph-state.ts`.

**Test scenarios:**
- Characterization (R4): seeded fixture target positions == pre-change frozen positions (path differs, endpoint identical); RNG constructed once.
- Happy: `entranceFrame` produces in-between frames (asserted on the pure fn).
- Edge (R5): reduced-motion / no-DOM → instant target (the default node-test path).
- Edge (R6): cleanup stops the `animate()` handle (assert via the handle/seam); StrictMode double-mount doesn't double-run or leak.
- Edge: empty / single-node graph → no error.

**Verification:** graph visibly settles in on `/demo/record` and `/record?mode=map` (desktop); reduced-motion shows instant frozen layout; no loop after settle; R4 characterization green. **Visual-audit gate (mandatory):** screenshot dense/sparse/empty desktop × motion-on / reduced-motion, **plus** the public-demo entrance at t≈0.3 (early motion) and an edges-catch-up frame (no "rubber-band" lag). **Public-demo acceptance criterion:** reads as *a system settling into rigor* — short run_time, ease-out, no overshoot — not a playful bounce (the product target the audit judges the public surface against).

### Phase 2 — Drag + relayout (DEFERRED, validation-gated)

> **Gate:** build Phase 2 only after Phase 1 ships AND a trigger fires — a real demo/dogfood session shows users trying to grab nodes (R2), or drag positions become persistable (the deferred data-model work, giving drag a lasting outcome). R3 additionally requires confirming an **in-session** data-change path exists on `/record?mode=map` (if data only changes between page loads, Unit 2's entrance already animates it and Unit 4 is unnecessary). These units carry the bulk of the plan's net-new risk for a read-only, zero-user graph; do not bundle them into Phase 1 by default.

- [ ] **Unit 3: Spring drag interaction** *(gated)*

**Goal:** Drag a node under the pointer; neighbors spring via existing forces; settle to a frozen rest; never leak the loop.

**Requirements:** R2, R5, R6

**Dependencies:** Unit 2 (shares the controller + edges-from-datum write-path)

**Files:**
- Modify: `src/components/graph/use-graph-state.ts` (single animation controller; `d3.drag` with `alphaTarget` re-energize, `fx/fy` follow + clamp; `alphaTarget(0)` on every termination path + watchdog; re-attach `d3.drag` at end of `initGraph` after the node selection rebuild; defer a `dataSignature` rebuild that arrives mid-drag until dragend)
- Modify: `src/components/graph/graph-canvas.tsx` (drag handlers on node selection; **dragstart clears the hover/focus dim and suppresses hover until dragend**; cursor states — `grab` on node hover, `grabbing` on body during drag, default during entrance; touch-pointer filter; click-vs-drag threshold ~4px → sheet-open below threshold with focus returned; update the "No drag" comment; safelist any new cursor class per the Tailwind footgun)
- Test: `src/lib/graph/motion.test.ts` + a DOM-free integration test driving a real `d3.forceSimulation` through dragstart/drag/dragend

**Approach:** reduced-motion → **disable drag** (default). Pointer→`fx/fy` mapping clamped to SVG bounds. Edges written from datum each tick while `alpha > alphaMin`.

**Execution note:** Pull the testable seam out: pure `shouldContinue(alpha, alphaTarget, alphaMin)` and `clampToBounds(pt, r, w, h)` are unit-tested; the gesture itself is covered by an integration test (real `forceSimulation`, mocked `getScreenCTM`) + the visual audit (the audit is a *complement*, not the test of record, for the loop-stop guarantee).

**Patterns to follow:** existing `simulationRef` + forces; `SimulationNode.fx/fy/vx/vy`; the hover/focus selection pattern (but NOT its `data-edge-id` parsing).

**Test scenarios:**
- Happy: `shouldContinue` true while `alpha>alphaMin` or `alphaTarget>0`, false once cooled with `alphaTarget===0`; `clampToBounds` keeps points in `[r,w-r]×[r,h-r]`.
- Integration: dragstart pins `fx/fy` and alpha rises; dragend sets `alphaTarget(0)` and the loop's `shouldContinue` goes false; a dragged node's linked neighbor moves, a non-adjacent node ~doesn't.
- Edge (R6): drag "end" never fires (simulate interruption) → teardown still cancels the loop; data-change-mid-drag defers rebuild, no orphaned gesture.
- Edge (R5): reduced-motion → drag disabled (or non-force move-only), no neighbor motion.
- Edge: drag below 4px threshold → detail sheet opens, focus on node; touch pointer → no drag, tap opens sheet.
- Edge: rapid start/stop/start and entrance-mid-drag don't stack loops (one-controller invariant).

**Verification:** dragging on desktop springs neighbors and settles; loop provably stops on every termination path; click/drag/touch disambiguation works; reduced-motion disables it. **Visual-audit:** mid-drag (incl. node at SVG edge — clamped), settled, mid-drag with a previously-dimmed neighbor.

- [ ] **Unit 4: Smooth relayout on in-session data change** *(gated; confirm the path exists first)*

**Goal:** On data change, pin survivors and animate only new/affected nodes — no full reflow, no dropped edges.

**Requirements:** R3, R6 (R4 explicitly does NOT apply post-relayout)

**Dependencies:** Unit 2; the controller from Unit 3

**Files:**
- Modify: `src/components/graph/use-graph-state.ts` (diff old/new node sets; pin survivors `fx/fy=current`; new nodes seeded near a connected neighbor, unpinned; **filter edges referencing absent nodes before render**; brief re-energize; settle; release pins)
- Test: `src/lib/graph/motion.test.ts` (pure diff/seed/edge-filter helpers)

**Approach:** keep node/edge arrays consistent (the density-plan footgun); the relayout converges to a *non-deterministic* incremental layout by design (R4 does not apply).

**Execution note:** extract the set-diff + edge-consistency filter as pure helpers and test those; the sim settle is integration/visual.

**Test scenarios:**
- Happy: adding 1 node leaves existing positions ~unchanged (pinned) and animates the new node in.
- Edge: an edge whose target node is absent is filtered out (not silently dropped by D3) — assert no edge targets an absent id.
- Edge: removing a node cleans its edges without throwing; survivors don't jump.
- Edge: no data change → idempotent (nothing moves); focus a node then change data → dim state re-derives from the new edges (no stranded opacity).

**Verification:** mutating data animates only the delta; edges never vanish; hover-dim stays consistent across a rebuild. **Visual-audit:** before/after a data change.

## System-Wide Impact

- **Interaction graph:** both render sites consume `GraphCanvas`/`useGraphState` and inherit Phase-1 motion automatically. **Caveat:** the hover-dim overlay in `graph-canvas.tsx` is a per-site interaction sharing the DOM the motion now mutates — Phase 2 must clear/re-derive dim state on dragstart and after a relayout rebuild (not "free").
- **State lifecycle risks (central):** the `animate()` handle + (Phase 2) re-energized sim + `d3.drag` + `matchMedia` listener must all tear down in the existing cleanup; `dataSignature`-change-mid-drag must not `selectAll('*').remove()` the dragged node.
- **Determinism / SSR:** seed + pre-warm unchanged; SSR renders empty SVG, client fills it; reduced-motion/node-test ⇒ instant target ⇒ unchanged output. R4 = first-paint only.
- **Unchanged invariants:** `/api/graph` payload + 200-node cap, mobile `GraphListView`, `visual-encoding.ts`, the sparklines, and the first-paint converged layout for a given seed/data.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Hook untestable in `node` vitest (no DOM/rAF) | Pure-extraction is mandatory: easing + frame-stepper + `shouldContinue`/`clampToBounds`/diff helpers are the unit-tested surface; gesture via DOM-free `forceSimulation` integration test + visual audit |
| Tween shifts the converged end-state → fixture/SSR drift (R4) | Snapshot start/target from the same single-RNG-stream `simNodes` (never re-seed/re-solve); characterization test asserts identical first-paint target; reduced-motion writes target directly |
| R4 misread as a global invariant | Restated as first-paint/no-interaction only; explicit non-goal that drag/relayout diverge |
| "One loop" is really three; cross-source races (esp. data-change-mid-drag destroys the dragged node) | Single controller + explicit state machine + per-pair handoff; defer rebuild until dragend |
| Drag loop never stops (alphaTarget(0.3) asymptote) | `alphaTarget(0)` on EVERY termination path + watchdog max-duration cap; R6 interruption test |
| Reduced-motion "move-only" still moves neighbors via forceLink | Non-force path or (default) disable drag under reduced-motion |
| Node dragged off-canvas / click-vs-sheet / touch / cursor confusion | Bounds clamp; 4px drag threshold; touch-pointer filter; specified cursor states; hover-dim cleared on dragstart |
| New cursor/drag class renders invisibly (Tailwind JIT) | Safelist / extend `content` glob; catch in visual audit, not build-green |
| Relayout drops edges referencing absent nodes (D3 footgun) | Filter edges to existing nodes before render; explicit test |
| `data-edge-id` `__` split is already suspect | Write edges from `d.source/d.target` datum, not the split; flag the existing parse as a separate bug |
| Over-investment vs. dogfood/clinical-gate priorities | Phase 1 (settle-in) ships and solves the complaint; Phase 2 is validation-gated, not bundled |

## Sequencing & Opportunity Cost

This is owner-driven polish on a product with no real users, and it introduces the repo's first animation-loop pattern. **Phase 1 (Units 1–2) is the minimum that satisfies the request and the recommended stopping point** — it directly fixes "the graph looks lifeless." **Phase 2 (Units 3–4) is deferred and validation-gated**, weighed against dogfood/clinical-gate work rather than bundled in: drag on a read-only, non-persistent, zero-user graph is a toy until it persists or users demand it, and relayout may animate a transition no one witnesses in-session. Stop after Phase 1 unless a trigger fires.

## Documentation / Operational Notes

- No env vars, flags, schema, or API changes — client-side rendering enhancement; ships via normal merge → Vercel deploy.
- After Phase 1, write a `/ce:compound` note: the Manim-ported motion model + the `framer-motion animate()`-driven settle-in + the R4/RNG-single-stream discipline (the learnings search flagged the gap).
- Pre-merge: run the **visual-audit** screenshots (the one gate code review can't cover for viz) and confirm reduced-motion parity with today.

## Sources & References

- Request: "browse manim.community for inspiration for the physics of the graph" (this session).
- Repo targets: `src/components/graph/use-graph-state.ts`, `src/components/graph/graph-canvas.tsx`, `src/lib/graph/motion.ts` (new), `src/lib/graph/visual-encoding.ts`.
- Related plans: `docs/plans/2026-05-01-001-feat-graph-canvas-viz-plan.md`, `docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`, `docs/plans/2026-05-15-001-feat-show-graph-at-any-density-plan.md`.
- Related solutions: `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`, `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.
- Manim Community source (inspiration): `manim/mobject/value_tracker.py`, `manim/mobject/mobject.py`, `manim/utils/rate_functions.py`, `manim/animation/animation.py`, `manim/mobject/graph.py`, `manim/animation/movement.py`; networkx `spring_layout` (Fruchterman-Reingold).
