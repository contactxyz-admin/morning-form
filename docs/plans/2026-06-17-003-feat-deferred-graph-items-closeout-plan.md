---
title: "feat: Close out deferred graph items — authed source parity, filter polish, label robustness"
type: feat
status: active
date: 2026-06-17
origin: docs/plans/2026-06-17-002-feat-demo-source-node-detail-plan.md
---

# feat: Close out deferred graph items — authed source parity, filter polish, label robustness

## Overview

PRs #174 + #175 shipped the demo graph's category filter, label legibility, and
source/lab-report detail — and translated the filter + label work and the shared
`SourceDetailBody` to the authed graph (`/record?mode=map`, `/record/source/[id]`).
A handful of items were deliberately deferred. This plan **closes them out**,
prioritized as a CTO would: finish the authed parity first (it's what "the real
UI matches the demo" actually means), then the filter UX polish, and explicitly
**not** building the audit-conditional / speculative ones until there's signal.

**Phase 1 — Authed source-detail parity (the real payoff).** On the authed
`/record/source/[id]` page the grounded markers are currently **name-only and
non-clickable** (the source API returns no `change`/`interpretation`, and
`buildSourceView` drops `canonicalKey`). Phase 1 lights them up: value + flag +
drill-down, matching the demo — plus the authed filter's filtered-while-selected
guard (a small a11y parity gap the code already flags).

**Phase 2 — Filter UX polish (both surfaces, via the shared component).** A
"reset filters" affordance (+ optional per-class counts), URL-persisted filter
state (shareable focused views), and an eased ghost-in/out fade.

**Evaluate-only / out of scope** — adaptive label declutter, halo-colour CSS var,
container unification, in-text highlighting, value parsing, chip hover-preview:
listed with rationale; **not** committed until a visual audit or product call
asks for them.

## Problem Frame

The deferred items, with research-backed effort (see Context):

| # | Item | From | Effort | Phase |
|---|------|------|--------|-------|
| D1 | Authed grounded markers show **value + flag** | 002 | MEDIUM | 1 |
| D2 | Authed grounded markers are **drill-down links** | 002 | SMALL | 1 |
| D11 | Authed **filtered-while-selected** sheet-close guard | 001-addendum | SMALL | 1 |
| D7 | **Reset filters** control (+ optional per-class counts) | 001 | SMALL | 2 |
| D8 | **URL-persist** the filter (shareable focused view) | 001 | MEDIUM | 2 |
| D6 | **Eased fade** for filter ghost-in/out | 001 | SMALL–MED | 2 |
| D9 | Adaptive label declutter (re-run after drag / solver) | 001 | MEDIUM | Evaluate |
| D10 | Halo colour → CSS var if authed bg clashes | 001-addendum | SMALL | Evaluate |
| D3 | Unify authed source **container** (sheet vs page) | 002 | LARGE | Out |
| D4 | From-the-document **offset highlighting** | 002 | MEDIUM | Out |
| D5 | **Value/range parsing** from chunk text | 002 | LARGE | Out |
| D12 | Chip **hover-preview** isolate | 001 | SMALL | Out |

The load-bearing asymmetry (from research): on the authed path **only `change`
is derivable** (a flag-gated, DB-backed latest-vs-previous *panel* diff);
`interpretation` and `evidenceGrade` are demo-only today. But `interpretation`'s
engine is **pure and surface-neutral**, so it rides for free once `change` is
wired, and `evidenceGrade` **isn't needed** (the shared body uses
`authorityLabel(kind)`, keyed off the always-present source kind).

## Requirements Trace

