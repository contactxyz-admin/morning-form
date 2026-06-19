---
title: "feat: Graph detail-sheet focus management + drag-base / control focus-ring fixes"
type: feat
status: active
date: 2026-06-18
origin: docs/plans/2026-06-17-003-feat-deferred-graph-items-closeout-plan.md
---

# feat: Detail-sheet focus management (a11y) + drag-base & control focus-ring fixes

## Overview

Three keyboard/focus correctness fixes the integrated-graph reviews surfaced,
grouped because they're the remaining **interaction-correctness** gaps (not new
feature surface). They were pre-existing — the source drill-down and the filter
chips made them more visible, but none originate from that work.

1. **Detail-sheet focus management (BLOCKER).** `NodeDetailSheet` is a
   `role="dialog" aria-modal="true"` but does **no** focus management: opening it
   leaves focus on the canvas node behind the scrim, Tab walks the page *under*
   the sheet, and closing it drops focus to `<body>`. A modal must trap focus,
   take initial focus on open, and **return focus to the trigger** on close. The
   new source→marker drill-down (sheet re-opening with new content) makes the
   missing focus-return especially jarring.
2. **Drag-base staleness / "teleport" (MED).** `graph-canvas.tsx` caches a
   node's position-only transform in `data-base-transform` on the first scrub and
   thereafter prefers it (`?? `). A node **dragged** after that cache is written
   updates its live `transform` but not the cache, so the next reveal-scrub
   composes `scale()` onto the **stale** base and the node snaps back to its
   pre-drag spot. Pre-existing from the scrubber-physics work.
3. **Bare focus rings on the demo controls (MED a11y).** The global
   `:focus-visible { outline: none }` (globals.css) strips the native ring; most
   controls re-add a designed `focus-visible:outline-…` ring, but the demo's
   **Play/Pause button** and **as-of range slider** don't — so they're
   keyboard-focusable with **no visible focus indicator** (WCAG 2.4.7 fail).

## Problem Frame

- The sheet (`src/components/graph/node-detail-sheet.tsx`) already handles Escape
  (window keydown) and a scrim click-to-close, and the close button has a focus
  ring — but there is no focus **trap**, no **initial focus**, and no **return**.
  On both surfaces the sheet renders into the same React tree as the canvas, so a
  keyboard user can Tab out of the dialog into the dimmed graph behind it. This is
  a WCAG 2.1.2 (no keyboard trap — here the *inverse*: focus not contained) /
  2.4.3 (focus order) / 4.1.2 issue on a primary surface.
- The drag-base bug is a one-line root cause (`??` never refreshes the cache after
  a drag) but the fix must not regress the reason the cache exists: an
  *interrupted* scrub tween can leave a `scale()` on `transform`, and re-reading
  that as the base would bake the scale in. So the cache can't simply be dropped —
  it must be **invalidated when a drag writes a new position**.
- The control rings are a pure styling omission: add the project's standard
  `focus-visible` ring (the same `outline-button-focus` pattern used by the close
  button and the "Appears in" chips) to the two bare controls.

## Requirements Trace

- **R1 — Focus trap.** While the sheet is open, Tab/Shift-Tab cycle only within
  the dialog; focus can't reach the canvas or page behind the scrim.
- **R2 — Initial focus.** On open, focus moves into the sheet (the close button or
  the dialog container) — not left on the now-obscured trigger node.
- **R3 — Focus return.** On close (Escape, scrim, close button, or
  programmatic), focus returns to the element that opened the sheet (the canvas
  node `<g>` / the source-marker control that drilled in). Drill-down
  (sheet content swap via `onOpenNode`) must keep a coherent return target.
- **R4 — Reduced-motion / determinism / parity untouched.** Focus logic is
  behaviour-only; it must not alter layout, the entrance/scrub tweens, or the
  seeded positions. Works identically on demo + authed (same component).
- **R5 — Drag survives a later scrub.** A node dragged to a new position stays
  there across a subsequent as-of scrub/reveal — no teleport to the pre-drag
  spot. The existing interrupted-tween protection (scale stripping) is preserved.
- **R6 — Visible focus on every demo control.** Play/Pause button and the range
  slider show the standard designed focus ring on keyboard focus; no behaviour
  change; reduced-motion safe.

## Scope Boundaries
- ❌ No redesign of the sheet's visuals, layout, or content (focus only).
- ❌ No new dependency (no `focus-trap`/`@radix` import) unless a from-scratch
  trap proves unreasonable — prefer a small local trap hook (see Decisions).
- ❌ No change to the drag mechanism, click-vs-drag disambiguation, watchdogs, or
  fx/fy pinning — only the base-transform cache invalidation.
- ❌ Not touching the global `:focus-visible` reset (other surfaces rely on it);
  just adding the missing per-control rings.
- ❌ No scrubber/physics behaviour change beyond the stale-base fix.

## Context & Research

### Relevant Code
- `src/components/graph/node-detail-sheet.tsx` — the dialog. Has the Escape
  handler + scrim; **add** initial-focus, trap, and return. Note the
  `AnimatePresence` exit animation: focus return must fire on close intent, and
  not be lost while the exit tween runs.
- `src/components/graph/graph-canvas.tsx` (≈L205–214 tick scale-strip; L271–321
  scrub base/reveal) — the `data-base-transform` cache + the `${base} scale(s)`
  composition. The stale-base fix lives here and/or in the drag handler.
- `src/components/graph/use-graph-state.ts` (drag `on('start'|'drag'|'end')`,
  ≈L810–878) — the drag pins `fx/fy`; the sim tick writes the group `transform`.
  The cleanest invalidation point may be here (clear `data-base-transform` when a
  drag moves the node).
