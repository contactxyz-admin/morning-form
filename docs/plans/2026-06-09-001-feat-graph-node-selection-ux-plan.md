---
title: "feat: Designed node selection & focus states for the health graph (kill the native blue box)"
type: feat
status: active
date: 2026-06-09
---

# feat: Designed node selection & focus states for the health graph

## Overview

Clicking a node on `/record?mode=map` (and `/demo/record`) paints the **browser's
native blue focus ring** around the node — an oversized, off-center rectangle
that clashes with the entire design language and persists after the detail
sheet closes. This plan replaces that accident with a deliberate, Apple-grade
three-state interaction grammar for canvas nodes:

- **Hover** *(exists, unchanged)* — transient 1-hop neighborhood lift: non-neighbors dim, nearby labels surface.
- **Selected** *(new)* — a circular **selection halo** concentric with the node, in the node's own visual-class hue, that springs in on click, mirrors the open detail surface (`?entity=` in the URL), and releases when it closes. The neighborhood emphasis *persists* while selected instead of vanishing on mouseleave.
- **Keyboard focus** *(new, designed)* — the same halo geometry in the design system's graphite focus treatment, shown only for keyboard focus (`:focus-visible`). Mouse clicks leave **no** focus artifact: selection *is* the feedback.

Phase 1 (Units 1–3) ships the grammar and fixes the complaint. Phase 2 (Unit 4,
gated) converts the desktop detail sheet from a scrimmed modal into a non-modal
inspector rail — the already-deferred U4 of the vault-unification plan — which
completes the model (select → inspect → click another node to switch, graph
never lost behind a scrim).

## Problem Frame

Screenshot from the owner (2026-06-09, `/record?mode=map`): a blue rounded
rectangle stuck on a node left of the "Lab report · Mar 2026" hub. Three
distinct failures compose into that one box:

1. **The native ring leaks through.** `globals.css` promises "soft moss glow, never the native blue" but only does `:focus-visible { outline: none }` with **no replacement** (the `ZoomButton` comment in `graph-canvas.tsx` already flags this). Chromium draws a UA focus ring on focusable SVG content on *click* focus regardless, so the suppression misses the `<g class="graph-node" tabindex="0">` groups.
2. **The ring is drawn around the wrong shape.** The UA ring traces the group's bounding box, which includes the `opacity-0` tier-2/3 hover label `<text>` (invisible but geometric) — hence a wide rectangle hovering beside a small circle instead of anything node-shaped.
3. **There is no designed selected state.** Clicking opens `NodeDetailSheet`, but the canvas itself shows nothing tied to the selection: the hover dim clears on mouseleave, the URL holds `?entity=` but `GraphCanvas` never receives it, and after the sheet closes the stale UA ring is the only "memory" of the click. Source-document nodes are worse — the click is silently swallowed (`vault-layout.tsx` guard) yet the node still takes focus and shows the box, reading as broken.

## Requirements Trace

- **R1** — Clicking or focusing a node never shows the native UA focus ring on either render site; the oversized bbox rectangle is gone.
- **R2** — A designed, persistent **selected** state on the canvas mirrors the open detail surface: appears on click / Enter / Space, tracks `?entity=` (so deep-links render it on load), and releases when the surface closes (close button, Escape, backdrop, back navigation, deep-link-guard clear).
- **R3** — Keyboard focus stays visibly indicated via a designed `:focus-visible` treatment (WCAG 2.4.7 — replace, never just remove), visually distinct from selection, ≥3:1 contrast against the canvas background (WCAG 1.4.11).
- **R4** — Hover behavior is unchanged and composes with selection: hovering another node temporarily re-aims the neighborhood emphasis, releasing back to the selected node's emphasis on mouseleave.
- **R5** — Source-document nodes get honest affordances: on the authed vault they navigate to the existing `/record/source/[id]` page; on the public demo (no source page) they are not presented as buttons.
- **R6** — `prefers-reduced-motion`: halo appears/disappears instantly, no spring. SSR/node-test paths unchanged.
- **R7** — All motion/selection DOM work runs through the existing imperative seam (class/attr toggles on retained selections) — never a sim re-init, never a re-render of the canvas (the `dataSignature` / entrance-restart footgun).

