---
title: "feat: Force-directed health-graph canvas — public /demo/record"
type: feat
status: active
created: 2026-05-01
deepened: 2026-05-01
sibling: docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md
reference: /Users/reubenselby/Developer/seam/app/src/components/features/graph
---

## Problem

`/demo/record`'s hero says *"32 nodes, 41 edges, 6 sources"* but the page renders text-based specialty cards — visitors never see the graph. User feedback verbatim: *"i thought i was going to be able to see the graph with the actual nodes and edges and connections (if any) but there are lots of health things that are related to different things in our health"*.

This plan ships a force-directed graph canvas on `/demo/record` only, modeled on the production pattern in [seam](/Users/reubenselby/Developer/seam/app/src/components/features/graph) — the same engineer's working implementation of a knowledge-graph view.

## Document-review resolution

This plan was rewritten after a 7-reviewer pass surfaced blockers and strategic concerns. Reviewer-by-reviewer resolution of the major findings:

| # | Finding | Resolution |
|---|---------|-----------|
| **B1** | `NodeDetailSheet` hardcodes authed fetches → demo node taps would 401. Plan claimed "no changes". | **U6** explicitly modifies `NodeDetailSheet` to accept optional `hydratedProvenance` + `hydratedTopics` props that bypass the fetch. |
| **B2** | `force-directed` + `force-static` is incoherent — random initial positions break SSR coherence. | **U1** uses a deterministic seeded RNG (Mulberry32 from `metabolic-persona.ts`) so layout is stable per-fixture. Plus seam's `simulation.tick()` pre-warm pattern (line 254 of `useGraphState.ts`) so first paint has converged positions. |
| **S1** | Force-directed is wrong primary metaphor for the product (parent pivot calls graph view "secondary"); 8 units of UI polish during private beta is wrong work. | **Scope cut to demo only.** U5 (authed `/graph` wiring) and U6 (hover highlight as a separate unit) are deferred. The canvas becomes a *secondary* visual on `/demo/record`, scrolled below the existing hero — not the hero itself. The current text surfaces remain primary content. |
| **S2** | "See the graph" was assumed = "force-directed". Sankey or layered DAG might fit hierarchical data better. | Force-directed is retained because the fixture has cross-tier edges (a biomarker can support multiple conditions, a single source can ground multiple biomarkers) that flatten poorly into a Sankey. But the layout is constrained: deterministic seeding + light gravity, so the result reads as a *settled* node-link diagram, not chaotic physics. |
| **D1** | Label legibility (32 nodes will collide), 18 NodeTypes ↔ 4 colors mismatch, hub treatment, a11y, settling UX. | **U2** addresses all five: tier-based label visibility (always-on for tier-1, hover for tier-2/3), 4-class color collapse (`clinical`, `biomarker`, `wearable`, `admin`), `aria-label` summary on the SVG root, `<button role>` per node for keyboard nav, and a fade-in transition that runs *after* `simulation.stop()` (no jitter visible). |
| **C1** | "Canvas" terminology drift; stale risks reference rejected library. | Plan renamed throughout to "graph canvas" only as the component name; risks scoped to current decisions. |
| **F-tail** | DemoNode.nodeKey vs id round-trip; bundle target mismatch; @visx version pin. | Library decision changed (see U1) — plain `d3` instead of `@visx/network`. Adapter in U3 explicitly states `id = nodeKey`. |

**One blocker not resolved here, surfaced for explicit user decision:** product-lens findings 1-4 (single-anecdote premise, brand metaphor lock-in, opportunity cost, adoption pattern mismatch). The user chose to proceed despite these — building the graph canvas is the requested work. Acknowledged residual risk in §Risks.

## Scope Boundaries

- **In scope:**
  - One `<GraphCanvas>` component on `/demo/record` (desktop ≥768px), force-directed SVG, deterministic layout per-fixture
  - Visual encoding scoped to the **7 NodeTypes + 5 EdgeTypes the fixture actually uses**, with a generic-fallback path for the remaining 11 types so the same component will render the authed `/graph` someday
  - Tap a node → `NodeDetailSheet` opens with fixture-hydrated provenance (no auth fetch)
  - Hover/tap dims non-1-hop neighbors (the "show me what this connects to" interaction)
  - Mobile (`<768px`) keeps the existing text surfaces — no canvas at all on mobile, no list-view-as-fallback either (cleaner than juggling two graph representations)

