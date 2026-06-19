---
title: "Modal focus management for SVG/canvas triggers — capture SVGElement, and win the cross-component blur race"
date: 2026-06-19
category: docs/solutions/best-practices
module: graph/node-detail-sheet · graph/graph-canvas
problem_type: silent_a11y_regression
component: dialog_focus_management
severity: high
applies_when:
  - "A role=dialog / aria-modal opens from an SVG, canvas, or MathML element (a graph node <g>, a chart datapoint, a map pin)"
  - "Focus management captures the trigger via `document.activeElement instanceof HTMLElement`"
  - "A modal's focus-restore-on-close competes with another component's focus/blur effect firing on the same state change"
  - "A programmatic .focus() needs to be the last write to document.activeElement but effect ordering across sibling components is relied on implicitly"
tags:
  - accessibility
  - focus-management
  - dialog
  - svg
  - react-effects
  - effect-ordering
  - wcag
  - silent-regression
---

# Modal focus management for SVG/canvas triggers — capture `SVGElement`, and win the cross-component blur race

## Context

`NodeDetailSheet` is a `role="dialog" aria-modal="true"` panel opened by clicking a node on the force-directed graph. The node is an **SVG `<g>`** element. We added the standard modal focus contract (WCAG 2.1.2 / 2.4.3 / 4.1.2): trap Tab inside the dialog, take focus on open, **return focus to the trigger on close**. Two defects — both *silent* (no crash, no console error, the feature looked done) — survived implementation and were only caught by a multi-agent review:

**1. The trigger was never captured.** The return-target was stored like this:

```ts
returnFocusRef.current =
  document.activeElement instanceof HTMLElement ? document.activeElement : null;
```

A graph node is an `SVGGElement`, which is an **`SVGElement`, not an `HTMLElement`**. So `instanceof HTMLElement` is `false`, `returnFocusRef` is always `null`, and focus-return is a complete no-op **for the exact case it exists to handle** (a sheet opened from the canvas). It would have "worked" only in a test that opened the sheet from an HTML button — i.e. never in production.

**2. A sibling component blurred the node we'd just refocused.** `GraphCanvas` has a `blur-on-deselect` effect that runs on the same close:

```ts
// graph-canvas.tsx — fires when selectedNodeId clears (same moment the sheet closes)
if (el.hasAttribute('data-selected') && el === document.activeElement && !el.matches(':focus-visible')) {
  el.blur(); // strip the click-focus artifact so no stale "blue box" lingers
}
```

On close, *both* the sheet's focus-restore and the canvas's blur fire in the same React commit. React gives **no ordering guarantee between effects in sibling subtrees**. If the sheet's restore runs first, it focuses the `<g>`; the canvas effect then sees that `<g>` as `document.activeElement`, and — because a **programmatic `.focus()` does not satisfy `:focus-visible`** — its "preserve keyboard focus" guard (`!el.matches(':focus-visible')`) is `false`, so it blurs the node. Focus falls to `<body>`. The very WCAG behaviour we added is defeated, intermittently, by a component that thinks it's helping.

## Guidance

**1. Capture `HTMLElement | SVGElement` (anything with `.focus()`), never just `HTMLElement`.** The trigger of a canvas/chart/map modal is not an HTML element. Both interfaces implement `focus()` via the `HTMLOrSVGElement` mixin.

```ts
const returnFocusRef = useRef<HTMLElement | SVGElement | null>(null);
// …
const active = document.activeElement;
returnFocusRef.current =
  active instanceof HTMLElement || active instanceof SVGElement ? active : null;
```

**2. Defer the focus-restore to `requestAnimationFrame` so it is the *last* write to `document.activeElement`.** A rAF callback runs after the whole commit's synchronous effects (including the sibling's blur), so you stop depending on effect order — you simply run last. Guard `isConnected` so you never focus a detached node.

```ts
if (!isOpen && wasOpenRef.current) {
  const target = returnFocusRef.current;
  returnFocusRef.current = null;
  requestAnimationFrame(() => {
    if (target && target.isConnected) target.focus?.();
  });
}
```

**3. Capture the trigger once on the closed→open transition — not on every render.** A drill-down that swaps the dialog's *content* (here: a grounded-marker → its own node) must keep the *original* trigger as the return target. A `wasOpenRef` boolean distinguishes "opened" from "content changed while open".

```ts
const isOpen = node !== null;
if (isOpen && !wasOpenRef.current) { /* capture trigger */ }
if (!isOpen && wasOpenRef.current) { /* restore (deferred) */ }
wasOpenRef.current = isOpen;
```

**4. Suspect any sibling that mutates focus on the same signal.** The canvas's `blur()` was correct in isolation (kill a click-focus artifact) and wrong in composition. When two components both react to one piece of state (`selectedNodeId` / the open node) and both touch `document.activeElement`, decide explicitly who writes last. rAF (step 2) is the cheap, robust answer; a shared focus owner is the heavy one.

## Why This Matters

Focus bugs are **invisible to everyone who uses a mouse** — including the author, the reviewer skimming the diff, and every automated check that isn't a real keyboard run. `tsc` is happy (`SVGElement` is a perfectly good `EventTarget`), ESLint is happy, the unit suite (node env, no DOM) can't exercise it, and the panel animates open and shut beautifully. The only way to catch it is to (a) know `SVGElement ≠ HTMLElement`, and (b) reason about cross-component effect ordering — neither of which the green checkmarks tell you. This is why the focus contract belongs on a **keyboard-audit gate**, and why "it type-checks and renders" is not evidence that a11y works.

The deeper, transferable lesson: **a narrowing `instanceof` is a silent filter.** `instanceof HTMLElement` didn't error on an SVG node — it quietly returned `null` and the feature degraded to nothing. Whenever an `instanceof`/type-guard sits on the path of a feature's *primary* input, ask what it silently drops.

## When to Apply

- Any **modal, popover, sheet, or menu opened from a non-HTML element**: an SVG graph node, a `<canvas>`-hit-tested datapoint, a chart segment, a map marker, a MathML token. Capture `HTMLElement | SVGElement`.
- Any **focus-restore-on-close** in a tree where another component independently manages focus/selection on the same state — defer the restore (rAF) so you own the last write.
- Any **`instanceof`/type-narrow on the critical path** of a feature: confirm the real runtime type of the value it gates; a false branch is silent.
- Reviewing focus/a11y code where the only evidence offered is "type-checks + renders": route it to a keyboard pass instead.

## Examples

- **The one-line bug:** `instanceof HTMLElement` on an SVG `<g>` → `returnFocusRef` permanently `null` → focus-return a no-op for every canvas-opened sheet. Fix: `|| active instanceof SVGElement`.
- **The race:** sheet `focus()` vs canvas `blur()` on the same close, no ordering guarantee, programmatic focus ≠ `:focus-visible` so the canvas's keyboard-preservation guard doesn't save it. Fix: `requestAnimationFrame` the restore so it lands after the canvas's synchronous effect.

## Related

- [`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`](visual-audit-non-optional-ui-gate-2026-05-16.md) — the sibling discipline: canvas-visual and interaction correctness need a human gate because the automated checks are blind to them. Focus management is the keyboard analogue of the visual audit.
