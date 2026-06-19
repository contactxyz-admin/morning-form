---
title: "feat: Demo lab-report (source) node detail — open the source on click"
type: feat
status: active
date: 2026-06-17
origin: docs/plans/2026-06-17-001-feat-graph-category-filter-and-label-legibility-plan.md
---

# feat: Demo lab-report (source) node detail — open the source on click

## Overview

On `/demo/record`, clicking a **source / lab-report node** ("Lab report · Apr
2024", "Wearable · May 2025", "Intake notes · Aug 2025") does **nothing**. This
is deliberate today — the demo marks `source_document` nodes non-interactive
(`isNodeInteractive = (n) => n.type !== 'source_document'`) because there was no
fixture-backed detail surface and opening the health-node sheet for a source
would resolve to `null` and trip the deep-link guard. But seeing **what a lab
report actually contains** — the measured values, what they mean, and the
verbatim excerpt that grounds the record — is exactly the trust-building moment
the demo exists to show.

The good news from research: the demo fixtures **already carry everything**.
Each `DemoSource` has full chunk text with page numbers and a `sourceRef`/label,
and the graph already knows which markers each report grounds (the `SUPPORTS`
provenance edges). There is also a **pure, tested shaper** (`buildSourceView`)
used by the authed source page.

This plan makes demo source nodes **clickable** and opens a **purpose-built,
Apple-grade source-detail surface** in the existing slide-in sheet — designed
with a **clinician's** sense of what matters: lead with the report's *meaning*
(the markers it established and their status), calibrate **trust** (verified lab
vs wearable estimate vs self-report), show the **verbatim excerpt** for
provenance, and frame everything as **information to discuss with a clinician,
not a diagnosis**. Tapping a marker the report established drills into that
marker's existing detail — a coherent source ⇄ marker loop.

**Cross-surface (per the user's ask): the same presentation ships to the real
record UI.** The source body is a **shared** component, so the authed
`/record/source/[id]` page renders the identical "what this report established" +
verbatim-excerpts experience — demo and real app stay one design, one component
(see R8 / Unit 5).

## Problem Frame

- `src/components/demo/demo-graph-section.tsx` passes `nodeInteractive={isNodeInteractive}`
  to the canvas; `isNodeInteractive` excludes `source_document`, so those node
  groups render with no `role`/`tabindex`/click and `handleNodeClick` early-returns.
- The detail surface is `NodeDetailSheet`, opened via the `?entity=<id>` URL
  state. `openNode` resolves **only** through `adapted.provenanceByNodeId`,
  which is keyed by **health-data node ids, never source ids** — so even if a
  source click set `?entity=<sourceKey>`, `openNode` would be `null` and the
  deep-link guard would immediately clear the param (a flicker, no detail).
- `NodeDetailSheet` has **no source branch**: its body is health-data shaped
  (`ChangeSince`, `Interpretation`, `Attributes`, `Provenance`, `AppearsIn`).
  Handed a synthesized source pseudo-node it would show only an empty header.

So three gaps: (1) source nodes aren't interactive, (2) `?entity=` can't resolve
a source, (3) the sheet can't present a source. The data to fill them already
exists in the fixture; this plan wires it through with a first-class design.

### What the data gives us (already in the fixture)

- `DemoSource`: `sourceKey`, `kind` (`lab_pdf | gp_record | intake_text |
  wearable_window | checkin`), `capturedAt`, `sourceRef` (panel/file name; null
  for intake/checkin), `label`, and **`chunks[]`** — each with verbatim `text`,
  `index`, `pageNumber`. Real content, e.g. *"Ferritin: 18 ng/mL (reference
  range 30–150). Flagged LOW by the lab."*
- The provenance edges (`fromDocumentId === sourceKey`) tell us **which graph
  nodes each report grounds**, and those grounded nodes carry the structured
  `change` (before/after value + unit + direction), `interpretation` (flag +
  plain-English), and `evidenceGrade` we can surface as the report's *meaning*.
- `buildSourceView(...)` (`src/lib/record/source-view.ts`, **pure, Prisma-free,
  tested**) already turns `{ kind, sourceRef, capturedAt, chunks, edges, nodes }`
  into a `SourceView` (`kindLabel`, `displayTitle`, sorted `chunks`, deduped
  `referencedNodes`). We reuse it verbatim for shaping.

## Design & Clinical Principles

> The user's brief: *"world-class Apple design — the best experience; also take
> advice as a world-class clinician and physician."* These principles drive the
> presentation spec below and are the bar for the mandatory visual audit.

**Apple-grade design**
- **One surface, no new chrome.** Reuse the existing sheet (bottom on mobile,
  right panel on desktop; spring in, backdrop blur, grab handle, Escape/▢
  close, `?entity=` deep-link). A lab report opens exactly like every other
  node — learnable, calm, no context switch.
- **Hierarchy = meaning first, evidence second.** Identity → what it established
  → the document text. Generous whitespace, the existing `SectionLabel` + card
  grammar, type scale, and restrained colour (status hues only where they carry
  signal). No banner gradient, no chartjunk.
- **Quiet motion, real depth.** The drill-down to a grounded marker reuses the
  sheet's existing transition; selecting a source also lights its neighbourhood
  on the canvas (existing hover/selection emphasis), so the graph *explains* the
  report spatially.

**World-class clinician lens**
- **Lead with the result, not the file.** A lab report's value to a person is
  its **measured values and their status** — surface those first (value, unit,
  reference context, calm flag), grouped attention-first but never alarming.
- **Calibrate trust (evidence grade).** A verified lab reads differently from a
  wearable estimate or a self-report. Show an explicit authority cue
  (`EVIDENCE_LABELS` already exist: *Lab result / Clinician record / Wearable
  estimate / Self-reported / Inferred link*).
- **Verbatim provenance.** Show the exact excerpt (with page) the value came
  from — the "show your working" that earns trust.
- **Non-diagnostic framing, always.** Mirror the repo's discipline
  (`2026-06-16-002/003`): "for tracking or discussion with a clinician, not a
  diagnosis." No interpretation presented as a conclusion; escalation defers to
  a clinician.

## Requirements Trace

- **R1 — Source nodes are interactive (demo).** `source_document` nodes are
  clickable, keyboard-focusable (`role=button`/`tabindex`/Enter/Space), and show
  the pointer affordance. Selecting one sets `?entity=<sourceKey>` (deep-linkable,
  back/forward, Escape-close), exactly like a health node.
- **R2 — `?entity=` resolves a source.** `openNode` resolves source pseudo-nodes
  (from the canvas node set), so the deep-link guard keeps a valid `?entity=<sourceKey>`
  and a shared/refreshed link reopens the report.
- **R3 — The sheet presents a purpose-built source detail.** When the open node
  is a `source_document`, the sheet renders a **source body** (not the
  health-node sections): identity header (kind label, captured date,
  `displayTitle`, evidence/authority cue) → **"What this report established"**
  (the grounded markers, each with value/flag where available, tappable) →
  **"From the document"** (verbatim excerpts with page numbers) → non-diagnostic
  note.
- **R4 — Pure, network-free data.** The source view is shaped by the reused pure
  `buildSourceView` fed from the fixture; grounded-marker value/flag come from
  the existing graph nodes. No Prisma, no fetch (public demo).
- **R5 — Drill-down loop.** Tapping a grounded-marker row transitions the sheet
  to that marker's existing detail (`updateUrl(nodeId)`); the marker's own
  "Where this came from" links back. Composes with canvas selection emphasis.
- **R6 — Composes with existing demo features.** Works with the category filter
  (a ghosted "Source" class stays non-interactive — you can't click a
  filtered-out report) and the time-scrubber (a report not-yet-captured as-of
  the scrub date is ghosted and non-interactive). Health-node detail unchanged.
- **R7 — Apple + clinical bar.** The presentation meets the Design & Clinical
  Principles above; verified in the mandatory visual audit.
- **R8 — Cross-surface parity (real graph + UI).** The meaning-first source body
  is a **shared `SourceDetailBody`** rendered by both the demo sheet and the
  authed `/record/source/[id]` page, so the real record UI shows the same
  "what this report established" + verbatim-excerpts presentation (fed by the
  authed Prisma → `buildSourceView` on that page; by the fixture in the demo).
  `ponytail:` one component, two data feeds — no forked presentation.

## Scope Boundaries

- ✅ **Cross-surface parity is IN SCOPE (user ask: translate all demo work to the
  real graph + UI).** The source-detail *presentation* is a **shared** component
  (`SourceDetailBody`) used by **both** the demo sheet **and** the authed
  `/record/source/[id]` page, so the real UI gains the same meaning-first body.
  `ponytail:` the shared body is the single source of truth — if the demo body
  evolves, the authed page inherits it; never fork the two.
- ❌ **No change to the authed graph's source-click navigation.** On the authed
  `/record?mode=map` a source click still opens the full `/record/source/[id]`
  page (not a sheet) — we only change the **body** that page renders, not how
  it's reached. (The demo uses the sheet because it has no per-source route.)
- ❌ **No network / Prisma** on the *demo* path; the fixture is the source of
  truth there. The authed page keeps its existing Prisma load → `buildSourceView`.
- ❌ **No re-parsing of lab values from raw text.** Structured value/flag come
  from the existing graph nodes the report grounds; the chunk text is shown
  **verbatim** (provenance, not a parser).
- ❌ No change to the force layout, the category filter, the scrubber, or the
  health-node sheet body.
- ❌ No new dependency.

### Deferred to Separate Tasks

- **Authed source-click opening the sheet instead of the full page.** The authed
  graph keeps its page navigation; unifying the container (sheet everywhere) is a
  separate UX call, deferred.
- **Inline numeric parsing of values/reference ranges from chunk text** (we use
  the structured node data instead).
- **A dedicated full-page demo source view** (rejected — the sheet is the right,
  consistent surface for the demo).

## Context & Research

### Relevant Code and Patterns

- `src/components/demo/demo-graph-section.tsx` — `isNodeInteractive` (the source
  exclusion to relax), `handleNodeClick`, `updateUrl`, `openNode` (the resolution
  to extend), the deep-link guard, and the `<NodeDetailSheet>` render site. Owns
  `canvasNodes` (includes the synthesized source hubs) and the fixture.
- `src/components/graph/node-detail-sheet.tsx` — the sheet chrome + body. Already
  imports `kindLabel`; `NODE_TYPE_LABELS.source_document = 'Source'`; has the
  `EVIDENCE_LABELS` map and the `Provenance` card style to mirror. Add a
  `source_document` body branch here (or a sibling `SourceDetailBody`).
- `src/lib/record/source-view.ts` — **reuse** `buildSourceView` (pure) +
  `kindLabel`. `SourceView` shape: `{ kind, kindLabel, displayTitle, capturedAt,
  chunks:[{id,index,text,pageNumber}], referencedNodes:[{id,type,displayName}] }`.
- `src/lib/demo/graph-adapter.ts` — `adaptDemoFixture` / `AdaptedDemoFixture`.
  Add a `sourceViewByKey` map (mirrors the existing `provenanceByNodeId` pattern),
  built from `fixture.sources` + the provenance edges. Pure, unit-testable.
- `src/lib/record/canvas-synthesis.ts` — `synthesizeSourceNodes` (hub `id ===
  sourceKey`, tier-1), `referencedSourceDocumentIds`, `synthesizeSourceEdges`.
  Confirms hub id == `sourceKey` (the `?entity=` value) and the provenance edge
  shape (`fromDocumentId === sourceKey → toNodeId` is a grounded node).
- `prisma/fixtures/demo-navigable-record.ts` — `DemoSource` / `DemoSourceChunk`
  (full text + page numbers + sourceRef + label). The content to present.
- The authed reference for "how a source is presented":
  `src/app/(app)/record/source/[id]/page.tsx` `<SourceBody>` ("Extracted nodes"
  chips + "Content" chunk articles) — the design we elevate for the demo.

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`
  — the source-detail presentation is a **mandatory human visual-audit gate**
  (Apple + clinical bar); vitest is `node` (no DOM), so the *feel* is
  browser-verified on the live demo.
- `docs/plans/2026-06-16-002/003` (clinically-honest graph / performance-baseline
  canvas) — the non-diagnostic framing, the `FLAG_PRESENTATION` calm taxonomy,
  the evidence-grade discipline. The source detail must speak the same language.
- `docs/plans/2026-05-16-001` (navigable record demo) — the `?entity=`
  deep-link + sheet pattern this extends.
- `docs/solutions/.../object-map-keys-from-user-input-must-be-map-2026-06-10.md`
  — `sourceViewByKey` is a `Map`, and `?entity=` is already validated
  (`ENTITY_PATTERN`/length) before lookup.

## Key Technical Decisions

- **Reuse the sheet, branch the body — don't fork a new surface.** A
  `source_document` open node renders a `SourceDetailBody` inside the existing
  `NodeDetailSheet`; health nodes render today's body unchanged. One detail
  surface, one deep-link mechanism, one set of open/close/escape/animation
  semantics. (Considered a dedicated `SourceDetailSheet` — rejected: it would
  duplicate the chrome and the `?entity=` plumbing.)
- **Shape with the pure `buildSourceView`; enrich from the live graph nodes.**
  `buildSourceView` gives identity + chunks + the list of grounded node ids/types/
  names (reuse, single source of truth). The **clinical "meaning"** (value, unit,
  direction, flag) is read from the corresponding **graph nodes** (`change` /
  `interpretation`) by id — no value re-parsing, no drift from the canvas.
- **Put `sourceViewByKey` in the adapter (pure, tested), mirroring
  `provenanceByNodeId`.** Keeps the component declarative and the shaping
  node-env testable. Built from `fixture.sources` (chunks → `SourceViewChunk`)
  and the provenance edges (`fromDocumentId === sourceKey → toNodeId`) against
  `fixture.nodes`. `capturedAt`/`createdAt` → `Date` for `buildSourceView`.
- **Resolve source open-nodes from the canvas node set, not provenance.**
  `openNode` falls back to a `sourceKey → hub node` lookup (the `canvasNodes`
  source hubs) so `?entity=<sourceKey>` stays valid and the deep-link guard
  doesn't clear it. `ENTITY_PATTERN` already admits `sourceKey` tokens.
- **Meaning-first, calm, non-diagnostic — the clinical order.** Section order:
  identity (+ evidence cue) → "What this report established" (grounded markers,
  attention-first, calm flags, value/direction) → "From the document" (verbatim
  excerpts) → the standard non-diagnostic note. No diagnosis, no alarm.
- **Drill-down via the existing URL state.** A grounded-marker row calls the
  demo's `updateUrl(nodeId)` (already the node-open path), so source → marker is
  a first-class, deep-linkable transition with zero new navigation code.
- **Interactivity composes with the filter/scrubber for free.** Making source
  nodes interactive means the category-filter ghost (pointer-events/tabindex
  off) and the scrubber ghost already gate them correctly — a filtered-out or
  not-yet-captured report isn't clickable.

## Open Questions

### Resolved During Planning (user)

- *Which surface?* → **The public demo (`/demo/record`)** only. (Authed source
  clicks already work.)
- *How presented?* → **Best-in-class**: reuse the slide-in sheet with an
  Apple-grade, clinically-framed source body (design chosen here, dialed in the
  visual audit).

### Deferred to Implementation (tune in the visual audit)

- **Exact "what this report established" row design** — value + unit + direction
  glyph + calm flag chip; how much reference context to show (only what the node
  carries — no invented ranges); attention-first ordering vs source order.
- **Whether to show an evidence cue per source kind** (verified lab vs wearable
  estimate) in the header vs inline — and the exact copy.
- **Empty/sparse cases** — a source that grounds nothing (show excerpts only), a
  source with no chunks (show "what it established" only), intake/check-in
  sources (no `sourceRef` → `displayTitle` falls back to `kindLabel · date`).
- **Header title source** — `sourceView.displayTitle` (from `sourceRef`/label)
  vs the hub's `displayName` (`kindLabel · MMM yyyy`).

## High-Level Technical Design

> Directional — not implementation spec.

```
demo-graph-section:
  isNodeInteractive: drop the source_document exclusion (all nodes interactive)
  handleNodeClick(node): updateUrl(node.id)            // already; now reached for sources
  openNode = provenanceByNodeId.get(entity)?.node
           ?? sourceHubById.get(entity)                // NEW: resolve source pseudo-nodes
  if (openNode.type === 'source_document'):
     sourceView = adapted.sourceViewByKey.get(openNode.id)
     grounded   = sourceView.referencedNodes
                    .map(r => nodeById.get(r.id)).filter(Boolean)   // live nodes (value/flag)
     <NodeDetailSheet node={openNode} sourceDetail={{ sourceView, grounded }}
                      onOpenNode={updateUrl} ... />
  else: today's <NodeDetailSheet ... hydratedProvenance .../>

NodeDetailSheet body:
  if (node.type === 'source_document' && sourceDetail):
     <SourceDetailBody sourceView grounded onOpenNode />
  else: today's sections (ChangeSince/Interpretation/Attributes/Provenance/AppearsIn)

SourceDetailBody (the Apple/clinical surface):
  Header:   kindLabel · captured date · displayTitle · [evidence cue]
  Section "What this report established":
     for each grounded node (attention-first):
        row: displayName  ·  value+unit+direction (from node.change)  ·  calm flag chip
             → button → onOpenNode(node.id)            // drill-down
     empty → omit section
  Section "From the document":
     for each chunk: card { kindLabel · p.N · text(verbatim) }
     empty → "This source has no extractable text."
  Footer: non-diagnostic note (repo-standard copy)

adapter.sourceViewByKey: Map<sourceKey, SourceView>     // buildSourceView per fixture source
```

## Implementation Units

- [ ] **Unit 1: `sourceViewByKey` in the demo adapter (pure + tested)**

**Goal:** Expose a `sourceKey → SourceView` map on `AdaptedDemoFixture`, shaped
by the reused pure `buildSourceView`.

**Requirements:** R2, R4

**Dependencies:** None

**Files:**
- Modify: `src/lib/demo/graph-adapter.ts` — build `sourceViewByKey` from
  `fixture.sources` (chunks → `SourceViewChunk`), the provenance edges
  (`fromDocumentId === sourceKey → toNodeId`) and `fixture.nodes` (→ referenced
  node rows), via `buildSourceView`. Add to `AdaptedDemoFixture`.
- Test: `src/lib/demo/graph-adapter.test.ts` — extend.

**Approach:** for each `DemoSource`, assemble `buildSourceView` input (Date
`capturedAt`/`createdAt`, chunk rows, edge rows from the grounding provenance,
node rows), store the result by `sourceKey`. Reuse `kindLabel`/`buildSourceView`
(no re-implementation).

**Test scenarios:** a lab source resolves to a `SourceView` with `kindLabel`
"Lab report", `displayTitle` from `sourceRef`, chunks ordered by index, and
`referencedNodes` = the markers it grounds (deduped, sorted); an intake source
(null `sourceRef`) falls back to `kindLabel · date`; a source grounding nothing
→ empty `referencedNodes`; map has an entry for every referenced source.

**Verification:** new tests green; no change to `provenanceByNodeId` or existing
adapter output.

- [ ] **Unit 2: `SourceDetailBody` — the Apple/clinical presentation**

**Goal:** A presentational component rendering a `SourceView` + grounded-marker
enrichment as the meaning-first, non-diagnostic source detail.

**Requirements:** R3, R5, R7, R8

**Dependencies:** Unit 1

**Files:**
- Create: **`src/components/record/source-detail-body.tsx`** — a **shared**
  component (not under `graph/`), since both the demo sheet (Unit 3) and the
  authed `/record/source/[id]` page (Unit 5) render it. `ponytail:` shared
  location = single source of truth for source presentation.
- (Reuse) `kindLabel`, `EVIDENCE_LABELS`/evidence mapping, `FLAG_PRESENTATION`,
  `changeDirectionGlyph`, `SectionLabel`, the sheet card styling.

**Approach:** header (kind label, captured date, `displayTitle`, evidence cue) →
"What this report established" (grounded markers attention-first: displayName +
`change` value/unit/direction + calm flag chip, each a button → `onOpenNode`) →
"From the document" (verbatim chunk cards with page numbers) → non-diagnostic
note. Sparse/empty sections omitted gracefully. Props: `{ sourceView, grounded:
GraphNodeWire[], onOpenNode?: (id) => void }`. `onOpenNode` is optional so the
authed page (which links grounded markers via `<Link>`/router instead of the
demo's `updateUrl`) can pass its own navigation or omit it.

**Patterns to follow:** the existing `Provenance`/`Interpretation` card grammar
in `node-detail-sheet.tsx`; design tokens; calm flag taxonomy; non-diagnostic copy.

**Test scenarios:** (logic is light; presentation is visual-audit-gated) —
renders grounded rows with value+flag and fires `onOpenNode` on click; renders
verbatim excerpts with page numbers; omits empty sections; intake/check-in
(no grounded markers) shows excerpts only.

**Verification:** visual audit confirms the Apple/clinical bar; clicking a
grounded row drills down.

- [ ] **Unit 3: NodeDetailSheet source branch**

**Goal:** Render `SourceDetailBody` for `source_document` open nodes; keep the
health-node body unchanged.

**Requirements:** R3, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `src/components/graph/node-detail-sheet.tsx` — add an optional
  `sourceDetail?: { sourceView; grounded }` + `onOpenNode?` prop; when `node.type
  === 'source_document'` and `sourceDetail` is present, render the source body
  (and the header evidence/title) instead of the health sections.

**Approach:** branch only the body (and the header title/evidence line); reuse
all chrome (animation, backdrop, Escape, close, a11y dialog). Default/no
`sourceDetail` → today's behaviour exactly (authed callers unaffected).

**Test scenarios:** health node → unchanged body; source node + `sourceDetail`
→ source body, no health sections; missing `sourceDetail` → graceful (no crash).

**Verification:** health-node detail byte-unchanged; source node shows the new body.

- [ ] **Unit 4: Demo wiring — interactivity, resolution, drill-down**

**Goal:** Make source nodes interactive, resolve `?entity=<sourceKey>`, and feed
the sheet the source detail + drill-down.

**Requirements:** R1, R2, R5, R6

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `src/components/demo/demo-graph-section.tsx` — drop the
  `source_document` exclusion from `isNodeInteractive` (all nodes interactive;
  the canvas default — the `nodeInteractive` prop can be removed); extend
  `openNode` to resolve source hubs (a `sourceKey → hub` lookup over
  `canvasNodes`); ensure the deep-link guard keeps source ids; when `openNode`
  is a source, compute `grounded` (referenced nodes via a `nodeById` map over
  `canvasNodes`) and pass `sourceDetail` + `onOpenNode={updateUrl}` to the sheet.

**Approach:** minimal, reuses `updateUrl` for both open and drill-down. Confirm
composition: a filter-ghosted or scrubber-ghosted source is non-interactive
(canvas already enforces via the dim effect), so only a *visible* report opens.

**Test scenarios:** (interaction is visual-audit-gated) — clicking a lab node
opens the source sheet; deep-link `?entity=<sourceKey>` reopens it; an unknown
`?entity=` still clears; clicking a grounded marker opens that marker; "Source"
filtered off → report not clickable.

**Verification:** clicking any source node opens its detail; drill-down works;
no regression to health-node open/close or the deep-link guard.

- [ ] **Unit 5: Authed `/record/source/[id]` adopts the shared body (real-UI parity)**

**Goal:** The authed source page renders the same meaning-first `SourceDetailBody`
as the demo, so the real record UI gains the "what this report established"
presentation (R8).

**Requirements:** R8

**Dependencies:** Unit 2

**Files:**
- Modify: `src/app/(app)/record/source/[id]/page.tsx` — replace the inline
  `<SourceBody>` "Extracted nodes" + "Content" sections with the shared
  `<SourceDetailBody>` (keep the page's own header/MeshGradient banner). Feed it
  the `SourceView` already built from the authed Prisma load via `buildSourceView`,
  plus the `grounded` nodes it already loads (the referenced `graphNode`s) for
  the value/flag enrichment.
- Possibly modify: `src/app/api/record/source/[id]/route.ts` — only if the
  grounded markers' `change`/`interpretation` aren't already in the referenced-
  node payload; extend the select minimally if needed.

**Approach:** the page keeps its full-page chrome (banner, title) and swaps the
body for the shared component. Grounded-marker rows link via the page's normal
navigation (router/`<Link>` to the marker), not the demo's `updateUrl`. No change
to how the page is reached (the authed graph still routes here on a source click).

**Patterns to follow:** the existing `<SourceBody>` data flow in the page; the
shared `SourceDetailBody` (Unit 2); authed navigation patterns in the page.

**Test scenarios:** the authed page renders grounded markers (value/flag) + the
verbatim chunks via the shared body; an owned source loads; unauth/not-found
unchanged; a source grounding nothing shows excerpts only.

**Verification:** authed `/record/source/[id]` shows the same body as the demo
sheet (parity); no regression to auth/not-found; visual audit on a real record.

## System-Wide Impact

- **Interaction graph:** source nodes join the same `?entity=` selection model
  as health nodes; the sheet body branches on node type; drill-down reuses
  `updateUrl`. Canvas selection emphasis now also fires for source nodes
  (lights the markers they ground) — a free explanatory win.
- **Error propagation:** pure client + fixture; no network/Prisma. A source with
  no chunks or no grounded markers degrades to the available sections.
- **State lifecycle:** no new timers/effects beyond the existing selection
  effect; the source view is memoized in the adapter (built once per fixture).
- **API surface parity:** none — no API/wire change. `NodeDetailSheet` gains an
  optional prop defaulting to today's behaviour, so authed callers are unchanged.
- **Unchanged invariants:** health-node detail, the authed `/graph` +
  `/record/source/[id]`, the category filter, the scrubber, the force layout,
  and reduced-motion behaviour.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Source sheet drifts from authed source presentation | Reuse the pure `buildSourceView`/`kindLabel` for shaping; backport the richer body to the authed page as a follow-up (Future Considerations) |
| Clinical overclaim / alarm in the new surface | Lead with structured node data (no value re-parsing), calm `FLAG_PRESENTATION`, explicit non-diagnostic footer; visual audit with the clinical lens |
| Deep-link guard clears a valid `?entity=<sourceKey>` | Extend `openNode` to resolve source hubs before the guard runs; covered by adapter + resolution tests |
| Interactivity conflicts with the filter/scrubber ghosts | The canvas dim effect already sets pointer-events/tabindex off for ghosted nodes — a filtered/not-yet-captured report is non-interactive by construction; verify in audit |
| NodeDetailSheet bloats / regresses health-node body | Branch only the body+header on `source_document` behind an optional prop; default path byte-unchanged; health-node test stays green |
| Sparse fixture sources (no chunks / no grounded markers) | Each section omits gracefully; intake/check-in fall back to `kindLabel · date` title and excerpts-only |

## Documentation / Operational Notes

- No flag, schema, API, or rollout change. Demo-only; ships to the live demo
  (`/demo/record`), where the **mandatory visual audit** (Apple + clinical bar)
  is run on the prod build.
- Candidate `docs/solutions/` note: "demo source nodes open the shared sheet with
  a meaning-first source body shaped by the pure `buildSourceView`; structured
  value/flag read from the grounded graph nodes, excerpts shown verbatim."

## Sources & References

- Origin / prior demo work: `docs/plans/2026-06-17-001-…` (this branch's
  filter/legibility), `docs/plans/2026-05-16-001-feat-navigable-record-demo-plan.md`
  (the `?entity=` sheet pattern), `docs/plans/2026-06-16-002/003` (clinical honesty
  + flag taxonomy + evidence grade).
- Code: `src/components/demo/demo-graph-section.tsx`,
  `src/components/graph/node-detail-sheet.tsx`, `src/lib/record/source-view.ts`,
  `src/lib/record/canvas-synthesis.ts`, `src/lib/demo/graph-adapter.ts`,
  `prisma/fixtures/demo-navigable-record.ts`,
  `src/app/(app)/record/source/[id]/page.tsx` (authed reference).
- Visual-audit gate: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.

## Future Considerations

- **Cross-surface parity is now in scope** (Unit 5 — shared `SourceDetailBody` on
  the authed page). What remains future: optionally unify the *container* so the
  authed graph opens the sheet rather than the full page.
- **From-the-document highlighting:** highlight the exact `offsetStart/offsetEnd`
  span within a chunk that grounds a tapped marker.
- **Value/range extraction:** parse numeric values + reference ranges from chunk
  text to render mini result tables when structured node data is absent.