- **Out of scope:**
  - `/graph` (authed) wiring — defer until canvas proves out on demo (resolves S1)
  - User-editable node positions persisted to `GraphNodeLayout`
  - Animated transitions when graph data mutates (real users adding nodes)
  - Zoom + pan affordances (32 nodes fit at viewport width; if real-data density warrants this, add later)
  - 3D / WebGL renderers
  - Generic library escape hatch — if SVG perf degrades at 200+ nodes on the authed surface, we'll address then

## Implementation pattern: seam as source

The reference implementation lives at `/Users/reubenselby/Developer/seam/app/src/components/features/graph`. Adopt these patterns verbatim — this is a battle-tested working implementation:

- `useGraphState.ts` — D3 simulation lifecycle hook with `simNodesRef`, `hasUserInteractedRef`, `dataRef`, and the `initGraph()` callback shape that survives StrictMode double-invocation. Copy the structure; trim out features we don't need (progress map, MyNotes filter, voice playback, connect mode, expertise heatmap).
- `renderers/types.ts` — the `GraphRenderer` interface. Each renderer owns `setupDefs`, `containerBackground`, `tooltipTheme`, `legend`, and the `tick` rendering callback. We ship one renderer for v1 (no switcher).
- `renderers/neural-ink.ts` — single-file renderer pattern. ~300 lines, pure d3 + SVG. Read it for the SVG structure + texture-via-defs technique, then build our own `editorial-ink` renderer matching our Tailwind tokens.

Copy is welcome — this is the same author's working code on a parallel project.

## Implementation Units

### U1 — Install d3, scaffold `<GraphCanvas>` + `useGraphState` hook

**Goal:** Land the dependency and a `<GraphCanvas>` skeleton powered by `useGraphState`. Force-simulation runs deterministically (seeded), pre-warmed (60 ticks) so first paint shows converged positions.

**Files:**
- `package.json` — add `d3` (~100 KB raw / ~30 KB gzipped) + `@types/d3`
- `src/components/graph/graph-canvas.tsx` — new (`'use client'`)
- `src/components/graph/use-graph-state.ts` — new — the simulation lifecycle hook, modelled on seam's `useGraphState.ts`
- `src/components/graph/graph-canvas.test.ts` — render smoke test

**Approach:**
1. Adopt seam's hook structure: `simulationRef`, `simNodesRef`, `simEdgesRef`, `hasUserInteractedRef`, `dataRef`. Init guard for React StrictMode.
2. Use a Mulberry32 seeded RNG (already in `prisma/fixtures/synthetic/metabolic-persona.ts`) to assign initial node positions — pulls determinism into the simulation so SSR ↔ hydration agree.
3. Pre-warm: `simulation.stop(); for (let i = 0; i < 60; i++) simulation.tick();` before the first paint (seam pattern at `useGraphState.ts:254`). This eliminates the "force-directed jitter on first load" risk.
4. After pre-warm: `simulation.alphaTarget(0).restart()` for a brief smooth settle, then `simulation.stop()` on `'end'`.
5. No zoom/pan in v1 — fixture fits at 768px viewport.

**Patterns to follow:**
- `/Users/reubenselby/Developer/seam/app/src/components/features/graph/useGraphState.ts` (lines 70-260 for simulation lifecycle)
- `src/components/demo/sparkline.tsx` (Tailwind class-based SVG primitive)

**Test scenarios:**
- Renders nothing for empty `nodes` array
- Renders an `<svg>` with N `<circle>` and M `<path>` elements for an N-node M-edge input
- `onNodeClick` fires with the right node id when a node is tapped
- Component is `'use client'`; parent RSC boundary stays clean
- Simulation halts (alpha < 0.001 OR 200 ticks consumed within 500ms — same upper bound as Vitest test)
- Two consecutive renders with identical seeded data produce identical node positions (determinism lock)

**Verification:** `npm run build` clean; bundle delta on `/demo/record` route in `next build` output stays under +120 KB raw (~40 KB gzipped).

---

### U2 — Visual encoding scoped to fixture, with type-fallback

**Goal:** Single source of truth for how each `NodeType` and `EdgeType` renders, scoped to what the fixture actually uses. A `default` rendering path covers the unused 11 types so the component will render real-user data without crashing.