- `src/components/demo/demo-graph-section.tsx` (≈L338–374) — the Play button +
  range slider needing the focus ring.
- `src/app/globals.css` (L52–55 global reset; the `.graph-node:focus*` rules) —
  the reason controls go bare; the `outline-button-focus` token is the standard
  ring.

### Institutional Learnings
- Visual-audit gate (mandatory): the focus rings + focus-trap behaviour are
  browser-verified by keyboard (Tab/Shift-Tab/Escape), demo + a real record.
- Determinism + reduced-motion contracts (graph): the fixes are behaviour-only
  and must leave seeded positions byte-identical.

## Key Technical Decisions
- **Local focus-trap, no new dep.** A small `useFocusTrap(ref, { active, onClose,
  returnFocusTo })`-style hook (or inline in the sheet): on activate, record
  `document.activeElement`, focus the first focusable in the dialog; on Tab at the
  edges, wrap; on deactivate, restore focus to the recorded element. Keeps the
  Escape handler that already exists. SSR-safe (effects only).
- **Return target = the DOM trigger, captured at open.** Capture
  `document.activeElement` when the sheet transitions closed→open. For drill-down
  (content swap while staying open) the trap stays active and the original trigger
  remains the return target — we don't re-capture mid-open.
- **Fix drag-base by invalidation, not removal.** Preserve the interrupted-tween
  protection (strip `scale()` to recover the base) but make a drag refresh the
  cache: on drag end (or when the tick writes a drag position) **clear
  `data-base-transform`** so the next scrub re-reads the live, post-drag
  transform — which by then has no `scale()` (drag writes a plain
  `translate`). Alternative: write the new base on drag end. Pick whichever keeps
  the scale-strip path intact (verify with a drag-then-scrub manual test).
- **Reuse the existing ring token** (`focus-visible:outline … outline-button-focus`,
  offset-2) for both demo controls — visual parity with the close button / chips.

## Open Questions
- **Trap hook vs inline.** A reusable `useFocusTrap` is cleaner if any other modal
  exists; if the sheet is the only dialog, inline keeps it local. (Lean: small
  hook in `src/components/graph/` or `src/lib/` if reused; else inline.)
- **Initial focus target.** Close button (simplest, always present) vs the dialog
  container (`tabIndex=-1`) so the screen reader reads the title first. (Lean:
  container with `aria-label` already set → title is announced; then Tab to close.)
- **Drill-down focus.** After `onOpenNode` swaps content, should focus reset to
  the top of the new content? (Lean: move focus to the dialog container again so
  the new title is announced, keeping the original return target.)
- **Drag-base: clear-on-end vs clear-on-tick.** Clearing on `end` is simplest;
  clearing whenever the drag tick writes a transform is most robust if a scrub can
  start mid-drag (it can't today — drag cools the sim first). (Lean: clear on end.)

## Implementation Units
- [ ] **U1: Detail-sheet focus management (the BLOCKER).** Add initial focus,
  focus trap (Tab/Shift-Tab wrap), and focus return on close to
  `NodeDetailSheet`; keep Escape + scrim. Handle the drill-down content swap
  (R3). Manual keyboard verification on demo + authed (open → Tab cycle stays in
  sheet → Escape → focus returns to the node). Reduced-motion safe.
- [ ] **U2: Drag-base staleness fix.** Invalidate `data-base-transform` when a
  drag repositions a node so a later scrub doesn't teleport it; preserve the
  interrupted-tween scale-strip. Manual test: drag a node, scrub the timeline,
  node stays put. (No determinism change — seeded/no-drag path identical.)
- [ ] **U3: Control focus rings.** Add the standard `focus-visible` ring to the
  Play/Pause button and the as-of range slider in `demo-graph-section.tsx`.
  Keyboard-verify both show the ring; no behaviour change.

## System-Wide Impact
- U1 touches only the shared sheet → both surfaces inherit correct modal focus.
- U2 is contained to the canvas/drag seam; the seeded, drag-free render path
  (SSR / reduced-motion / tests) is unaffected, so determinism + parity hold.
- U3 is demo-only styling (the authed map controls, if any, are separate — note
  if they share the same gap and fold in if trivial).

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Focus trap fights `AnimatePresence` exit (focus restored before unmount) | Restore focus on close intent; verify no double-focus / lost return across the exit tween |
| Trap breaks the scrim/Escape close paths | Keep existing handlers; trap only governs Tab + initial/return focus |
| Drag-base fix re-introduces baked-in scale (the bug the cache prevented) | Preserve scale-strip; only invalidate after a drag; drag-then-scrub manual test |
| Control ring inconsistent with house style | Reuse the exact `outline-button-focus` token used elsewhere |
| Regressing determinism via canvas edits | Behaviour-only; assert seeded positions unchanged; visual audit |

## Sources & References
- Origin: `docs/plans/2026-06-17-003-…` (deferred close-out: sheet-focus BLOCKER,
  drag-teleport, control rings).
- Code: `src/components/graph/node-detail-sheet.tsx`, `graph-canvas.tsx`,
  `use-graph-state.ts`, `src/components/demo/demo-graph-section.tsx`,
  `src/app/globals.css`.
- A11y: WCAG 2.1.2 / 2.4.3 / 2.4.7 / 4.1.2 (dialog focus + visible focus).

## Future Considerations
- If more modals appear, promote the local trap to a shared `useFocusTrap`/
  `<Modal>` primitive. A focus-visible audit pass across all interactive surfaces
  could catch any other controls relying on the global reset without a re-added ring.
