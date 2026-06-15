---
title: "feat: Demo graph time scrubber (temporal canvas, demo-only)"
type: feat
status: active
date: 2026-06-15
origin: docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md
---

# feat: Demo graph time scrubber (temporal canvas, demo-only)

## Overview

Make the `/demo/record` health graph **move through time**: a draggable date axis below the canvas where dragging back hides nodes that hadn't been discovered yet, dims their edges, and turns off the "what changed" rings — so the graph visibly *grows* from a sparse first panel (2024) to today's full picture, with the change rings lighting up at the panel where each marker moved.

This is the demo-only realization of **Phase 2 (R6)** sketched in `2026-06-10-003` ("the time scrubber — drag a date axis; nodes dim/hide by when their evidence landed"). That plan deferred Phase 2 "until a demo/dogfood session shows demand to move through time." We're building it **in the demo first** precisely because the demo is the right validation vehicle and the cheapest place to build it: it runs off a static fixture with **no `LONGITUDINAL_GRAPH_ENABLED` flag, no database, no `/api/record` round-trip** — the three things that make Phase 2 expensive in prod and free here.

The existing "what changed since last test" decoration (rings, badges, pulse, detail sheet) already ships in the demo. This plan adds the *time dimension* on top of it.

## Problem Frame

The demo canvas (`src/components/graph/graph-canvas.tsx` + `src/components/graph/use-graph-state.ts`) renders all of history at once — a single as-of-today snapshot with change annotations. A viewer can see *that* ferritin moved, but not watch the graph assemble itself over the user's journey. The temporal story — "you arrived with two flags in 2024, and here's everything we've learned since" — is the most compelling thing the product does, and the graph can't tell it yet.

The data to tell it is *almost* there: the demo fixture (`prisma/fixtures/synthetic/graph-narrative.ts`) already carries change decorations with `beforeAt` (2024-04-20) and `afterAt` (2026-02-10) dates, and source documents with `capturedAt` dates. What's missing is (a) a per-node "when did we first learn this" date, (b) a scrubber control, and (c) an as-of render path that dims un-born nodes **without disturbing the converged D3 layout**.

## Requirements Trace

- **R1** — A date scrubber below the demo canvas lets the viewer move `asOf` across the persona's timeline. Default position = latest (page loads exactly as it does today).
- **R2** — Dragging `asOf` earlier dims nodes whose first evidence postdates `asOf` (and the edges incident to them); dragging later re-reveals them. Surviving nodes keep their exact converged positions — **no relayout, no entrance replay, no scatter**.
- **R3** — A node's "what changed" decoration (ring + badge + pulse) is hidden until `asOf` reaches the change's `afterAt` date, so the rings light up at the panel where the marker actually moved.
- **R4** — The scrub is reduced-motion-safe: opacity transitions honor `prefers-reduced-motion` (instant, no easing) the same way the canvas's existing motion does.
- **R5** — **Prod parity:** the shared canvas component is byte-for-byte unchanged when the scrubber is not wired. The new behavior is an **opt-in prop** that the authed `/graph` path never sets; with it absent, render is identical to today (verified by the existing determinism/parity posture).
- **R6** — Demo-only and self-contained: no `LONGITUDINAL_GRAPH_ENABLED` dependency, no schema change, no `/api/record` change, no persisted view state.

## Scope Boundaries