**Files:**
- `src/lib/graph/visual-encoding.ts` — new module
- `src/lib/graph/visual-encoding.test.ts` — coverage test (fixture types covered; default fallback exists for unknowns)

**Approach:**
- **Node visual classes (4):** Map 18 NodeTypes into 4 visual buckets so we have 4 distinguishable colors — not 18:
  - `clinical` (condition, symptom, symptom_episode, allergy) → `text-alert/80` ring
  - `biomarker` (biomarker, observation, metric_window) → `text-accent` solid fill
  - `intervention` (intervention, intervention_event, medication, lifestyle, procedure, encounter, referral, immunisation) → `text-positive` outlined
  - `data` (source_document, mood, energy) → `text-text-tertiary` dotted ring
  Plus tier modulates radius (tier 1: 12px, tier 2: 9px, tier 3: 7px — match seam's neural-ink tiers).
- **Edge visual classes (3 by hierarchy):**
  - `agreement` (`SUPPORTS`, `ASSOCIATED_WITH`, `INSTANCE_OF`, `OUTCOME_CHANGED`, `TEMPORAL_SUCCEEDS`) — solid, thin, low-opacity
  - `causation` (`CAUSES`) — solid, with arrow head
  - `contradiction` (`CONTRADICTS`) — dashed, `text-alert/60`
  - On hover/focus, edge type label appears in tooltip — full taxonomy is preserved in data, just not all-styled-at-once on the canvas (resolves design-lens F4).
- **Label visibility:**
  - Tier 1 nodes: always-on label below the dot
  - Tier 2/3: label appears on hover/tap only
  - Resolves the 32-node label-collision problem.
- **Color tokens** come from the existing Tailwind palette (`text-alert`, `text-accent`, `text-positive`, `text-text-tertiary`) — no new hex values.

**Patterns to follow:**
- `seam/app/src/components/features/graph/renderers/neural-ink.ts` — tier-based radius + per-tier visual treatment
- `src/components/demo/sparkline.tsx` — Tailwind stroke classes
- `src/lib/graph/importance.ts` — existing tier scoring (reuse, don't reinvent)

**Test scenarios:**
- Every NodeType used by `prisma/fixtures/synthetic/graph-narrative.ts` resolves to one of the 4 visual classes (typed satisfies + runtime test)
- Every EdgeType used by the fixture resolves to one of the 3 hierarchy classes
- Unknown NodeType / EdgeType resolves to a generic fallback (`text-text-tertiary` neutral) — no exception
- Tier 1 radius > tier 2 > tier 3

**Verification:** `vitest run` passes; visual smoke test in U4 confirms 4 distinguishable node fill classes appear in the rendered DOM.

---

### U3 — Demo-fixture → wire-shape adapter

**Goal:** `DemoNode`/`DemoEdge` adapters into `GraphNodeWire`/`GraphEdgeWire` so the canvas accepts the same shape on both demo and authed surfaces.

**Files:**
- `src/lib/demo/graph-adapter.ts` — new module
- `src/lib/demo/graph-adapter.test.ts` — round-trip tests

**Approach:** Pure function `adaptDemoFixture(fixture: DemoRecordFixture): GraphResponse`. Identity mapping rules — explicit and locked:
- `node.id = node.nodeKey` (so U6/U7 lookups by id work)
- `node.userId = 'demo'`
- `node.score` = edge degree centrality, normalized 0-1
- `node.tier` = 1 if degree ≥ 4, 2 if ≥ 2, else 3
- `node.confidence = 1`, `promoted = true`, fixed timestamps from fixture metadata
- Edge ids: `${fromNodeKey}__${type}__${toNodeKey}` (deterministic hash, stable under re-render)
- Pre-build a `Record<nodeId, { node, chunks: DemoSourceChunk[], sources: DemoSource[] }>` for U6's hydrated provenance lookup.

**Patterns to follow:**
- `src/lib/graph/importance.ts`
- `scripts/demo/seed-metabolic-persona.ts` (parallel logic for the DB seed path)

**Test scenarios:**
- Output node count = input node count
- Output edge count = input edge count
- Every edge `fromNodeId`/`toNodeId` resolves to a valid node id
- Score is monotonic with edge degree
- Output is deterministic (no `Math.random` / `Date.now`)
- Provenance lookup contains every source chunk from the fixture

**Verification:** Adapter tests pass; demo page successfully feeds the adapted shape into `<GraphCanvas>`.

---

### U4 — Wire `<GraphCanvas>` into `/demo/record`

**Goal:** Add the graph canvas as a section between hero and existing specialty surfaces. Existing text content stays as the primary read; canvas becomes a visual companion.

**Files:**
- `src/app/demo/record/page.tsx` — restructure
- `src/components/demo/demo-graph-section.tsx` — new client wrapper that handles desktop/mobile branch

**Approach:**
- Wrap GraphCanvas in `<DemoGraphSection>` ('use client'). Use CSS-driven viewport gating (`hidden md:block`) — *not* `useMediaQuery`, which produces a hydration flash (resolves design-lens F5(1)).
- Layout: hero (existing) → graph canvas (new) → specialty surfaces (existing) → sources (existing).
- Canvas height: 480px desktop, hidden mobile. Width: container width (max-w-3xl from layout).
- ARIA: `role="img"` + descriptive `aria-label` on the SVG root; each node is a focusable `<g role="button" tabindex="0">` with `aria-label="{displayName}"`.
- `force-static` build target preserved; the canvas is a client island under the static parent.

**Execution note:** Visual surface — capture before/after screenshots, attach to PR description.

**Test scenarios:**
- `/demo/record` server-renders cleanly under `force-static`
- Page renders `<svg>` element on desktop viewport (Playwright @ 1280×800)
- All fixture nodes (count derived from fixture, not hardcoded) appear as `<circle>` elements
- Mobile viewport (390×844) does NOT render the SVG (hidden via `md:block`)
- Tier-1 nodes have visible always-on labels; tier-2/3 don't

**Verification:** `npx next build` clean; Playwright test passes against Vercel preview.

---

### U5 — `<NodeDetailSheet>` accepts hydrated provenance/topics (B1 fix)

**Goal:** Modify `NodeDetailSheet` so passing an optional `hydratedProvenance`/`hydratedTopics` prop bypasses the auth-gated fetches — required for demo to work without 401s.

**Files:**
- `src/components/graph/node-detail-sheet.tsx` — extend props, branch on hydrated vs fetch
- `src/components/graph/node-detail-sheet.test.ts` — new test for hydrated path
- `src/components/mention/mention.tsx` — verify still works (uses fetch path; no changes needed)

**Approach:**
- Add `hydratedProvenance?: { node, chunks, sources }` and `hydratedTopics?: TopicAppearance[]` props.
- Inside the existing `useEffect`s, short-circuit to setting state from the prop instead of fetching when present.
- Existing `Mention` component caller is unaffected — it doesn't pass the new props, so fetch path runs as before.

**Patterns to follow:**
- The existing `useEffect` structure in `node-detail-sheet.tsx` (lines 87-119, 289-313)

**Test scenarios:**
- Sheet with `node` + `hydratedProvenance` passed: renders sources from props, fires zero fetches
- Sheet with `node` only (existing path): fires fetches as before — Mention's authed flow unbroken
- 401 on `/api/graph/nodes/.../provenance` still surfaces an alert (existing behaviour)

**Verification:** Existing `Mention` integration still works in dev (manual sign-in test); new test asserts zero fetches when hydrated path is used.

---

### U6 — Demo NodeDetailSheet wiring + hover/highlight interaction

**Goal:** Tapping a node on `/demo/record` opens the modified `NodeDetailSheet` with U3's pre-built lookup. Hover/tap dims non-1-hop neighbors so the "see what's connected" promise lands.

**Files:**
- `src/components/demo/demo-graph-section.tsx` — wire onNodeClick → state → sheet
- `src/components/graph/graph-canvas.tsx` — extend with `focusedNodeId` state, dim non-neighbors

**Approach:**
- In `<DemoGraphSection>`: `const [openId, setOpenId] = useState<string | null>(null)`. On node click, set `openId`; render `<NodeDetailSheet node={lookup[openId].node} hydratedProvenance={lookup[openId]} onClose={() => setOpenId(null)} />`.
- In `<GraphCanvas>`: `focusedNodeId` state. On hover (desktop) or tap (mobile, but mobile is hidden in v1), set focus. Compute 1-hop neighbor set from edges. Apply `opacity: 0.2` to non-neighbors via class swap. Tap on SVG background or Esc clears focus. Re-uses U2's classes — just multiplies stroke alpha.

**Test scenarios:**
- Clicking node `cond-prediabetes` opens the sheet with that node's display name
- Sheet shows fixture chunks (zero fetches fired in network log)
- Hover on a high-degree node dims expected non-neighbor count
- Esc closes the sheet (existing `NodeDetailSheet` behaviour)
- Background-tap clears focus (no sheet opens)

**Verification:** Playwright run against the Vercel preview — open `/demo/record`, click on a visible node, assert the sheet opens with the right text and zero authed fetches.

---

### U7 — Tests + production verification

**Goal:** Full regression net before merge.

**Files:**
- `src/components/graph/graph-canvas.test.ts` — unit / interaction
- `src/components/graph/use-graph-state.test.ts` — hook lifecycle (StrictMode safety, resize, simulation halt)
- `src/lib/demo/graph-adapter.test.ts` — adapter
- `src/lib/graph/visual-encoding.test.ts` — coverage + fallback
- `src/components/graph/node-detail-sheet.test.ts` — hydrated path + existing fetch path
- `/tmp/morning-form-browser-test/test-graph.mjs` — Playwright extension

**Approach:**
- Unit layer covers data shape and pure logic.
- Hook test mocks `requestAnimationFrame` to verify `simulation.stop()` is called on cleanup, and the StrictMode double-invocation guard works.
- Visual layer (Playwright) confirms the SVG renders, the right number of nodes appears, the sheet opens on click, and zero `/api/graph/nodes/*` requests fire on the demo flow.

**Test scenarios (consolidated):** all U1, U3, U5, U6 unit assertions; production smoke that `/demo/record` returns 200 with `<svg>` containing fixture-count `<circle>` elements; existing security-headers test still passes.

**Verification:** `vitest run` passes; `next build` clean; Playwright run against Vercel preview passes.

## Requirements Trace

| ID | Requirement | Implementation Unit |
|----|-------------|---------------------|
| R1 | Visitors see actual nodes and edges on `/demo/record` (desktop) | U1, U4 |
| R2 | Demo node clicks open `NodeDetailSheet` with fixture provenance, no authed fetches | U5, U6 |
| R3 | Layout is deterministic — same node positions across reloads (force-static coherence) | U1 (seeded RNG + pre-warm) |
| R4 | Visual encoding distinguishes node visual class and edge hierarchy at a glance | U2 |
| R5 | Hover/tap reveals the 1-hop neighborhood ("see what's connected") | U6 |
| R6 | Mobile viewport keeps the existing text surfaces — no degraded canvas | U4 (CSS gating) |
| R7 | All existing surfaces continue to work — `Mention` flow on authed pages unaffected | U5 |
| R8 | Build, typecheck, and existing security-headers test continue to pass | U7 |

## Risks

- **Strategic risk acknowledged:** product-lens reviewers (4 P1 findings) argue this might be the wrong work for private beta — opportunity cost vs. unshipped topic pages, GP-record import, first-login migration. User has decided to proceed; capturing here for visibility.
- **Force-directed metaphor adoption.** No consumer-health peer leads with a graph view. Mitigation: canvas is *secondary* on `/demo/record` — sits below the existing text surfaces, doesn't replace them.
- **d3 bundle size.** ~30 KB gzipped for the chunk this PR adds. Acceptable given d3 is broadly the right tool, and we use it for one page.
- **StrictMode + simulation re-init.** Mitigated by seam's ref-guard pattern (verified working in production).
- **Hub node visual collapse.** A node with 6+ edges may anchor a tangled cluster. v1 accepts this; if real-user feedback flags it, address with edge bundling (out of scope).

## Deferred to Implementation

- Whether to persist node positions to `GraphNodeLayout` (needs `/api/graph/layout` route)
- "Reset layout" button (defer to user testing)
- Tunable simulation params (`forceManyBody` strength, `forceLink` distance)

## Confidence Check

- Plan depth: **Standard** — feature with clear technical decisions, 7 bounded units.
- Library locked: plain `d3` (matches seam's pattern; no visx/react-force-graph layer to reason about).
- All blockers from the document-review pass mapped to implementation units with explicit resolution language.
- Sibling plan ([2026-04-15-004](2026-04-15-004-feat-health-graph-pivot-plan.md)) anticipated this work as the desktop refinement of U13.
- Production reference exists at `/Users/reubenselby/Developer/seam/app/src/components/features/graph` — same author, same patterns, working code to copy from.