## Scope Boundaries

- ❌ Redesigning `NodeDetailSheet` content — only its desktop *modality* changes, and only in gated Phase 2.
- ❌ Mobile canvas work — mobile renders `GraphListView`; the sheet stays a modal bottom sheet there.
- ❌ Selected-row treatment in `GraphListView` — same selection source of truth, separate surface; deferred.
- ❌ Any physics / zoom / entrance changes (`use-graph-state.ts` motion model untouched beyond the halo wiring).
- ❌ `/api` payload or graph data changes.
- ❌ Multi-select, marquee select, context menus — single selection only.

### Deferred to Separate Tasks

- `GraphListView` selected-row highlight driven by the same `?entity=` state.
- A source-document detail experience on the public demo (fixture has no `/record/source/[id]` equivalent).
- Camera assist: pan/zoom the selected node into the visible region when the Phase-2 rail covers it (needs the zoom controls' programmatic transform; design-reviewed separately).

## Context & Research

### Relevant Code and Patterns

- **Node groups (focus target):** `src/components/graph/use-graph-state.ts` — `initGraph` appends `<g class="graph-node" role="button" tabindex="0">` per node with circle + label children; click/keydown call `onNodeClickRef`. This file is under `src/components/**` so Tailwind classes set here are inside the content glob (the tier labels already rely on that).
- **Hover/emphasis seam:** `src/components/graph/graph-canvas.tsx` — `focusedNodeId` state + an imperative effect toggling `style.opacity` on `[data-node-id]` / `[data-from-id]` from `neighbourIds`. The svg `onClick` clears focus on background clicks. **This is the seam the selected state must reuse** — class/attr toggles on existing DOM, no re-init.
- **Selection source of truth:** `src/components/record/vault-layout.tsx` (`?entity=<canonicalKey>`, `selectedNode` resolved from `state.data.nodes`, deep-link truncation guard) and `src/components/demo/demo-graph-section.tsx` (`?entity=<nodeId>`). Neither passes selection into `GraphCanvas` today.
- **The stale guard:** `vault-layout.tsx` `handleNodeClick` swallows `source_document` clicks with a comment "No source-doc detail surface exists yet" — **stale**: `src/app/(app)/record/source/[id]/page.tsx` exists and `synthesizeSourceNodes` sets the pseudo-node `id`/`canonicalKey` to the real `SourceDocument.id` (`src/lib/record/canvas-synthesis.ts`), so navigation is a straight `router.push`.
- **Design tokens:** `tailwind.config.ts` — `accent.DEFAULT #1D1D1F` (graphite, "for focus rings and active states"), `shadow-ring-focus: 0 0 0 2px rgba(29,29,31,0.42)`; node visual-class strokes (`stroke-accent`, `stroke-alert/70`, `stroke-positive/80`, `stroke-text-tertiary/60`) already safelisted because `visual-encoding.ts` lives in `src/lib`.
- **Focus reset:** `src/app/globals.css` `:focus-visible { outline: none }` (no replacement). Note `box-shadow` does not render on SVG elements — the canvas focus treatment must be an SVG ring, not `shadow-ring-focus` itself.
- **Sheet lifecycle:** `node-detail-sheet.tsx` — modal scrim (`fixed inset-0 bg-text-primary/30 backdrop-blur-sm`) + Escape-to-close. On desktop the panel already docks right (`md:right-0 md:w-[440px]`); Phase 2 only removes the scrim/modality on `md+`.

### Institutional Learnings (load-bearing)

- **Hover state must not re-init the sim** (`use-graph-state.ts` header + Plan 2026-06-08-001): volatile interaction state routes through refs/imperative toggles; `initGraph` keys only on `width/height/seed/dataSignature`. The `selectedNodeId` prop must follow the same discipline.
- **Tailwind JIT drops data-driven classes from `src/lib/**`** (`docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`): any halo stroke class defined in `visual-encoding.ts` needs safelisting, exactly like the existing node strokes.
- **Visual audit is a non-optional gate for canvas work** (`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`).
- **Vitest runs in `node` (no DOM)** — only pure seams are unit-testable; interaction behavior is covered by the visual audit (Plan 2026-06-08-001's test strategy).

### Design references (the "why" behind the grammar)

- Apple HIG, *Focus and selection*: selection and focus are **different states with different lifetimes** — selection persists and means "this is what the inspector shows"; focus is transient input targeting. Conflating them is precisely today's bug.
- Apple platform precedent for the halo: Maps/Freeform select annotations with a soft concentric ring in the object's own hue, springing from the object — not a rectangle around its bounds.
- WCAG 2.4.7 (focus visible), 1.4.11 (non-text contrast ≥3:1 for the focus indicator), 2.4.11 (focus appearance — prefer a ≥2px perimeter indicator).

## Key Technical Decisions

- **One pre-rendered halo `<circle>` per node, toggled — no DOM churn.** `initGraph` appends a `graph-node-halo` circle (radius `radiusForTier(tier) + 4`, matching the collide padding so halos never overlap neighbors; `stroke-width: 2`; `fill: none`; `pointer-events: none`; hidden at rest) inside each node group, *before* the label so the label stays legible. Selection/focus toggle classes on the group; CSS does the rest. This keeps R7 (imperative seam) and makes the entrance/drag transforms carry the halo for free.
- **Halo color = the node's visual class hue for selection; graphite for keyboard focus.** Selection means "this node" — it should speak the node's identity (`selectionStrokeClass` derived in `visual-encoding.ts` from the same 4-class mapping). Keyboard focus uses full-opacity `stroke-accent` (#1D1D1F, 2px) — the `ring-focus` token's 0.42 alpha lands ≈2.5:1 on the warm canvas and would fail WCAG 1.4.11; full graphite passes everywhere.
- **Suppress the UA ring only because a replacement exists.** `globals.css` gains `.graph-node:focus { outline: none }` plus `.graph-node:focus-visible > .graph-node-halo { … graphite ring … }`. Removing without replacing is the a11y anti-pattern this plan exists to avoid.
- **Selection threads in as a prop, applied imperatively.** `GraphCanvas` gains `selectedNodeId?: string | null`. The existing dim effect derives `emphasisId = focusedNodeId ?? selectedNodeId` (hover wins while active, selection is the resting state — R4) and toggles a `data-selected` attr + halo class on the matching group. No new state in `useGraphState`; `initGraph` deps unchanged (R7). Render sites map their own URL state to a node **id** (vault: `selectedNode?.id`; demo: adapted node id) — the prop speaks node ids, never `canonicalKey`s.
- **Background-click clears focus, sheet-close clears selection — and the closed sheet must also blur.** Today a closed sheet leaves DOM focus on the `<g>` (the stale-ring symptom). On selection clear, if `document.activeElement` is the deselected group, blur it (guarded, imperative, inside the same effect).
- **Halo entrance is CSS, not framer-motion.** `transform: scale(.6)→1` + opacity with `transform-box: fill-box; transform-origin: center` and a ~250ms spring-feel ease; `@media (prefers-reduced-motion: reduce)` zeroes the transition (R6). No new animation controller; no interaction with the entrance/drag transforms (the halo lives *inside* the translated group).
- **Source-document honesty (R5):** vault routes on type — `source_document` → `router.push('/record/source/' + node.id)`, everything else → `?entity=`. Demo passes a per-node interactivity predicate so source pseudo-nodes render without `role="button"`/`tabindex`/pointer cursor (`useGraphState` already special-cases cursor per motion mode; the predicate gates `role`/`tabindex`/cursor/click in one place).

## Open Questions

### Resolved During Planning

- Rectangle vs circular indicator → circular halo concentric with the node (the rectangle is the bug, not a candidate).
- Single accent color vs node-hue halo → node hue for selection (identity), graphite for focus (input).
- Toggle-deselect on clicking the selected node → no; clicking the selected node is a no-op (the sheet is already open). Deselection is the surface closing.
- New React state in the hook vs prop + imperative toggle → prop + imperative (R7).

### Deferred to Implementation

- Exact halo gap/stroke (start `r+4`, 2px) and the selected node's label treatment (always-on while selected vs unchanged) — tune in the visual audit.
- Whether hover-while-selected should *fully* re-aim the dim or blend (start: hover wins outright, simplest mental model).
- Whether the demo should also surface a subtle non-interactive tooltip on source nodes (nice-to-have, audit call).

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

```
URL ?entity= ──► render site resolves node ──► <GraphCanvas selectedNodeId=…>
                                                      │
                              emphasisId = hoverId ?? selectedNodeId
                                                      │
                    existing imperative effect (same DOM, same seam):
                      · opacity dim from neighbourIds(emphasisId)
                      · [data-selected] + halo class on selected group
                      · blur deselected group if it holds DOM focus
CSS (globals.css):
  .graph-node:focus                       → outline: none        (R1)
  .graph-node[data-selected] > .halo      → node-hue ring, spring-in (R2, R6)
  .graph-node:focus-visible  > .halo      → graphite 2px ring    (R3)
```

## Implementation Units

### Phase 1 — Selection grammar (ships; fixes the complaint)

- [x] **Unit 1: Halo primitive + native-ring kill**

**Goal:** Every node owns a hidden halo ring; the UA blue box is gone; keyboard focus shows the designed graphite ring.

**Requirements:** R1, R3, R6

**Dependencies:** none

**Files:**
- Modify: `src/lib/graph/visual-encoding.ts` — `selectionStrokeClass(type)` (node-hue halo stroke per visual class) + `haloRadiusForTier(tier)` (= `radiusForTier + 4`).
- Modify: `tailwind.config.ts` — safelist the new halo stroke classes (src/lib footgun).
- Modify: `src/components/graph/use-graph-state.ts` — append the `graph-node-halo` circle per node group in `initGraph` (before labels, `pointer-events: none`).
- Modify: `src/app/globals.css` — `.graph-node:focus { outline: none }`; halo rest/visible rules; `:focus-visible` graphite ring; `transform-box`/`transform-origin`; reduced-motion zeroing.
- Test: `src/lib/graph/visual-encoding.test.ts` — extend.

**Approach:** pure helpers carry the testable logic; CSS owns show/hide/animate so the hook adds DOM once and never touches it again.

**Test scenarios:**
- Happy: `selectionStrokeClass` maps all 18 NodeTypes to exactly 4 safelisted classes; `haloRadiusForTier` = radius + 4 for tiers 1/2/3.
- Edge: unknown type falls back to the `data` class (mirrors `visualForNode`).

**Verification:** click a node in Chrome/Safari/Firefox → no native ring anywhere (the Chromium SVG click-focus quirk is the case that bites); Tab to a node → graphite ring, visually distinct from selection; reduced-motion → instant. **Visual-audit gate:** keyboard-focused vs selected vs hover screenshots on both render sites.

- [x] **Unit 2: Selected state threaded from the URL**

**Goal:** The canvas mirrors the open detail surface: halo + persistent neighborhood emphasis while `?entity=` is set, released (and DOM-blurred) when it clears.

**Requirements:** R2, R4, R6, R7

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/graph/graph-canvas.tsx` — `selectedNodeId` prop; `emphasisId = focusedNodeId ?? selectedNodeId` feeding the existing dim effect; `data-selected` toggle; blur-on-deselect; `aria-pressed` on the selected group.
- Modify: `src/components/graph/use-graph-state.ts` — accept the emphasis id via the existing `focusedNodeId` option (rename to `emphasisNodeId` if that reads cleaner); no dep changes to `initGraph`.
- Modify: `src/components/record/vault-layout.tsx` — pass `selectedNode?.id ?? null`.
- Modify: `src/components/demo/demo-graph-section.tsx` — pass the resolved selected node id.
- Test: `src/components/graph/use-graph-state.test.ts` — extend with a pure `emphasisNodeId(hoverId, selectedId)` helper test if extracted.

**Approach:** zero new state in the hook; the prop flows through the same volatile-ref channel as `focusedNodeId` so hover toggles still never restart the entrance (R7). Deep-links (R2) come free: the prop is derived from the URL on first render, and the truncation guard already clears stale entities.

**Test scenarios:**
- Happy: hover unset + selection set → emphasis = selection; hover set → hover wins; both unset → no dim, no halo.
- Edge: selected node absent from the canvas node set (truncation race) → no toggle, no throw.
- Edge: selection cleared while the group holds DOM focus → group is blurred (no stale ring, even the designed one).

**Verification:** click node → halo springs in, sheet opens, neighborhood stays emphasized with the pointer anywhere; close via ✕ / Escape / backdrop / browser-back → halo releases, canvas fully restored; load `/record?mode=map&entity=…` directly → halo present on first paint. **Visual-audit gate:** selected-with-sheet-open (through the scrim), post-close, deep-link first paint.

**Implementation notes (2026-06-09):** shipped with two deliberate deviations —
`aria-current="true"` instead of `aria-pressed` (pressed implies a toggle, and
clicking the selected node doesn't deselect), and blur-on-deselect guarded by
`!el.matches(':focus-visible')` so a keyboard user's Tab position survives
Escape while pointer-driven stale focus is still cleared.

- [x] **Unit 3: Honest source-document affordance**

**Goal:** Clicking a source-document node does something real on the vault, and stops pretending on the demo.

**Requirements:** R5

**Dependencies:** Unit 1 (shares the affordance seam)

**Files:**
- Modify: `src/components/record/vault-layout.tsx` — replace the stale swallow-guard with `router.push('/record/source/' + node.id)` for `source_document` (the pseudo-node id IS the document id per `canvas-synthesis.ts`).
- Modify: `src/components/graph/graph-canvas.tsx` + `use-graph-state.ts` — optional `nodeInteractive?: (node) => boolean` predicate gating `role="button"`, `tabindex`, pointer/grab cursor, and click emission; default all-interactive.
- Modify: `src/components/demo/demo-graph-section.tsx` — pass `(n) => n.type !== 'source_document'`.

**Test scenarios:**
- Happy: vault click on a source hub navigates to the source page; demo source node has no button role, takes no focus, swallows no click silently (there's nothing to click).
- Edge: keyboard Tab order on the demo skips non-interactive nodes.

**Verification:** vault source-hub click lands on `/record/source/[id]` with the document rendered; demo source nodes show default cursor and no focus stop. **Visual-audit:** cursor states over source vs data nodes on both sites.

### Phase 2 — Desktop inspector rail (gated)

> **Gate:** ship Phase 1 first. Build Unit 4 only if dogfood/demo sessions show the scrim hurting (users re-opening nodes one by one to compare, or the audit judging the blurred-canvas-while-selected read as broken). This is the vault-unification plan's deferred U4 — when triggered, deepen against that plan rather than re-scoping here.

- [ ] **Unit 4: Non-modal right rail on `md+`** *(gated)*

**Goal:** On desktop, the detail surface docks right without a scrim; the canvas stays live; clicking another node switches the selection in place. Mobile keeps the modal bottom sheet unchanged.

**Requirements:** R2 (completes it)

**Dependencies:** Units 1–2

**Files:** `node-detail-sheet.tsx` (desktop variant: drop scrim + `aria-modal`, switch to `role="complementary"`, focus *not* trapped), `vault-layout.tsx` / `demo-graph-section.tsx` (layout so the rail doesn't cover the canvas), Escape-to-close retained.

**Test scenarios / Verification:** select → rail; click second node → rail content swaps, halo moves (no close/reopen flicker); Escape closes and returns focus to the last-selected node; mobile unchanged. Visual audit: rail + halo side-by-side, node-switch mid-flight, narrow-desktop squeeze.

## System-Wide Impact

- **Both render sites inherit Units 1–2 automatically** via `GraphCanvas`; only the thin per-site wiring (props, click routing) differs.
- **A11y posture improves, not just shifts:** today's state is a WCAG 2.4.7 violation in waiting (outline suppressed globally with no replacement everywhere *except* where the UA quirk leaks). After Unit 1 the canvas has a real focus indicator; `aria-pressed` ties selection to the button semantics.
- **No physics/lifecycle changes:** `initGraph` deps untouched; halo rides inside translated groups so entrance/drag/zoom carry it; no new animation loops (R6/R7).
- **Unchanged invariants:** `/api` payloads, 200-node cap, mobile list view, deterministic first paint, zoom/drag behavior.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Halo stroke classes defined in `src/lib` silently dropped by Tailwind JIT | Safelist in `tailwind.config.ts` exactly like the existing node strokes; visual audit catches a miss |
| `outline: none` on `:focus` without a working replacement = a11y regression | The `:focus-visible` graphite ring lands in the same unit, same PR; audit includes a keyboard-only pass |
| `ring-focus` token (0.42 alpha) fails 3:1 on the warm canvas | Canvas focus ring uses full-opacity `stroke-accent`; contrast-checked in the audit |
| Selection prop churn re-inits the sim / restarts the entrance | Route through the existing volatile-ref channel; `initGraph` deps unchanged (R7); regression-checked by hovering during entrance |
| Stale DOM focus after sheet close (today's symptom, redesigned) | Explicit blur-on-deselect in the Unit 2 effect, with an explicit test scenario |
| `?entity=` is `canonicalKey` (vault) vs node id (demo) — unit mismatch | The prop speaks node ids only; each site maps its own URL state before passing |
| CSS `transform` on SVG without `transform-box: fill-box` scales from the canvas origin | Set `transform-box`/`transform-origin` in the same CSS block; audit the spring visually |
| Source-doc navigation surprises (hub click leaves the map) | It goes to a real, existing page the guard comment forgot about; back returns to `/record?mode=map` with URL state intact |

## Sequencing & Opportunity Cost

Phase 1 is small, surgical, and removes a visible defect on the owner-demo
path — the highest-traffic surface we screenshot for outsiders. It reuses
every existing seam (imperative dim effect, URL selection, visual-encoding
classes) and adds no new architecture. Phase 2 is real UX but touches
modality/focus-trap semantics and layout; it is exactly the work the
vault-unification plan already chose to defer, so it stays gated rather than
riding along. Stop after Phase 1 unless the gate fires.

## Documentation / Operational Notes

- No env vars, flags, schema, or API changes; ships via normal merge → Vercel deploy.
- Update the stale guard comment in `vault-layout.tsx` as part of Unit 3 (it documents a surface that now exists).
- Pre-merge: run the visual-audit screenshot set (hover / selected / keyboard-focus / post-close / deep-link × both sites × reduced-motion) — the gate code review can't cover.
- After Phase 1, a short `/ce:compound` note: "designed selection/focus grammar for imperative SVG canvases" (UA SVG focus-ring quirk + halo-inside-translated-group pattern) — net-new pattern for the repo.

## Sources & References

- Request: owner screenshot + "better UX/UI for the blue box when clicking graph nodes" (this session, 2026-06-09).
- Root cause: `src/app/globals.css` (`:focus-visible` reset, no replacement), `use-graph-state.ts` node groups (`tabindex`, opacity-0 label inflating the focus bbox), Chromium UA focus ring on click-focused SVG content.
- Repo targets: `src/components/graph/graph-canvas.tsx`, `src/components/graph/use-graph-state.ts`, `src/lib/graph/visual-encoding.ts`, `src/components/record/vault-layout.tsx`, `src/components/demo/demo-graph-section.tsx`, `src/app/globals.css`, `tailwind.config.ts`.
- Related plans: `docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md` (U4 right rail — Phase 2 here), `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` (imperative-seam + no-reinit discipline), `docs/plans/2026-05-01-001-feat-graph-canvas-viz-plan.md`.
- Related solutions: `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`, `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.
- Design: Apple HIG *Focus and selection*; WCAG 2.4.7, 1.4.11, 2.4.11.
