---
title: "feat: Category filter (toggle chips) + label legibility for the demo graph"
type: feat
status: active
date: 2026-06-17
origin: docs/plans/2026-06-16-001-feat-scrubber-physics-ux-plan.md
---

# feat: Category filter (toggle chips) + label legibility for the demo graph

## Overview

The `/demo/record` force-directed canvas shows all four node classes at once
(Clinical, Biomarker, Intervention, Source) and labels every always-on node
directly beneath its dot. At the demo's density this reads as a single busy
blob: there's no way to *focus* on one kind of node, and persistent labels
collide with neighbouring dots, edges, and each other (e.g. "Prediabetes
(HbA1c 5.7–6.4%)" sitting under "Intake notes · Aug 2025", "Lab report · Apr
2024" crossing "Lab report · Feb 2026").

Two small, surgical improvements — explicitly **not** a layout rework (the
arrangement "looks good as it is"):

1. **Category filter** — turn the existing 4-swatch legend into **multi-select
   toggle chips**. All on by default; switch any class off and its nodes
   **fade to a faint ghost** (the same idiom the time-scrubber already uses for
   not-yet-born nodes) so you can focus on just the classes you care about
   while keeping spatial context.
2. **Label legibility** — add a subtle **background halo** behind always-on
   labels so text stays readable where it crosses dots/edges, plus a small,
   bounded **vertical de-collision** of the always-on labels. **Node positions
   never move** — labels only.

Both are demo-chrome / canvas-overlay changes that compose with the existing
hover-dim and time-scrubber passes and **no-op on the authed `/graph`**.

## Problem Frame

The canvas separates concerns along a documented seam (see
`docs/plans/2026-06-09-001` and `2026-06-16-001`):

- **Physics in the hook** — `src/components/graph/use-graph-state.ts` owns the
  seeded D3 simulation, the node/edge/label DOM, the entrance animation, and
  drag. The converged layout is **byte-identical** for a given seed
  (determinism contract, `2026-06-08-001`).
- **Overlays via selection** — `src/components/graph/graph-canvas.tsx` applies
  opacity/attribute changes imperatively on the existing DOM in a `useEffect`
  ("the dim effect"). It already **composes two opacity sources**: hover/focus
  emphasis (non-neighbours → `0.2`) and the time-scrubber as-of ghost
  (not-yet-born → `AS_OF_DIM = 0.08`, with hover labels + change rings hidden
  and edges ghosted). The time-ghost wins over emphasis.

This is the key leverage: **"fade a switched-off class to a faint ghost" is
the same operation the as-of pass already performs** — set the node group to
the ghost floor, hide its hover label + change rings, ghost its edges. So the
filter is a **third ghost source** folded into the existing `timeDimmed`
predicate (`ghosted = timeDimmed || classGhost`), not a new rendering path.

The labels are created in the hook: tier-1 labels are **always-on** below the
dot (`dy = radius + 14`); tier-2/3 labels are hover-only. Note that the
**source pseudo-nodes are tier-1** (`canvas-synthesis.ts` →
`synthesizeSourceNodes`), so every "Lab report · …" / "Wearable · …" date label
is always-on — a large share of the visible clutter, and exactly what
switching "Source" off will quiet.

## Requirements Trace

- **R1** — The 4 legend swatches become **multi-select toggle chips** (button,
  `aria-pressed`), all **on by default**. Toggling a class off **fades that
  class's nodes to the faint ghost floor** (and ghosts edges that touch only
  ghosted nodes); the remaining classes stay full-strength. Off-state is
  visibly distinct (muted swatch/label).
- **R2** — The class-ghost **composes with** the existing hover-emphasis and
  time-scrubber as-of passes: a node is ghosted if `timeDimmed || classGhost`;
  hover labels and change rings are hidden on ghosted nodes; edges ghost when
  either endpoint is ghosted. **Filter-ghosted nodes become non-interactive**
  (no click / no tab stop / `aria-hidden`) so the kept set is what you
  navigate. (Time-ghost interactivity is unchanged — parity.)
- **R3** — **Default + prod parity**: with no class hidden (the default, and
  the *only* state the authed `/graph` ever uses) the render is **byte-for-byte
  today's**. The canvas gains an optional predicate prop that defaults to a
  no-op.