- ❌ No prod `/graph` scrubber — this is `/demo/record` only.
- ❌ No env flag, no DB column, no API field, no migration.
- ❌ No as-of **value** recomputation (e.g. showing ferritin's *value* at the scrubbed date) on the canvas. The detail sheet already shows before → after with both dates; that's the temporal value story and it stays as-is.
- ❌ No event overlays (upload/visit/action markers on the axis) — that's the richer end of Phase 2; this plan is the node-dimming spine only.
- ❌ No continuous animated playback ("play" button auto-advancing time). The scrubber is drag-only. (Cheap to add later if the demo lands — noted in Future Considerations.)
- ❌ No causality edges (Phase 3 / R7 in the origin plan) — untouched.

### Deferred to Separate Tasks

- Porting the scrubber to the authed `/graph` view: a separate plan, gated on the real `LONGITUDINAL_GRAPH_ENABLED` read path and per-node first-evidence dates from the trajectory store — exactly the Phase 2 work `2026-06-10-003` describes. This demo build is the validation trigger for it.

## Context & Research

### Relevant Code and Patterns

- `src/components/demo/demo-graph-section.tsx` — the client wrapper that owns selection state and renders `<GraphCanvas>`. The scrubber control and `asOf` state live here. Already memoizes `canvasNodes`/`canvasEdges`; the scrubber must **not** be added to those memos' identity (see the entrance-replay risk).
- `src/lib/demo/graph-adapter.ts` — `adaptDemoFixture` / `nodeToWire`. The `change` field is already threaded through here (`...(node.change ? { change: node.change } : {})`); `firstSeenAt` follows the identical additive pattern.
- `src/components/graph/use-graph-state.ts` — the D3 sim + render. **Critical:** `dataSignature` (≈ line 247) includes `change?.classification`, and a signature change "wipe[s] the DOM + restart[s] the 700ms entrance" (≈ line 242). The as-of effect must keep `asOf` **out of** `dataSignature` and mutate opacity imperatively on already-rendered selections. The change ring / pulse / badge are appended as child circles of each node `<g>` (≈ lines 484–509) — the as-of effect targets those.
- `src/components/graph/graph-canvas.tsx` — passes props into `useGraphState`. New optional `asOfEpoch` prop threads through here.
- `src/lib/graph/motion.ts` + `computeMotionAllowed()` (use-graph-state ≈ line 83) — the existing reduced-motion/SSR gate to reuse for R4.
- `prisma/fixtures/synthetic/graph-narrative.ts` — the `METABOLIC_PERSONA_GRAPH` fixture (32 nodes, 4 change decorations). Where the per-node `firstSeenAt` dates are authored.
- `prisma/fixtures/demo-navigable-record.ts` — `DemoNode` type (already has optional `change?: NodeChangeWire`); add optional `firstSeenAt?: string`.

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` — canvas motion/visual changes carry a **mandatory human visual-audit gate**; vitest is `node` (no DOM/rAF) so the scrub *feel* can't be unit-proven. The pure logic is unit-tested; the interaction is audited in a browser (closing unit of this plan).
- `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` — the determinism + transient-motion contracts: seed + 80-tick solve → converged layout must stay byte-identical; motion is scale/opacity only, never `cx/cy`. R2 here is the same contract.

### External References

None. Strong local patterns (the canvas, the adapter, the prior temporal plan) cover the design end-to-end; no external research warranted.

## Key Technical Decisions

- **Scrub bypasses the React data path entirely.** `asOf` is *not* a new field on the wire nodes and is *not* in `dataSignature`. It threads down as a single scalar prop (`asOfEpoch?: number | null`) and drives a dedicated `useEffect` that walks the existing node/edge/decoration D3 selections and sets `opacity`. Rationale: any change to node data identity re-inits the graph and replays the 700ms entrance (DOM wipe + scatter→settle) on every scrub tick — the exact failure R2 forbids. Opacity-only mutation on a frozen layout is both correct and the cheapest possible render.
- **Per-node time is an additive optional field, mirroring `change`.** Add `firstSeenAt?: string` to `DemoNode` and `GraphNodeWire`; `adaptDemoFixture` copies it through. Absent → treated as "always present" (born before any scrub stop). This keeps the wire shape byte-identical for prod (R5) and for undecorated demo nodes.
- **Discrete stops, not a continuous axis.** The slider snaps to the persona's actual evidence dates (the sorted, de-duplicated set of `firstSeenAt` + change `afterAt` values). This tells a truthful "these panels happened on these dates" story, snaps crisply, and avoids interpolating dates that mean nothing. A pure helper derives the stop list from the fixture.
- **Native `<input type="range">`.** Indexed 0…N-1 over the stop list with a date label. No slider dependency, no custom drag handling — the platform control is keyboard-accessible and reduced-motion-neutral out of the box.
- **Source hub nodes inherit their source's `capturedAt`.** The synthesized `source_document` pseudo-nodes (`demo-graph-section.tsx` `canvasNodes` memo) get `firstSeenAt = capturedAt` so a source dot appears exactly when its document landed.
- **Edges follow their endpoints.** An edge is dimmed iff either endpoint is dimmed — derived in the as-of effect from the same born/asOf test, no per-edge date authoring needed.
- **The detail sheet is untouched.** It already shows before → after with dates (the temporal *value* story). Re-deriving as-of values there is out of scope.

## Open Questions

### Resolved During Planning

- *How to avoid the entrance replaying on every scrub?* → Keep `asOf` out of `dataSignature`; mutate opacity imperatively (Key Decisions).
- *Continuous vs discrete time axis?* → Discrete stops at real evidence dates.
- *Where does per-node time come from?* → Authored `firstSeenAt` on fixture nodes (the demo is hand-curated; this is authoring, not inference).
- *Does this touch prod?* → No. Opt-in prop, demo-only wiring, additive optional fields (R5/R6).

### Deferred to Implementation

- **Exact stop dates and which nodes are born when** — a fixture-authoring/storytelling decision made while seeing the graph render (U1). The constraint: ~3–4 distinct stops that make the metabolic-persona graph visibly grow (sparse 2024 baseline → full 2026 picture with rings lit). Best tuned against the live canvas, not pre-specified.
- **Opacity value for "dimmed" + transition duration** — pick against the real canvas in the visual audit so dimmed nodes read as "not yet known" without vanishing (a faint ghost likely beats full hide, for layout legibility). Execution-time visual call.
- **Whether dimmed source-hub nodes also drop their labels** — minor; decide in the audit.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Data flow — note the scrubber path (right) deliberately does **not** re-enter the memoized data path (left) that feeds `dataSignature`:

```
fixture (firstSeenAt + change.afterAt per node)
        │
        ▼
 adaptDemoFixture ──► canvasNodes/Edges ──► <GraphCanvas nodes edges …>
        │                                          │
        │                                   useGraphState
        │                                   ├─ initGraph()  ← keyed on dataSignature (NO asOf)
        │                                   │     seed → 80-tick solve → entrance (runs ONCE)
        │                                   │
 stop dates (pure) ──► scrubber UI ──►  asOfEpoch prop ──► as-of effect  ← keyed on asOfEpoch
   [sorted distinct]      (state)                          walk selections, set opacity:
                                                             node.firstSeenAt > asOf → dim
                                                             edge endpoint dim      → dim
                                                             change.afterAt > asOf  → hide ring/badge/pulse
                                                           (asOfEpoch == null → no-op; prod parity)
```

As-of visibility is a pure decision per node/change, unit-testable in isolation:

```
asOfVisibility(firstSeenAt, asOfEpoch) -> 'present' | 'dimmed'
  asOfEpoch == null            -> 'present'        // prod / scrubber-off
  firstSeenAt absent           -> 'present'        // always-known
  epoch(firstSeenAt) <= asOf   -> 'present'
  else                         -> 'dimmed'

changeVisibleAsOf(change, asOfEpoch) -> boolean
  asOfEpoch == null            -> true
  change absent                -> false
  epoch(change.afterAt) <= asOf
```

## Implementation Units

- [ ] **Unit 1: Temporal fixture data + adapter/wire passthrough**

**Goal:** Give every demo node a "first known" date and carry it to the canvas, so an as-of test has data to act on. Author the dates so the graph tells a grow-over-time story.

**Requirements:** R2, R3, R6

**Dependencies:** None

**Files:**
- Modify: `prisma/fixtures/demo-navigable-record.ts` (add `firstSeenAt?: string` to `DemoNode`)
- Modify: `prisma/fixtures/synthetic/graph-narrative.ts` (author `firstSeenAt` on nodes across ~3–4 narrative stops)
- Modify: `src/types/graph.ts` (add optional `firstSeenAt?: string` to `GraphNodeWire`, documented as additive/demo-only)
- Modify: `src/lib/demo/graph-adapter.ts` (`nodeToWire` passthrough; source-hub synthesis path inherits `capturedAt`)
- Test: `src/lib/demo/graph-adapter.test.ts`

**Approach:**
- Mirror the existing `change` passthrough in `nodeToWire`: `...(node.firstSeenAt ? { firstSeenAt: node.firstSeenAt } : {})`.
- Author fixture dates to a small set of distinct stops (e.g. a 2024 baseline panel that births the first flags, a mid-journey expansion, the 2026 latest panel where change rings come due). Align the latest change `afterAt` (2026-02-10) as the final stop so today's view = full graph.
- Source-hub pseudo-nodes (synthesized in `demo-graph-section.tsx`) take `firstSeenAt = capturedAt`. Confirm whether to set this in the adapter's hub synthesis or the demo section's `canvasNodes` memo; prefer wherever the hub node is first constructed.

**Patterns to follow:** the `change` field threading in `prisma/fixtures/demo-navigable-record.ts` → `graph-adapter.ts` → `src/types/graph.ts`.

**Test scenarios:**
- Happy path: a fixture node with `firstSeenAt` → wire node carries the identical value.
- Edge case: a node without `firstSeenAt` → wire node omits the key entirely (no `firstSeenAt: undefined`), preserving byte-identical shape (R5).
- Happy path: a synthesized source-hub node → `firstSeenAt` equals its source `capturedAt`.
- Edge case: `adaptDemoFixture` called twice on the same fixture → byte-identical output (existing determinism guarantee holds with the new field).

**Verification:** adapter test green; the demo page still renders today's full graph at the default (latest) stop with no visible change.

- [ ] **Unit 2: As-of dimming engine in the canvas (opt-in, prod-safe)**

**Goal:** Add the `asOfEpoch` prop and the imperative opacity effect that dims un-born nodes/edges and hides not-yet-due change rings — without re-initializing the graph.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Create: `src/lib/graph/as-of.ts` (pure helpers `asOfVisibility`, `changeVisibleAsOf`, and the stop-date derivation used by Unit 3)
- Modify: `src/components/graph/graph-canvas.tsx` (thread optional `asOfEpoch?: number | null` prop)
- Modify: `src/components/graph/use-graph-state.ts` (accept `asOfEpoch`; add a `useEffect` keyed on it that mutates selection opacity; ensure `firstSeenAt` is available on the bound datum; keep `asOf` OUT of `dataSignature`)
- Test: `src/lib/graph/as-of.test.ts`

**Approach:**
- Pure helpers first (test-first): `asOfVisibility(firstSeenAt, asOfEpoch)` and `changeVisibleAsOf(change, asOfEpoch)` per the design sketch. These hold the logic; the DOM effect is a thin applicator.
- In `useGraphState`, a new effect keyed on `[asOfEpoch]` (and the rendered-selection refs, not the data): for each node `<g>`, set its opacity (and incident edges') from `asOfVisibility`; set the change ring/badge/pulse child opacity from `changeVisibleAsOf`. `asOfEpoch == null` → set everything to full present (no-op vs today) and bail early.
- Reuse `computeMotionAllowed()` for R4: motion-allowed → short CSS opacity transition; reduced-motion/SSR → instant set, no transition.
- Guard the determinism contract: the effect touches `opacity` only, never `cx/cy`/transforms. Add or extend a characterization assertion that converged positions are unchanged across an `asOfEpoch` change.

**Execution note:** Implement the pure `as-of.ts` helpers test-first; they carry the branch logic the DOM effect depends on.

**Technical design:** *(directional — see the as-of helper sketch in High-Level Technical Design; not implementation spec.)*

**Patterns to follow:** the existing pulse/decoration child-circle appends in `use-graph-state.ts` (≈ lines 484–509) for selection targeting; `computeMotionAllowed()` for the reduced-motion gate; `edgeOpacity` in `src/lib/graph/motion.ts` for how edge opacity is already expressed.

**Test scenarios:**
- Happy path: `asOfVisibility('2024-04-20…', epoch('2026-02-10…'))` → `'present'`; reverse → `'dimmed'`.
- Edge case: born exactly at `asOf` → `'present'` (boundary inclusive).
- Edge case: `firstSeenAt` absent → `'present'` regardless of `asOf`.
- Edge case: `asOfEpoch == null` → all `'present'` (prod-parity / scrubber-off path).
- Happy path: `changeVisibleAsOf(change, epoch === change.afterAt)` → `true` (boundary inclusive); one tick before → `false`.
- Edge case: `change` absent → `false` (no ring to show).
- Integration (visual-audit-gated, not vitest): scrubbing across stops dims/reveals nodes and toggles rings with no layout shift — proven in the closing audit, not in `node` tests.

**Verification:** `as-of.ts` tests green; with `asOfEpoch` unset, canvas render is identical to today (parity); positions provably unchanged when `asOfEpoch` varies.

- [ ] **Unit 3: Demo scrubber control + wiring**

**Goal:** The visible scrubber — a native range slider over the persona's evidence dates, with a date label, wired to drive the canvas's `asOfEpoch`.

**Requirements:** R1, R4, R6

**Dependencies:** Unit 1 (stop dates), Unit 2 (`asOfEpoch` prop + `as-of.ts` stop derivation)

**Files:**
- Modify: `src/components/demo/demo-graph-section.tsx` (scrubber UI, `asOf` state, pass `asOfEpoch` to `<GraphCanvas>`)
- Test: `src/lib/graph/as-of.test.ts` (extend with the stop-derivation cases) and/or a small `demo-graph-section`-adjacent unit for the index→date mapping if it lands as a separate helper

**Approach:**
- Derive the sorted, de-duplicated stop list (from `firstSeenAt` + change `afterAt` across `canvasNodes`) via the pure helper in `as-of.ts`. Memoize on `canvasNodes` (stable identity, fires once).
- `<input type="range" min=0 max=stops.length-1 step=1>` defaulting to the last index (latest = today). On change, set `asOf` to `stops[index]`; pass `asOfEpoch = epoch(asOf)` down. Render the current stop's date as a label (formatted, e.g. "Apr 2024" … "Feb 2026"), plus a short "drag to travel through time" caption mirroring the existing canvas caption voice.
- Place it directly under the canvas, inside the existing `hidden md:block` section (desktop-only, matching the canvas; mobile renders the list view and is out of scope here).
- Accessible labelling: `aria-label`/`aria-valuetext` reflecting the current date so the slider is keyboard- and screen-reader-usable.

**Patterns to follow:** the caption/legend styling already in `demo-graph-section.tsx` (`font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary`); the `useMemo`-on-stable-fixture pattern already used for `adapted`/`canvasNodes`.

**Test scenarios:**
- Happy path: stop derivation over nodes with dates `[2024-04, 2026-02, 2026-02, 2025-08]` → `['2024-04','2025-08','2026-02']` (sorted, de-duplicated).
- Edge case: nodes with no temporal data at all → single "now" stop (slider degenerates gracefully; graph shows everything).
- Edge case: index→date mapping at both ends (index 0 = earliest, last = latest/default).
- Integration (visual-audit-gated): dragging the slider moves `asOf` and the canvas responds; default load shows the full graph (R1).

**Verification:** stop-derivation tests green; on the running demo, the slider appears under the canvas, defaults to "today" with the full graph, and dragging left visibly thins the graph and turns off the change rings.

- [ ] **Unit 4: Visual audit + reduced-motion verification (human-run gate)**

**Goal:** Prove the scrub *feels* right and honors the repo's mandatory canvas-motion audit before this is considered done.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Units 1–3

**Files:** none (verification unit)

**Approach:**
- Run the demo; scrub across every stop. Confirm: surviving nodes never move (positions frozen), only opacity changes; no entrance replay/scatter on any scrub; change rings appear exactly at their `afterAt` stop; edges dim with their endpoints.
- Toggle `prefers-reduced-motion`: opacity changes apply instantly with no easing; no perpetual ticking.
- Check the dimmed treatment reads as "not yet known" at both dense and sparse stops and at 320px-equivalent scaling; pick the final dim opacity/transition here (the deferred execution-time call).
- Capture before/after screenshots at a few stops for the PR.

**Test expectation:** none — this is the browser-only audit gate (`visual-audit-non-optional-ui-gate-2026-05-16`); the unit logic is covered by Units 1–3.

**Verification:** audit checklist passes; screenshots attached; no layout shift observed across scrub.

## System-Wide Impact

- **Interaction graph:** the scrubber adds one piece of client state (`asOf`) in `demo-graph-section.tsx` and one effect in `use-graph-state.ts`. It does not touch selection/`?entity=` URL state, the detail sheet, or any fetch path.
- **Error propagation:** purely client, fixture-driven; no network or DB failure modes introduced. Missing/absent dates degrade to "always present" (graceful).
- **State lifecycle risks:** the as-of effect must be idempotent and must tear down/reset opacity cleanly if `dataSignature` ever does re-init (e.g. fixture hot-reload in dev) — re-apply current `asOf` after a re-init so a stale opacity state can't persist.
- **API surface parity:** none — no API touched. `GraphNodeWire` gains one optional field that prod never populates.
- **Integration coverage:** the no-layout-shift guarantee (R2) is the cross-cutting invariant; covered by a position-stability assertion (Unit 2) + the human audit (Unit 4), since vitest's `node` env can't render the canvas.
- **Unchanged invariants:** the seeded 80-tick deterministic layout, the entrance animation, spring drag, zoom/pan, the `/api/record` contract, the authed `/graph` render (opt-in prop unset there), and the existing change-decoration render all stay exactly as today. The scrubber is strictly additive.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Scrub re-inits the graph → entrance replays / nodes scatter on every tick | `asOf` stays out of `dataSignature`; a dedicated opacity-only effect mutates rendered selections; position-stability assertion + visual audit (R2) |
| Dimmed nodes vanish and the layout reads as broken/sparse | Use a faint ghost opacity (not full hide); tune against the live canvas in the audit |
| New optional field leaks into prod render and breaks parity | Additive optional field prod never sets; `asOfEpoch` unset on `/graph` → effect early-returns to today's render; parity is the existing posture |
| Fixture dates don't tell a clear grow-over-time story | Author ~3–4 deliberate narrative stops against the live render (U1), not arbitrary timestamps |
| Reduced-motion users get janky easing | Reuse `computeMotionAllowed()`; instant opacity set when motion disallowed (R4) |
| Scrub feel can't be unit-tested (node env) | Pure helpers carry the logic and are unit-tested; the interaction is a mandatory human audit (U4), matching repo policy |

## Documentation / Operational Notes

- No rollout, flag, or migration. Ships with the demo branch; visible immediately on `/demo/record` desktop.
- PR should carry the before/after scrub screenshots from U4 as the demo proof.

## Sources & References

- **Origin (Phase 2 sketch):** [docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md](docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md) — R6 scrubber, deferred pending a demo validation trigger (this is that trigger).
- Product origin: `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md` (§4 product experience, §6 graph physics & visual language).
- Motion/determinism contracts: `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md`.
- Learnings: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.
- Code: `src/components/demo/demo-graph-section.tsx`, `src/lib/demo/graph-adapter.ts`, `src/components/graph/{graph-canvas,use-graph-state}.tsx`, `src/lib/graph/motion.ts`, `src/types/graph.ts`, `prisma/fixtures/synthetic/graph-narrative.ts`, `prisma/fixtures/demo-navigable-record.ts`.

## Future Considerations

- **Auto-play:** a "play" button that advances `asOf` through the stops on a timer — trivial on top of the discrete-stop model (drive the same state from a `setInterval`), if the demo lands and wants a hands-off reel.
- **Port to authed `/graph`:** the real Phase 2 — same as-of effect, but per-node first-evidence dates come from the trajectory store and the read path is `LONGITUDINAL_GRAPH_ENABLED`-gated. This demo is its proof-of-feel.