**Phase 1**
- **R1 (D1)** — On the authed `/record/source/[id]`, each grounded marker shows
  its **value + direction + calm flag** when available, matching the demo body —
  reusing the authed `change` pipeline (`diffLatestPanels` → pure mappers) and
  the pure `interpret()` engine. Flag-gated (`LONGITUDINAL_GRAPH_ENABLED`) and
  **non-fatal**: if the diff fails or the flag is off, markers degrade to
  name-only (today's behaviour) — never a 500.
- **R2 (D2)** — Each grounded marker is a **drill-down** to that marker on the
  record (`/record?mode=map&entity=<canonicalKey>`); `SourceView.referencedNodes`
  carries `canonicalKey`, and the shared `SourceDetailBody` row navigates via a
  surface-supplied handler (demo → `updateUrl(id)`, authed → router push by
  `canonicalKey`).
- **R3 (D11)** — On the authed graph, filtering off the **selected** node's class
  closes its detail sheet (mirrors the demo guard), so `aria-current` and the
  ghosted node never conflict. Implemented by lifting `useCategoryFilter` to the
  surface that owns the `?entity=` selection (as the existing ponytail prescribes).

**Phase 2**
- **R4 (D7)** — The shared `GraphFilterLegend` gains a **reset** affordance
  (clear all hidden) shown only when something is hidden; optional per-class
  **counts** behind a prop. Both surfaces inherit it.
- **R5 (D8)** — Filter state **persists in the URL** (e.g. `?hide=clinical,data`)
  so a shared link reproduces the focused view; back/forward toggles it. Demo and
  authed both use their existing URL-state plumbing; the shared hook stays the
  single source of truth.
- **R6 (D6)** — Toggling a class **eases** the ghost-in/out (reuse the scrubber's
  `animate(0,1,{ease:smooth})` against the already-composed ghost target);
  reduced-motion → instant (today's behaviour). Hover stays instant.

**Cross-cutting**
- **R7** — No regression: health-node detail, the authed source-click→page
  navigation, the importance cap, the list view, determinism, and reduced-motion
  all unchanged. New behaviour is additive and (where authed) flag-gated.

## Scope Boundaries

- ❌ **No bespoke per-source change computation.** Phase 1 reuses the existing
  latest-panel `change` (see Open Questions for the clinical nuance + the chosen
  default). We do not build a "value as established by *this* (possibly old)
  source" pipeline.
- ❌ **No value re-parsing from chunk text** (D5) — structured node data only.
- ❌ **No container change** to the authed source surface (D3) — it stays a page;
  only its body content gains parity.
- ❌ **Not building** D4/D5/D9/D10/D12 in this plan (Evaluate / Out below).
- ❌ No new dependency; no schema change (reuse existing Prisma models/queries).

### Deferred / Evaluate (explicitly not committed here)

- **D9 — Adaptive label declutter** (re-run de-collision after a drag, or a true
  label-placement solver). **Gate:** only if the visual audit shows the bounded
  one-pass is insufficient at authed densities. The ponytail marker already flags
  the after-drag case.
- **D10 — Halo colour as a CSS variable.** **Gate:** only if the audit shows the
  `theme(colors.bg)` knockout clashes on the authed `bg-record-grid` background.
- **D3 — Container unification** (authed source opens a sheet instead of the
  page): a UX product decision, not a defect. Revisit if desired.
- **D4 — Offset-span highlighting**, **D5 — value/range parsing**: deeper source
  enhancements, low marginal value given structured node data; revisit on demand.
- **D12 — Chip hover-preview isolate**: low value; revisit if the audit asks.

## Context & Research

### Relevant Code and Patterns

- **`change` (authed, reusable):** `src/app/api/record/route.ts:47-97` —
  `diffLatestPanels(prisma, userId)` (`src/lib/markers/panel-diff.ts:81`, DB-backed,
  diffs the two most recent lab panels) → `applyChangesToWireNodes` /
  `buildChangeByJoinKey` (`src/lib/markers/node-change-map.ts`, **pure**, match by
  `markerJoinKey(canonicalKey, attributes.registryKey)`). Flag: `env.LONGITUDINAL_GRAPH_ENABLED`
  (`src/lib/env.ts`), applied with a **non-fatal catch** in the record route — the
  pattern to mirror.
- **`interpret` (pure, surface-neutral):** `src/lib/markers/clinical-interpretation.ts:113`
  — `interpret(canonicalKey, change, {value, low, high})`. `MATRIX` keys are
  `ldl/apob/ferritin/hba1c/free-testosterone`; others fall to a conservative
  `clinician_discussion` default. Inputs all recoverable from a `MarkerChange`
  (`afterValue`/`referenceLow`/`referenceHigh`), so no extra reading queries.
- **The source route + shaper:** `src/app/api/record/source/[id]/route.ts`
  (selects `{id,type,displayName,canonicalKey}` per referenced node — add
  `attributes` for `registryKey`), `src/lib/record/source-view.ts`
  (`SourceViewReferencedNode` drops `canonicalKey` at `:138` — propagate it;
  extend with optional `change`/`interpretation`), `src/app/(app)/record/source/[id]/page.tsx`
  (maps referenced nodes → `SourceGroundedMarker`; in-file TODO comments already
  flag D1/D2).
- **The shared body:** `src/components/record/source-detail-body.tsx` —
  `SourceGroundedMarker` already has optional `change`/`interpretation`; the row is
  already button-capable via `onSelectNode`. Change the callback to receive the
  **marker** (so authed can navigate by `canonicalKey`, demo by `id`).
- **Filter parity:** `src/components/record/vault-layout.tsx` — `selectedNode`
  resolved by `canonicalKey` against health nodes only (`:100`); source clicks
  route to the page (`:85-88`). The ponytail at `:103-107` already prescribes
  lifting `useCategoryFilter` to `VaultLayout` for the D11 guard. Shared hook:
  `src/components/graph/graph-filter-legend.tsx` (`useCategoryFilter`,
  `GraphFilterLegend`). Demo guard to mirror: `demo-graph-section.tsx` (the
  `if (openNode && nodeGhosted(openNode)) updateUrl(null)` effect).
- **Eased ghost (D6):** the scrubber tween in `src/components/graph/graph-canvas.tsx`
  (`animate(0,1,{ease:smooth})`, `composeNodeOpacity`) — the class-ghost target
  already composes through `ghosted`; an eased path mirrors the as-of tween.

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`
  — Phase 1 authed body + Phase 2 fades are visual-audit-gated (Apple + clinical
  bar), on a **real record** (authed) and the live demo.
- `docs/plans/2026-06-16-002/003` — non-diagnostic framing, calm `FLAG_PRESENTATION`,
  evidence/authority discipline. The authed value/flag must speak the same calm,
  non-diagnostic language as the demo.
- Determinism / reduced-motion contracts (`2026-06-08-001`, `2026-06-16-001`) —
  the eased fade (D6) must be reduced-motion-safe and must not touch positions.

## Key Technical Decisions

- **Reuse, don't rebuild, the authed `change` pipeline (D1).** Conditionally run
  `diffLatestPanels` in the source route (flag-gated, non-fatal catch), build
  `buildChangeByJoinKey`, and attach to referenced nodes by `markerJoinKey`
  (needs `attributes` in the node select). `interpretation` rides for free via
  `interpret()` using the change's value/range. `evidenceGrade` is **not** needed.
- **Thread value/flag through `SourceView`, keep the body presentational.** Extend
  `SourceViewNodeRow` + `SourceViewReferencedNode` with optional `change` /
  `interpretation` + `canonicalKey`; `buildSourceView` propagates them. The shared
  `SourceDetailBody` already renders value/flag when present — so the demo path is
  unchanged and the authed path simply gains data.
- **Make the drill-down callback carry the marker, not a bare id (D2).** `onSelectNode(marker)`; demo → `updateUrl(marker.id)`, authed → `router.push('/record?mode=map&entity=' + canonicalKey)`. `SourceGroundedMarker` gains `canonicalKey?`.
- **Lift `useCategoryFilter` to the selection owner for D11.** Move the hook from
  `VaultMapMode` up to `VaultLayout` (which owns `?entity=`/`selectedNode`), add
  the demo's guard effect, and pass `hiddenClasses`/`toggle`/`nodeGhosted` down.
  Exactly what the in-code ponytail prescribes.
- **Keep the filter's single source of truth (D7/D8).** Reset + counts live in the
  shared `GraphFilterLegend`/`useCategoryFilter`; URL-persistence is injected via a
  small adapter (the hook accepts initial hidden-classes + an `onChange` the
  surface wires to its own URL state) so demo and authed share logic without the
  hook knowing about routing.
- **Eased fade mirrors the as-of tween (D6), reduced-motion-safe.** A class-toggle
  runs the same `animate`+`smooth` path the scrub uses, against the composed ghost
  target; reduced-motion / no-op default → instant (today's behaviour).

## Open Questions

### For decision (CTO recommendation in brackets)

- **Authed source value semantics (D1): latest-panel `change` vs "as established
  by this source".** The authed `change` is the user's latest-vs-previous panel
  diff, which may differ from what an *older* source established. *[Recommend:
  show the latest-panel `change`/`interpretation` (consistent with the rest of the
  authed record) and let the drill-down carry the user to the full marker
  trajectory; do NOT imply the value is "as of this document". If a source is not
  part of the latest panel, still show the marker's current standing — the section
  reads "what this report established → where it stands now".]* Flag for a quick
  clinical gut-check in the visual audit.

### Resolved during planning

- *Is `evidenceGrade` needed on authed?* → No; `authorityLabel(kind)` covers it.
- *Per-class counts in D7?* → Optional, behind a prop; ship reset first.
- *URL param shape (D8)?* → `?hide=<comma-separated visual classes>`; absent =
  all shown (today's default, parity-safe).

## High-Level Technical Design

> Directional, not implementation spec.

```
# D1/D2 — authed source route + shaper + page
route (flag-gated, non-fatal):
  diff = LONGITUDINAL ? safe(diffLatestPanels(prisma, userId)) : null
  changeByJoinKey = diff ? buildChangeByJoinKey(diff.changes) : {}
  nodes = referenced graphNodes (select += attributes)
  rows  = nodes.map(n => {
            change = changeByJoinKey[markerJoinKey(n.canonicalKey, n.attributes.registryKey)]
            interpretation = change ? interpret(n.canonicalKey, change, {value,low,high}) : undefined
            return { id, type, displayName, canonicalKey, change, interpretation }
          })
  view = buildSourceView({... nodes: rows})           # SourceView.referencedNodes now carries the extras

page:
  grounded = view.referencedNodes                     # already SourceGroundedMarker-shaped
  <SourceDetailBody sourceView=view grounded=grounded
     onSelectNode={(m) => router.push(`/record?mode=map&entity=${m.canonicalKey}`)} />

# D11 — vault-layout
VaultLayout (owns ?entity=):
  const { hiddenClasses, toggle, nodeGhosted } = useCategoryFilter()
  useEffect(() => { if (selectedNode && nodeGhosted(selectedNode)) updateUrl({entity:null}) }, ...)
  <VaultMapMode ... hiddenClasses toggle nodeGhosted />   # legend props passed down

# D7 — shared legend
GraphFilterLegend: + optional Reset chip (visible when hiddenClasses.size>0) + optional counts prop

# D8 — url persistence
useCategoryFilter({ initialHidden, onChange }): state seeds from URL; toggle calls onChange(nextSet)
  demo  → updateUrl(hide=...)   authed → updateUrl({hide})

# D6 — eased fade (graph-canvas)
on nodeGhosted change (motion allowed): animate(0,1,{ease:smooth}) lerp current→composed ghost target
  reduced-motion / first paint → instant (paintInstant), exactly as today
```

## Implementation Units

### Phase 1 — authed source parity

- [ ] **U1: `SourceView` carries `canonicalKey` + optional `change`/`interpretation`**
  - Modify `src/lib/record/source-view.ts`: extend `SourceViewNodeRow` and
    `SourceViewReferencedNode` with `canonicalKey` (required) + optional `change`/
    `interpretation`; propagate in `buildSourceView`. Pure.
  - Test `src/lib/record/source-view.test.ts`: canonicalKey propagated; change/
    interpretation pass through when present; absent → omitted (parity).
  - Demo adapter (`graph-adapter.ts`) already passes `canonicalKey` in `nodeRows`;
    confirm it flows; the demo can keep enriching grounded markers from wire nodes
    (no change needed there).

- [ ] **U2: Source route enriches referenced nodes (flag-gated, non-fatal)**
  - Modify `src/app/api/record/source/[id]/route.ts`: add `attributes` to the
    referenced-node select; when `LONGITUDINAL_GRAPH_ENABLED`, `safe`-run
    `diffLatestPanels`, `buildChangeByJoinKey`, attach `change` by `markerJoinKey`
    and `interpretation` via `interpret(...)`; feed enriched rows to `buildSourceView`.
  - Mirror the record route's non-fatal `.catch` so a diff failure → name-only.
  - Test: a unit/integration around the row-enrichment mapping (pure part
    extracted if needed); the DB path covered by the existing record-route tests'
    patterns. Verify flag-off and diff-fail both degrade to name-only.

- [ ] **U3: Authed page renders value/flag + drill-down; shared body callback takes the marker**
  - Modify `src/components/record/source-detail-body.tsx`: `onSelectNode?: (m: SourceGroundedMarker) => void`; `SourceGroundedMarker` gains `canonicalKey?`.
  - Modify `src/app/(app)/record/source/[id]/page.tsx`: map `view.referencedNodes`
    → grounded markers (now with change/interpretation/canonicalKey); pass
    `onSelectNode={(m) => router.push('/record?mode=map&entity=' + encodeURIComponent(m.canonicalKey!))}`.
    Remove the in-file D1/D2 ponytail TODOs.
  - Modify `src/components/demo/demo-graph-section.tsx`: update the demo
    `onOpenNode`/`onSelectNode` to the marker-shaped callback (`(m) => updateUrl(m.id)`).
  - Verify: authed grounded rows show value+flag and navigate; demo unchanged.

- [ ] **U4: Authed filtered-while-selected guard (D11)**
  - Modify `src/components/record/vault-layout.tsx`: lift `useCategoryFilter` to
    `VaultLayout`; add `useEffect(() => { if (selectedNode && nodeGhosted(selectedNode)) updateUrl({entity:null}) })`;
    pass `hiddenClasses`/`toggle`/`nodeGhosted` into `VaultMapMode` (legend +
    canvas). Remove the prescribing ponytail.
  - Verify: filtering the selected node's class closes the sheet; no hook-order
    regression (hooks stay before the empty-graph return).

### Phase 2 — filter UX polish (shared, both surfaces)

- [ ] **U5: Reset-filters control (+ optional counts) (D7)**
  - Modify `src/components/graph/graph-filter-legend.tsx`: a "Reset"/"Show all"
    affordance rendered when `hiddenClasses.size > 0` (calls a `onReset` or
    `onToggle`-clear); optional `counts?: Partial<Record<NodeVisualClass, number>>`
    prop rendered per chip. `useCategoryFilter` gains `reset()`.
  - Test the reset reducer (pure) in the legend/visual-encoding tests.
  - Verify on both surfaces.

- [ ] **U6: URL-persist filter state (D8)**
  - Modify `useCategoryFilter` to accept `{ initialHidden?, onChange? }` (controlled-
    friendly); add pure `parseHiddenClasses`/`serializeHiddenClasses` (+ tests) in
    `visual-encoding.ts`. Wire demo (`?hide=` via its `updateUrl`) and authed
    (`updateUrl({hide})` in vault-layout). Absent param → all shown (parity).
  - Verify: deep-link reproduces the focused view; back/forward toggles.

- [ ] **U7: Eased filter ghost-in/out (D6)**
  - Modify `src/components/graph/graph-canvas.tsx`: on a `nodeGhosted` change with
    motion allowed, ease the class-ghost opacity (reuse the scrub `animate`+`smooth`
    against the composed target); reduced-motion / default → instant. No position
    change; cancellable + torn down like the scrub tween.
  - Verify (visual-audit-gated): smooth fade; hover stays instant; reduced-motion
    instant; authed parity.

## System-Wide Impact

- **Interaction graph:** Phase 1 makes the authed source page a first-class
  surface (value/flag + drill-down into the record); the filter guard ties the
  authed filter to the selection. Phase 2 changes are additive to the shared
  filter component + the canvas dim effect.
- **Error propagation:** the source-route enrichment is flag-gated + non-fatal
  (degrade to name-only); no new 500 paths. Pure shapers tested in node env.
- **State lifecycle:** D6 adds a cancellable tween (mirrors the scrub tween's
  teardown); D8 adds URL state (back/forward-safe); no new long-lived timers.
- **API surface:** `SourceView` gains optional fields (backward-compatible);
  `/api/record/source/[id]` returns richer rows under the flag.
- **Unchanged invariants:** health-node detail, authed source-click→page nav,
  importance cap, list view, determinism, reduced-motion, and the demo paths.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Authed value reflects latest panel, not "this source" → subtly misleading | Chosen framing ("established → where it stands now") + drill-down to full trajectory; clinical gut-check in audit (Open Q) |
| Source-route diff adds latency / fails | Flag-gated + non-fatal `.catch` (mirror record route) → name-only fallback; the diff is the same one the record route already runs |
| Lifting `useCategoryFilter` reorders hooks / breaks the legend wiring | Keep all hooks before any early return; pass props down explicitly; covered by the existing hook (no logic change), verified in build |
| URL-persist (D8) churns history or fights the `?entity=` param | Use `router.replace` + a dedicated `?hide=` param; absent = parity; back/forward toggles |
| Eased fade (D6) lags hover or moves nodes | Ease only the class-ghost (mirror as-of tween); hover instant; opacity-only; reduced-motion instant |
| Over-building deferred items | D9/D10/D3/D4/D5/D12 explicitly Evaluate/Out — gated on audit/product signal |

## Documentation / Operational Notes

- No schema/rollout change. Phase 1 authed enrichment rides the existing
  `LONGITUDINAL_GRAPH_ENABLED` flag. Visual audit on a real record (authed) +
  the live demo is the gate for the Phase 1 body and Phase 2 fades.
- Candidate `docs/solutions/` note: "authed source page reuses the record route's
  `diffLatestPanels` + pure `interpret()` to reach demo parity, flag-gated and
  non-fatal; `SourceView` carries optional change/interpretation/canonicalKey."

## Sources & References

- Origin: `docs/plans/2026-06-17-002-…` (source detail) + `2026-06-17-001` Addendum
  (filter → authed). Clinical framing: `2026-06-16-002/003`. Motion/determinism:
  `2026-06-08-001`, `2026-06-16-001`.
- Code: `src/app/api/record/{route,source/[id]/route}.ts`,
  `src/lib/markers/{panel-diff,node-change-map,clinical-interpretation}.ts`,
  `src/lib/record/source-view.ts`, `src/components/record/{source-detail-body,vault-layout}.tsx`,
  `src/app/(app)/record/source/[id]/page.tsx`, `src/components/graph/{graph-filter-legend,graph-canvas}.tsx`,
  `src/components/demo/demo-graph-section.tsx`, `src/lib/env.ts`.

## Future Considerations

- If the audit asks: D9 (adaptive declutter), D10 (halo CSS var), D4/D5 (in-text
  highlighting / value parsing), D3 (container unification), D12 (chip preview).
- A neutral home for `evidenceGrade` (currently `src/lib/demo/`) if any authed
  surface ever needs it (not required by this plan).