- **R4** — Always-on (tier-1) labels stay legible where text crosses
  dots/edges: a **background halo** behind label text (SVG `paint-order:
  stroke` in the canvas-background colour), applied to always-on and hover
  labels alike.
- **R5** — Label-on-label overlap among the **always-on** labels is reduced by
  a small, **bounded vertical de-collision** computed **once from the settled
  layout** — adjusting label `dy` only, **never node positions**, with a capped
  displacement. No force-layout change.
- **R6** — The determinism + reduced-motion contracts hold: node positions are
  byte-identical (labels-only edits); the de-collision is deterministic from
  the seeded layout; filter ghosting is **instant** (matching the hover-dim,
  not a laggy CSS transition) and reduced-motion-safe.

## Scope Boundaries

- ❌ **No force-layout retune.** `linkForce.distance`, `forceManyBody.strength`,
  `forceCollide.radius`, `forceCenter`, seed, and tick count are **unchanged**.
  The "less dense" feel comes from (a) ghosting switched-off classes and (b)
  label legibility — not from spreading nodes. (Explicit user choice: "labels
  only … don't change too much as it looks good as it is.")
- ❌ **No node removal.** Switched-off classes are **ghosted, not deleted** from
  the DOM (user choice: keep faint context).
- ❌ No change to as-of semantics, the stop dates, the time-scrubber control,
  the priority cluster, the node-detail sheet, or `<GraphListView>` (the
  mobile list).
- ❌ Not wired into the authed `/graph` interaction. The filter UI is demo-only
  chrome; the new canvas prop defaults to a no-op so the authed canvas renders
  unchanged.
- ❌ No new dependency.

### Deferred to Separate Tasks

- **Eased fade for filter toggles** (animate the ghost-in/ghost-out like the
  scrubber's eased transition). v1 ghosts **instantly** (consistent with the
  hover-dim). Gated on the instant version validating in the visual audit.
- **Per-class counts / "N hidden" affordance on the chips**, and a "reset
  filters" control.
- **Persisting the filter in the URL** (alongside `?entity=`).
- **Re-running the label de-collision after a drag.** v1 computes it once from
  the settled layout; transient label overlap while a node is actively dragged
  is acceptable.
- **Porting the filter + label legibility to the authed `/graph`.**

## Context & Research

### Relevant Code and Patterns

- `src/components/graph/graph-canvas.tsx` — the **dim effect** (composes
  hover-emphasis + as-of time-ghost; `paintInstant()` is the instant path, plus
  an eased tween on `asOf` change). This is where the class-ghost folds in:
  generalise `timeDimmed(id)` → `ghosted(id) = timeDimmed(id) || classGhost(id)`
  in both `paintInstant` and the tween targets. Already accepts predicate-style
  props (`nodeInteractive`) — mirror that for the filter predicate.
- `src/components/graph/use-graph-state.ts` — owns label creation (tier-1
  always-on at ~lines 522–528; tier-2/3 hover at ~531–540) and the settled
  `targetMap` / `boundsFromNodes` snapshot taken at init. The label halo class
  and the de-collision pass (reading `targetMap` + `getBBox`) live here. Does
  **not** rebuild on hover (only on `dataSignature`), so labels are stable.
- `src/lib/graph/visual-encoding.ts` — `visualForNode(type).visualClass`
  (`'clinical' | 'biomarker' | 'intervention' | 'data'`) is the filter key.
  `'data'` == the legend's **"Source"** swatch. `labelVisibleByDefault(tier)`
  (tier-1) defines the always-on set the de-collision targets.
- `src/lib/graph/as-of.ts` — `composeNodeOpacity(timeDimmed, hasEmphasis,
  isNeighbour, dim)` already returns `dim` when its first arg is true, so the
  tween can pass `ghosted` with **no signature change**.
- `src/components/demo/demo-graph-section.tsx` — owns the canvas + the
  `GraphLegend` (currently a static `<ul>`). Home of the toggle state and the
  interactive chips; passes the filter predicate to `GraphCanvas`.
- `src/app/globals.css` `@layer components` — already hosts the graph's visual
  grammar (`.graph-node-halo`, focus rings). The label-halo CSS rule belongs
  here (Tailwind has no `paint-order` utility).

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`
  — canvas visuals carry a **mandatory human visual-audit gate**; vitest is a
  `node` env (no DOM/`getBBox`/rAF), so the halo look, the de-collision result,
  and the ghost feel are **browser-verified**, not unit-tested. The public prod
  demo URL is reachable for the audit (`reference_morning-form-deploy`).
- `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` — determinism +
  transient-motion contracts: seeded layout byte-identical; never move
  `cx/cy`/group-`translate` for effects; reduced-motion → static.
- `docs/solutions/best-practices/object-map-keys-from-user-input-must-be-map-2026-06-10.md`
  — surfaced by the keyword search; relevant if any class→state lookup is keyed
  by a string (use a `Map`/`Set`, not a bare object, for anything that could
  take untrusted keys — the chip toggle keys are a fixed internal enum, so a
  `Set<NodeVisualClass>` is the right shape).

### External References

- SVG `paint-order: stroke fill` + a background-coloured `stroke` on `<text>`
  is the standard "text halo / knockout" technique for legible labels over busy
  backgrounds (used by map renderers). `stroke-linejoin: round` avoids spiky
  corners; the stroke is painted *behind* the fill so glyph shapes stay crisp.

## Key Technical Decisions

- **Filter = a third ghost source folded into the existing dim effect, not a
  new path.** Generalise the effect's `timeDimmed(id)` to `ghosted(id) =
  timeDimmed(id) || classGhost(id)` and reuse it verbatim for node opacity,
  hover-label hiding, change-ring hiding, and edge ghosting. The as-of pass
  already does all of this for the time-ghost; the filter is the same operation
  with a different trigger. Minimal diff, automatic composition (a class-ghosted
  node stays ghosted through a time-scrub because the tween targets read
  `ghosted` too).
- **Pass a stable predicate, not a class set, to the canvas.** Mirror the
  existing `nodeInteractive` prop: a new `nodeGhosted?: (node) => boolean`
  (default `() => false`). Keeps `graph-canvas.tsx` decoupled from
  `visual-encoding`, and the predicate's identity (memoised on `hiddenClasses`
  in the demo section) drives the effect's re-run. Default no-op ⇒ **R3 parity**
  for the authed canvas.
- **Filter toggles are instant; only the time-scrub eases.** The effect already
  runs `paintInstant()` for any non-`asOf` dependency change. Adding the filter
  predicate to the deps means a chip toggle repaints instantly — matching the
  snappy hover-dim. A CSS opacity transition is deliberately avoided (it would
  lag the frequent hover-dim — the rationale already documented in
  `2026-06-16-001`). Eased fade deferred.
- **Filter-ghosted nodes become non-interactive; time-ghosts are unchanged.**
  To truly "focus on those", a class-ghosted node should not steal a click or a
  tab stop. The effect toggles `pointer-events:none` + `tabindex=-1` +
  `aria-hidden=true` based on the **filter** predicate only, restoring them when
  re-enabled. The as-of time-ghost's interactivity is left exactly as today to
  preserve scrubber parity and keep the diff scoped.
- **Label halo via CSS on a shared class, not per-element attrs.** Add a
  `graph-node-label` class to both label `<text>` elements in the hook, and one
  rule in `globals.css`: `paint-order: stroke; stroke: <canvas-bg>;
  stroke-width: ~3px; stroke-linejoin: round`. Canvas background is `bg`
  (`#FBFBFD`) blended with `surface-warm/40` (`#F5F5F7`) — both near-white, so
  `theme(colors.bg)` (or `surface-warm`) is the starting halo colour, tuned in
  the audit.
- **De-collision is pure geometry + a thin DOM-measure shim, computed once from
  the settled layout.** Extract a pure `decollideLabels(boxes, opts) →
  Map<id, dyOffset>` into `src/lib/graph/labels.ts` (unit-tested). The hook
  measures each always-on label's local box via `getBBox()` (geometry only —
  position-independent), combines it with the **settled `targetMap` position**
  (known at init, before the entrance even runs), feeds the pure function, and
  writes each label's resolved `dy`. Computed once per init ⇒ deterministic, no
  re-run needed (labels travel with their dots during entrance/drag). Guard
  `getBBox` for SSR/jsdom absence.
