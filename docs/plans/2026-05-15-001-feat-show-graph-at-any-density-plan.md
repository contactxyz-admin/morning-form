---
title: "feat: Health graph at any density — canvas always shows, source docs as nodes, evolving copy"
type: feat
status: active
date: 2026-05-15
---

# feat: Health graph at any density — canvas always shows, source docs as nodes, evolving copy

## Overview

Three small UI/data changes that together turn `/record?mode=map` from "list with a hidden canvas" into "live canvas that visibly grows as the vault accumulates data":

1. **Drop the density gate.** Show `<GraphCanvas>` on desktop whenever there's at least one node (no more `MIN_EDGE_DENSITY = 0.4` threshold).
2. **Render source documents as canvas nodes.** Synthesise `GraphNodeWire` entries from `data.sources` so the SUPPORTS edges have visible targets. A new user with one uploaded panel now sees a hub-and-spoke (panel in the centre, biomarkers radiating out) rather than 8 disconnected dots.
3. **Add evolving copy.** A single line above the canvas — "Your health graph evolves as you add data." — sets the metaphor so users read sparse-but-growing as the point, not the absence of richness.

## Problem Frame

- New users with one uploaded blood panel see a flat list under `/record?mode=map` because the canvas gate fails the density check (0/8 non-SUPPORTS edges)
- Even removing the gate, the bare biomarker nodes look disconnected: SUPPORTS edges currently dangle (their source-doc targets aren't in the canvas node array, so D3 drops them)
- Without the visible source-doc node, the user's first canvas view is 8 scattered dots — meaningfully *worse* than the current list
- Including source documents flips this: 1 panel + 8 biomarkers + 8 visible SUPPORTS edges = a clear hub-and-spoke, the most rewarding visual for a single-document user
- A short caption frames the canvas as evolving, so users with sparse early data read "growing" instead of "scrappy"

## Requirements Trace

- **R1.** Desktop users see `<GraphCanvas>` whenever they have ≥1 graph node, regardless of edge density
- **R2.** Source documents appear as canvas nodes (visible target for `SUPPORTS` edges), using the existing `source_document` `NodeType` and its `data` visual class (soft grey, already defined in `visual-encoding.ts`)
- **R3.** Source documents do **not** appear in `<GraphListView>` — that view stays grouped by health-data node type only (biomarkers, symptoms, conditions…); a per-document row would be noise there
- **R4.** A short copy line — *"Your health graph evolves as you add data."* — renders above the canvas on desktop
- **R5.** Mobile behaviour is unchanged — canvas remains desktop-only, list remains primary; the new copy is also desktop-only (it captions the canvas, not the list)
- **R6.** Empty-graph case (`nodes.length === 0`) still falls through to `<GraphListEmpty />`
- **R7.** No regression for users with rich graphs — they keep seeing the canvas, now with source documents included as additional hub nodes

## Scope Boundaries

- **Not** changing the `/api/record` aggregate to include sources in `data.nodes`. The synthesis happens client-side, in `<VaultMapMode>`, so the API stays cleanly separated (nodes = health-data nodes; sources = sources). The canvas is the only consumer that wants them merged.
- **Not** redesigning the canvas itself — D3 force simulation, node styling, edge styling all unchanged
- **Not** making the canvas responsive for mobile — separate work
- **Not** changing the `<GraphListView>` — sources don't appear there
- **Not** adding source-doc → source-doc edges or any new edge type. The hub-and-spoke shape emerges from existing `SUPPORTS` edges; nothing new to draw.

## Context & Research

### Relevant code and patterns

- [src/components/record/vault-layout.tsx:24,186-232](src/components/record/vault-layout.tsx) — the gate site, canvas wrapper, and where the new copy will sit
- [src/components/graph/graph-canvas.tsx](src/components/graph/graph-canvas.tsx) — pure consumer of `nodes` + `edges`; nothing to change
- [src/lib/graph/visual-encoding.ts:49-79](src/lib/graph/visual-encoding.ts) — `source_document` is already a registered `NodeType` mapped to the `data` visual class (`fill-text-tertiary/10` / `stroke-text-tertiary/60`). The canvas will style source-doc pseudo-nodes correctly with zero additional work.
- [src/lib/record/types.ts:66-71](src/lib/record/types.ts) — `AggregateSourceRow` shape: `{ id, kind, capturedAt, createdAt }`
- [src/types/graph.ts:12-26](src/types/graph.ts) — `GraphNodeWire` shape we need to synthesise to

### Existing pattern that proves this works (`/demo/record`)

The demo route already renders `<GraphCanvas>` with fixture data, ungated, including source-doc-style hubs. That's the existence proof. This plan brings the authed surface in line with the demo's behaviour.

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Synthesise source-doc nodes client-side vs server-side (`/api/record`) | **Client-side** in `<VaultMapMode>` | Keeps the API's separation clean (sources are a distinct concept from health-data nodes). The canvas is the only consumer that wants them merged; the list view explicitly should not. A boundary transform is the right pattern. |
| Source-doc node `type` value | **`'source_document'`** | Already a registered `NodeType` in `visual-encoding.ts` with the right visual treatment (`data` class, soft grey). No new type to define, no new visual to design. |
| Source-doc node display label | **`"<Kind> · <MMM YYYY>"`** (e.g. `"Blood panel · May 2026"`) | Synthesised from `AggregateSourceRow.kind` + `capturedAt`. Distinguishes multiple uploads, scans cleanly in a hover label. |
| Source-doc node `tier` / `score` | **Tier 1, score = max(graph-node scores) + 1** | Tier 1 sets the node radius to the largest size (12 in `radiusForTier`) and makes its label always visible (`labelVisibleByDefault(1) === true`). For a hub node, both are right — it should anchor the visual, not blend in. Score above the highest biomarker keeps it from being pruned if a future cap is added at the canvas layer. |
| Source-doc nodes in the list view? | **No** | The list groups by health-data node type. A per-document row would be visual noise — documents are already surfaced under the index view's documents section. Canvas-only inclusion is the right scope. |
| Copy placement | **Above the canvas, between the meta strip and the canvas block** | Sets context before the canvas appears. Putting it below would read as a postscript. |
| Copy show-when-sparse only vs always | **Always** | One-line, ambient. Users with a rich graph still benefit from the framing ("evolves as you add data" tracks even for active users). Conditional display adds complexity for low payoff. |
| Copy styling | **Italic, light, `text-text-tertiary`** | Matches the existing caption tone in the canvas wrapper. Not a heading, not a CTA — ambient framing. |
| Hide the list once the canvas shows? | **No, keep both** | Different purposes — canvas is spatial/relational, list is type-grouped scan. The user didn't ask to remove the list. |

## Open Questions

### Resolved during planning

- **Sources in list view too?** No — see Key Decisions. Canvas-only.
- **Synthesise on the API side or in the component?** Component — see Key Decisions.
- **What `tier` for source-doc nodes?** Tier 1 — see Key Decisions.
- **When to show the evolving copy?** Always — see Key Decisions.

### Deferred to implementation

- **Exact extraction of `kind` for the display label.** `kind` may be `"blood_panel"`, `"lab_panel"`, `"gp_letter"`, etc. — implementation should humanise it (`blood_panel` → `Blood panel`). A small `humaniseKind(kind: string)` helper in the same file is enough; do not add a new module.
- **Stable id for source-doc pseudo-nodes.** Use `AggregateSourceRow.id` directly — these are real IDs from the DB, just from a different table. The canvas only cares about uniqueness within its node array, and source-doc IDs are guaranteed not to collide with graph-node IDs (different tables, different ID spaces).
- **Should source-doc nodes' `userId` field match the user?** The wire type requires it. Use the user's id, the same way it's set on real graph nodes. The implementer can read it from `useSession()` or accept it as a prop from the existing `<VaultLayout>` context.

## Implementation Units

- [ ] **Unit 1: Drop the density gate**

  **Goal:** Render `<GraphCanvas>` on desktop whenever there's ≥1 node to draw, regardless of edge density.

  **Requirements:** R1, R5, R6, R7

  **Dependencies:** None.

  **Files:**
  - Modify: [src/components/record/vault-layout.tsx](src/components/record/vault-layout.tsx) — delete `MIN_EDGE_DENSITY` (line 24), delete `nonSupportsEdgeRatio` + `showCanvas` in `VaultMapMode`, replace the `{showCanvas && ...}` JSX with `{isDesktop && ...}`

  **Approach:**
  - Drop two lines (constant + ratio calc) and rewire one JSX gate. No other changes.

  **Test scenarios:**
  - Test expectation: none — visual UX change with no behaviour assertion that adds value beyond `tsc` + visual verify. The existing tests (none target this file) still pass.

  **Verification:**
  - `/record?mode=map` on desktop with 1 source + 8 biomarkers: canvas visible above the list (will show 8 nodes; Unit 2 adds the source-doc node on top)
  - `/record?mode=map` with empty graph: `<GraphListEmpty />` only (unchanged)
  - `/record?mode=map` on mobile: list only (unchanged)

- [ ] **Unit 2: Synthesise source-document pseudo-nodes for the canvas**

  **Goal:** Append `GraphNodeWire`-shaped entries for each source document to the canvas's node array so SUPPORTS edges connect to a visible hub.

  **Requirements:** R2, R3, R7

  **Dependencies:** Unit 1 (or independently — they can land in either order, but Unit 2's value is only visible once the canvas shows).

  **Files:**
  - Modify: [src/components/record/vault-layout.tsx](src/components/record/vault-layout.tsx) — inside `VaultMapMode`, derive `canvasNodes = [...data.nodes, ...synthesizeSourceNodes(data.sources)]`. Pass `canvasNodes` (not `data.nodes`) to `<GraphCanvas>`. `<GraphListView>` continues to receive `data.nodes` only.

  **Approach:**
  - Add a small local helper `synthesizeSourceNodes(sources: AggregateSourceRow[]): GraphNodeWire[]` either inline or near the top of the file.
  - Map each `AggregateSourceRow` to a `GraphNodeWire` with: `id` = source id, `type` = `'source_document'`, `displayName` = `humaniseKind(kind) + ' · ' + format(capturedAt, 'MMM yyyy')`, `tier` = 1, `score` = `Math.max(...data.nodes.map(n => n.score), 0) + 1`, `attributes` = `{}`, `confidence` = 1, `promoted` = false, `canonicalKey` = source id (or `source_${id}`), `userId` = the user id (read from session or pass in), `createdAt`/`updatedAt` = `source.createdAt.toISOString()` / `source.capturedAt.toISOString()`.
  - `humaniseKind` is a 3-line inline helper: split on `_`, capitalise the first letter of the first word.
  - No change to `<GraphListView>` — it continues to receive `data.nodes`.
  - No change to `data.edges` — SUPPORTS edges already exist, they'll now find their targets.

  **Technical design** *(directional guidance, not implementation specification):*

  ```
  before:
    <GraphCanvas nodes={data.nodes} edges={data.edges} ... />

  after:
    const canvasNodes = [...data.nodes, ...synthesizeSourceNodes(data.sources, userId, scoreCeiling)]
    <GraphCanvas nodes={canvasNodes} edges={data.edges} ... />

  synthesizeSourceNodes maps each AggregateSourceRow to a GraphNodeWire-shaped
  object with type='source_document', tier=1, displayName=humaniseKind(kind) +
  ' · ' + format(capturedAt). The shape is what the canvas reads — the source's
  data.sources stays untouched for other consumers.
  ```

  **Patterns to follow:**
  - `visualForNode('source_document')` in [src/lib/graph/visual-encoding.ts](src/lib/graph/visual-encoding.ts) returns the soft-grey style — already mapped; no styling work needed
  - `date-fns` is already a dependency (see `package.json`); use `format(date, 'MMM yyyy')`

  **Test scenarios:**
  - Test expectation: none in the test runner — visual outcome is the bar. Verification is by viewing `/record?mode=map` on a single-doc account and confirming the canvas renders a hub-and-spoke (1 grey source node + 8 accent-coloured biomarkers + visible connecting lines).

  **Verification:**
  - Single-doc account: canvas shows 1 hub (grey, larger, labelled "Blood panel · May 2026" or similar) + 8 biomarker nodes + 8 visible edges between them
  - Multi-doc account: canvas shows N hubs + M biomarker nodes + connecting edges (biomarkers shared across docs cluster near the relevant sources)
  - `<GraphListView>` is visually unchanged — source documents do NOT appear in it
  - `tsc --noEmit` clean

- [ ] **Unit 3: Add evolving-graph copy above the canvas**

  **Goal:** Add a single line — *"Your health graph evolves as you add data."* — above the canvas on desktop so users read sparse-but-growing as intentional.

  **Requirements:** R4, R5

  **Dependencies:** Unit 1 (the copy lives in the canvas block that Unit 1 ungates).

  **Files:**
  - Modify: [src/components/record/vault-layout.tsx](src/components/record/vault-layout.tsx) — inside the `{isDesktop && <div>...</div>}` block introduced by Unit 1, add a `<p>` above `<GraphCanvas>`

  **Approach:**
  - Place the copy inside the canvas wrapper `<div>`, above `<GraphCanvas>`, so it visually pairs with the canvas
  - Style: italic, `text-text-tertiary`, body or caption size — ambient, not a heading
  - The existing caption *"Tap a node to see what grounds it. The structured list below shows the same data, grouped."* stays where it is (below the canvas). The two lines complement: top one frames the metaphor, bottom one explains the interaction.

  **Technical design** *(directional guidance, not implementation specification):*

  ```
  <div className="canvas wrapper">
    <p className="italic text-text-tertiary text-caption mb-3">
      Your health graph evolves as you add data.
    </p>
    <GraphCanvas ... />
    <p className="existing tap-to-see-what-grounds-it caption">...</p>
  </div>
  ```

  **Patterns to follow:**
  - The existing italic-tertiary styling elsewhere in the marketing tree (search for `italic.*text-text-tertiary` in `src/components/marketing/`) — match the tone

  **Test scenarios:**
  - Test expectation: none — pure copy/style change. Visual verify by viewing the page.

  **Verification:**
  - `/record?mode=map` desktop: the line *"Your health graph evolves as you add data."* renders above the canvas
  - `/record?mode=map` mobile: the line does NOT render (it's inside the desktop-only canvas wrapper)
  - The existing "Tap a node…" caption still renders below the canvas (unchanged)

## System-Wide Impact

- **Interaction graph:** Two component-internal changes (gate + node-array synthesis) and one copy addition. No API, no schema, no session, no downstream consumer affected.
- **Error propagation:** None.
- **State lifecycle risks:** None — UI-only change.
- **API surface parity:** `/demo/record` continues to render the canvas ungated and is unchanged. Authed `/record?mode=map` now matches the demo's *behaviour*; with source-doc inclusion it actually goes further (the demo may or may not include sources — implementer can check; if the demo doesn't, the authed view is fine to diverge there).
- **Integration coverage:** Visual verification on three states (empty / single-doc-sparse / multi-doc-rich) is the proof.
- **Unchanged invariants:** `/api/record` aggregate shape, `<GraphListView>` rendering, mobile-list-only behaviour, the URL-state for mode and selected entity, the empty-graph fallback.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `humaniseKind` produces ugly output for unknown kinds (e.g. raw `"clinic_note"` → `"Clinic note"` reads fine, but `"misc"` → `"Misc"` reads weird) | The function is 3 lines; a known-kind table can be added later if the raw humanisation doesn't suffice. v1 ships the simple version. |
| Source-doc node IDs collide with graph-node IDs (would confuse the D3 simulation) | Source and graph node IDs come from different DB tables with different ID spaces (cuid()). No collision possible. If a future schema change makes this risky, prefix in `synthesizeSourceNodes`. |
| Sparse canvas (1 source + 1 biomarker, e.g. a single observation) looks awkward | Force sim with 2 nodes connected by an edge will produce a stable two-dot pair. Honest representation of the data shape. The copy "evolves as you add data" frames this as intentional growth. |
| `<GraphListView>` consumers downstream see different data than the canvas | They already do — `<GraphListView>` only ever cared about health-data nodes. The canvas now includes sources too. This is the intended asymmetry, not a bug. Document briefly in a code comment so the next reader doesn't try to "fix" it. |

## Documentation / Operational Notes

- A one-line comment in `VaultMapMode` explaining "canvas receives synthesised source-doc nodes; list view does not" prevents future drift toward accidental sync.
- No external docs update needed.

## Sources & References

- **Direct request:** in-session decision to include source-doc nodes + add evolving copy
- **Original plan (this file's earlier version):** density gate alone, with these two pieces deferred to v2
- **Code:** [src/components/record/vault-layout.tsx](src/components/record/vault-layout.tsx), [src/lib/graph/visual-encoding.ts](src/lib/graph/visual-encoding.ts)
- **Pattern reference:** `/demo/record` (ungated canvas with fixture data)