- **Test strategy fixed by the env.** vitest is `node`: unit-test the **pure**
  pieces — the legend↔class map/order, the toggle reducer, and
  `decollideLabels`. The halo look, the de-collision outcome, and the ghost
  feel are the **visual-audit gate**.

## Open Questions

### Resolved During Planning (user)

- *Filter interaction model?* → **Multi-select toggle chips** on the existing
  legend (all-on default).
- *What happens to switched-off classes?* → **Fade to faint ghost** (not hide /
  not remove).
- *How far on overlap?* → **Labels only — halo + small nudge.** No force-layout
  change.

### Deferred to Implementation (tune in the visual audit)

- **Halo colour + stroke width + opacity** — `bg` vs `surface-warm`, and
  whether a slight `stroke-opacity` reads cleaner than a solid knockout.
- **De-collision cap + horizontal-overlap padding + whether one greedy pass or
  two** — start conservative (cap ≈ one line-height); dial in the audit. If the
  measured pass proves fiddly, fall back to the deterministic above/below
  placement heuristic (label points away from the layout centroid) — noted as
  the lighter alternative.
- **Filter-ghost floor** — reuse `AS_OF_DIM` (`0.08`) as-is, or a slightly
  higher floor (e.g. `0.12`) so a deliberately-hidden class reads as "muted by
  me" distinct from "not yet born". Decide in the audit.
- **Whether the chips also gain a faint hover preview** (hover a chip → preview
  isolate). Likely deferred.

## High-Level Technical Design

> *Directional guidance for review, not implementation spec. The implementing
> agent should treat it as context, not code to reproduce.*

Canvas dim effect — fold the class-ghost into the existing compose (the only
new term is `classGhost`):

```
ghosted(id)   = timeDimmed(id) || nodeGhosted(nodeById.get(id))   # NEW: || classGhost
classGhost(id)= nodeGhosted(nodeById.get(id))                     # filter predicate

paintInstant():                       # instant path — toggles + hover + null asOf
  for each node group:
    group.opacity   = ghosted ? GHOST_DIM : hasEmphasis ? (neighbour?1:0.2) : ''
    hoverLabel      = ghosted ? 0        : hasEmphasis ? (neighbour?1:0)    : ''
    changeRings     = (changeVisibleAsOf(..) && !classGhost) ? '' : 0
    # NEW interactivity toggle — filter predicate only (time-ghost unchanged):
    if classGhost: pointer-events=none; tabindex=-1; aria-hidden=true
    else:          restore role/tabindex/aria from nodeInteractive
  for each edge:
    edge.opacity = (ghosted(from)||ghosted(to)) ? GHOST_DIM
                 : hasEmphasis ? edgeOpacity(from,to,neighbours) : ''

eased asOf tween (unchanged shape):
  nodeTarget(id) = composeNodeOpacity(ghosted(id), hasEmphasis, neighbour, GHOST_DIM)  # pass ghosted
  edgeTarget     = (ghosted(from)||ghosted(to)) ? GHOST_DIM : …                         # pass ghosted
  # a class-ghosted node has end<0.5 ⇒ never flagged "revealing" ⇒ no grow-in (correct)

deps: [emphasisNodeId, neighbourIds, asOfEpoch, nodeById, nodeGhosted]   # NEW dep
```

Demo section — interactive legend (native buttons as the accessible control):

```
[ ● Clinical ]  [ ● Biomarker ]  [ ○ Intervention ]  [ ● Source ]   ← aria-pressed chips
            (filled = shown, hollow/muted = ghosted)

hiddenClasses: Set<NodeVisualClass>           # state, starts empty (all shown)
toggle(c)     = hiddenClasses ⊖ c             # add/remove
nodeGhosted   = useCallback(n => hiddenClasses.has(visualForNode(n.type).visualClass), [hiddenClasses])
<GraphCanvas … nodeGhosted={nodeGhosted} />
```

Label legibility (hook, computed at init from the settled layout):

```
append tier-1 (always-on) + tier-2/3 (hover) <text>, both with class "graph-node-label"
boxes = always-on labels.map(l => { id, x: targetMap[id].x, y: targetMap[id].y + (r+14),
                                     w: l.getBBox().width, h: l.getBBox().height })
offsets = decollideLabels(boxes, { maxShift, xPad })     # pure, lib/graph/labels.ts
for each always-on label: dy = (r+14) + (offsets.get(id) ?? 0)

# globals.css
.graph-node-label { paint-order: stroke; stroke: theme(colors.bg);
                    stroke-width: 3px; stroke-linejoin: round; }
```

## Implementation Units

- [ ] **Unit 1: Pure helpers — legend↔class map, toggle reducer, label de-collision**

**Goal:** Land the node-testable pure pieces the UI + hook consume.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- Create: `src/lib/graph/labels.ts` — `decollideLabels(boxes, opts) →
  Map<id, dyOffset>` (pure vertical de-collision: greedy, bounded, deterministic).
- Create/extend: a small ordered legend descriptor mapping
  `NodeVisualClass → { label }` and a `toggleHiddenClass(set, class)` reducer.
  Co-locate with `visual-encoding.ts` (it already owns class↔visual mapping) or
  a new `src/lib/graph/legend.ts` — decide at impl; keep one source of truth.
- Test: `src/lib/graph/labels.test.ts`, and a test for the legend map/reducer.

**Approach:**
- `decollideLabels`: take `{ id, x, y, width, height }[]` in graph space; sort
  by `y`; for pairs whose x-ranges overlap (within `xPad`) and y-boxes overlap,
  push the **lower** label down by the overlap, **capped at `maxShift`**; single
  greedy pass (document if a second pass helps). Return only non-zero offsets.
- Legend descriptor mirrors `NODE_VISUAL_BY_CLASS` order
  (clinical/biomarker/intervention/data) with the existing labels
  (Clinical/Biomarker/Intervention/**Source**). `toggleHiddenClass` returns a
  **new `Set`** (immutable update).

**Patterns to follow:** pure/clamped/node-testable helpers in
`src/lib/graph/motion.ts` and `as-of.ts`; immutable `Set` updates.

**Test scenarios:**
- `decollideLabels`: horizontally-disjoint labels → no offset; two vertically
  overlapping + horizontally close → lower shifted down by the overlap, ≤
  `maxShift`; three stacked → cumulative but each capped; empty/single → empty
  map; identical input → identical output (deterministic).
- `toggleHiddenClass`: adds an absent class, removes a present one, returns a
  new Set (input unmutated); legend descriptor lists all 4 classes once, in
  order, "data" labelled "Source".

**Verification:** new tests green; no change to existing consumers.

- [ ] **Unit 2: Interactive legend toggle chips**

**Goal:** Turn the static `GraphLegend` into multi-select toggle chips and lift
the filter state into `DemoGraphSection`.

**Requirements:** R1, R3

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/demo/demo-graph-section.tsx` — `hiddenClasses` state
  (starts empty), memoised `nodeGhosted` predicate, pass it to `GraphCanvas`;
  rewrite `GraphLegend` as buttons (`aria-pressed`) wired to
  `toggleHiddenClass`, with a visibly muted off-state.

**Approach:**
- `const [hiddenClasses, setHiddenClasses] = useState<Set<NodeVisualClass>>(new Set())`.
- `nodeGhosted = useCallback(n => hiddenClasses.has(visualForNode(n.type).visualClass), [hiddenClasses])`.
- Legend `<li>` → `<button type="button" aria-pressed={!hidden}>` keeping the
  swatch + label; off-state = reduced opacity / hollow swatch + (optional)
  line-through. Group keeps `aria-label="Filter graph by node type"`.
- Keep the swatch fill/stroke classes inline (they double as the Tailwind
  safelist signal, per the existing comment).

**Patterns to follow:** the existing `GraphLegend` markup + tokens; the
`nodeInteractive` predicate plumbing already in this file; `useCallback`
memoisation so the predicate identity is stable per `hiddenClasses`.

**Test scenarios (visual-audit-gated; logic covered by Unit 1):**
- All chips on by default; clicking one mutes it and ghosts that class on the
  canvas; clicking again restores; multiple can be off at once; `aria-pressed`
  reflects state; keyboard-operable.

**Verification:** chips toggle classes; default (all-on) leaves the canvas
identical to today; audit confirms the muted state reads clearly.

- [ ] **Unit 3: Canvas ghost compose + interactivity**

**Goal:** Fold the filter predicate into the dim effect's ghost logic and the
eased tween, and make filter-ghosted nodes non-interactive — default no-op for
parity.

**Requirements:** R1, R2, R3, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `src/components/graph/graph-canvas.tsx` — new
  `nodeGhosted?: (node: GraphNodeWire) => boolean` prop (default `() => false`);
  `ghosted(id) = timeDimmed(id) || nodeGhosted(node)` used in `paintInstant`
  node/hover-label/change-ring/edge branches and in the tween's
  `nodeTarget`/edge targets (`composeNodeOpacity(ghosted, …)` — no signature
  change); toggle `pointer-events`/`tabindex`/`aria-hidden` for filter-ghosted
  nodes (restore from `nodeInteractive` when re-enabled); add `nodeGhosted` to
  the effect deps.

**Approach:**
- Define `classGhost(id)` from the predicate via `nodeById`; `ghosted = timeDimmed || classGhost`.
- Reuse `GHOST_DIM` = `AS_OF_DIM` (revisit floor in audit). Change rings:
  `changeVisibleAsOf(..) && !classGhost`.
- Interactivity toggle keyed on `classGhost` **only** (time-ghost untouched).
- Default prop ⇒ `classGhost` always false ⇒ effect byte-identical to today
  (R3). Confirm the authed `/graph` caller is unaffected (it never passes the
  prop).

**Patterns to follow:** the existing compose in the dim effect; the
`nodeInteractive` default-predicate pattern; `composeNodeOpacity` in `as-of.ts`.

**Test scenarios:**
- Pure compose (extend `as-of.test.ts` if a helper is extracted): class-ghosted
  → ghost floor regardless of hover; class-ghosted + time-present → still ghost;
  no-class-hidden default → today's values exactly (parity); ghost wins over
  emphasis.
- Visual-audit-gated: toggling a class ghosts its nodes + edges instantly with
  no position shift; ghosted nodes don't take clicks/tab; a class-ghosted node
  stays ghosted across a time-scrub; reduced-motion + null-`asOf` paths
  unchanged.

**Verification:** pure tests green; default path proven identical to today;
audit confirms instant ghost + non-interactive + scrub composition.

- [ ] **Unit 4: Label legibility — halo + de-collision**

**Goal:** Make always-on labels legible over the canvas (halo) and reduce
label-on-label overlap (bounded de-collision), without moving any node.

**Requirements:** R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/graph/use-graph-state.ts` — add the shared
  `graph-node-label` class to both label `<text>` creations; after appending the
  always-on labels, measure each via `getBBox()` (guarded), combine with the
  settled `targetMap` position, call `decollideLabels`, and write each label's
  resolved `dy`. Compute once per init.
- Modify: `src/app/globals.css` — `.graph-node-label { paint-order: stroke;
  stroke: theme(colors.bg); stroke-width: 3px; stroke-linejoin: round; }`
  (colour/width tuned in audit).

**Approach:**
- Halo: pure CSS on the shared class — no per-node attrs, applies to always-on
  and hover labels alike.
- De-collision: build boxes from `targetMap[id]` (settled position) + the base
  `dy` (`radius + 14`) + measured `width/height`; `decollideLabels` → per-label
  extra `dy`. Write `dy = base + offset`. Guard `getBBox` (SSR/jsdom returns 0 /
  may be absent — skip the pass, labels keep base `dy`).
- Runs in **both** the motion and reduced-motion branches (it's position-static,
  independent of the entrance) and re-runs on `dataSignature` re-init.

**Patterns to follow:** the label creation block already in the hook; the
init-time `targetMap`/`boundsFromNodes` snapshot; the `@layer components` graph
rules in `globals.css`; the documented "data-driven Tailwind classes from
src/lib get JIT-dropped" trap — `graph-node-label` lives in the scanned tree
(hook + globals) so it's safe.

**Test scenarios:**
- `decollideLabels` covered in Unit 1.
- Visual-audit-gated: labels readable where they cross dots/edges; previously-
  overlapping always-on labels separated; node dots/positions visibly
  unchanged; reduced-motion path identical layout; halo colour reads as a clean
  knockout, not a glow.

**Verification:** de-collision tests green; audit confirms legibility +
unchanged node positions + no halo artefacts.

## System-Wide Impact

- **Interaction graph:** the class-ghost shares the canvas DOM with the
  hover-dim and as-of passes — all opacity/attribute-on-existing-DOM, composed
  through one `ghosted` predicate. The label halo + de-collision are
  paint/`dy`-only and never touch node `translate`. The legend chips drive
  `hiddenClasses`, which re-memoises one predicate.
- **Error propagation:** pure client, fixture-driven; no network/DB. A missing
  `getBBox` (SSR/jsdom) degrades to base-`dy` labels (no throw, no overlap fix —
  acceptable). An unknown class key can't occur (fixed internal enum).
- **State lifecycle:** no new timers/animations. The filter repaint reuses the
  existing instant path; the de-collision is one-shot at init and torn down with
  the SVG on re-init (no handle to leak).
- **API surface parity:** none — no API/wire-type change. `nodeGhosted`
  defaults to a no-op, so the authed `/graph` canvas is byte-identical.
- **Unchanged invariants:** seeded converged **node positions** (labels-only
  edits), `as-of.ts` semantics, the scrubber control, the priority cluster, the
  detail sheet, `<GraphListView>`, reduced-motion behaviour, and the authed
  render.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Class-ghost + as-of + hover compose into conflicting opacity | One `ghosted` predicate threaded through both `paintInstant` and the tween; `composeNodeOpacity` already collapses ghost→floor; the as-of pass is the proven template |
| Authed `/graph` drift from the new prop | `nodeGhosted` defaults to a no-op ⇒ `classGhost` always false ⇒ byte-for-byte today's render; covered by a pure parity test |
| `getBBox` unavailable (SSR/jsdom) or label not yet measurable | Guard + degrade to base `dy`; the pass is client-only (canvas is `hidden md:block`, runs in `useEffect`) |
| De-collision moves labels far / re-introduces overlap elsewhere | Bounded `maxShift` (≈ one line-height), greedy single pass, computed from the **settled** layout; visual-audit gate; deterministic fallback heuristic noted |
| Label halo reads as a glow / muddies thin text | `paint-order: stroke` (stroke behind fill) + `stroke-linejoin: round`; near-white knockout colour; width/opacity tuned in the audit |
| Ghosted-but-clickable nodes steal focus/clicks | Filter-ghosted nodes get `pointer-events:none` + `tabindex=-1` + `aria-hidden`; restored on re-enable |
| Filter ghost-in/out feels abrupt (instant) | Matches the existing hover-dim cadence; eased fade deferred and gated on the audit |

## Documentation / Operational Notes

- No flag, schema, API, or rollout change. Demo-only; ships on merge to the live
  demo (`morning-form.vercel.app/demo/record`), where the **mandatory visual
  audit** runs on the prod build (public URL; preview deploys are auth-gated —
  `reference_morning-form-deploy`).
- Candidate `docs/solutions/` note afterward: "category filter = a third ghost
  source folded into the canvas dim-effect compose (reuses the as-of ghost
  idiom), + SVG `paint-order` text halo for label legibility."

## Sources & References

- Seam + compose lineage: `docs/plans/2026-06-16-001-feat-scrubber-physics-ux-plan.md`
  (origin), `docs/plans/2026-06-15-001-feat-demo-graph-time-scrubber-plan.md`,
  `docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md`,
  `docs/plans/2026-06-09-001-feat-graph-node-selection-ux-plan.md`.
- Determinism/motion contracts: `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md`.
- Visual-audit gate: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.
- Code: `src/components/graph/{graph-canvas,use-graph-state}.tsx`,
  `src/components/demo/demo-graph-section.tsx`,
  `src/lib/graph/{visual-encoding,as-of,motion}.ts`,
  `src/lib/record/canvas-synthesis.ts`, `src/app/globals.css`,
  `tailwind.config.ts` (colour tokens: `bg #FBFBFD`, `surface-warm #F5F5F7`).

## Future Considerations

- **Eased filter fade** reusing the scrubber's `animate(0,1,{ease:smooth})`
  transition (deferred above) — the ghost target already composes, so this is
  an animation seam, not new state.
- **Persist filter (+ scrubber) state in the URL** so a shared link can deep-link
  a focused view, alongside `?entity=`.
- **Port the filter + label legibility to the authed `/graph`** when its real
  scrubber/longitudinal view ships — the predicate prop and the label helpers
  are prod-safe by construction.
- **Adaptive label declutter** (re-run de-collision after drag, or a true
  label-placement solver) if the bounded one-pass proves insufficient at higher
  densities.
