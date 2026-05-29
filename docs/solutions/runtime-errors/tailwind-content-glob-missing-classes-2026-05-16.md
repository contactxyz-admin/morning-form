---
title: "Tailwind JIT silently drops classes when their string literals live outside the content glob"
date: 2026-05-16
category: docs/solutions/runtime-errors
module: graph canvas / tailwind bundling
problem_type: silent_visual_failure
component: styling
symptoms:
  - "Every <circle> on the graph canvas renders fill: rgb(0,0,0); stroke: none"
  - "Edges render stroke: none — entire encoding is invisible"
  - "DOM has the correct class names but no matching CSS rule in the bundle"
  - "next build succeeds; pnpm dev passes; type-check passes"
  - "Affects both /demo/record AND authed /record?mode=map — same root cause"
root_cause: incomplete_setup
resolution_type: config_change
severity: high
tags:
  - tailwind
  - tailwind-jit
  - content-glob
  - svg
  - graph-canvas
  - silent-failure
---

# Tailwind JIT silently drops classes when their string literals live outside the content glob

## Problem

The graph canvas's visual encoding maps `NodeType` and `EdgeType` to Tailwind fill/stroke classes via a const lookup table:

```ts
// src/lib/graph/visual-encoding.ts
const NODE_VISUAL_BY_CLASS = {
  clinical:     { fillClass: 'fill-alert/15',         strokeClass: 'stroke-alert/70' },
  biomarker:    { fillClass: 'fill-accent/20',        strokeClass: 'stroke-accent' },
  intervention: { fillClass: 'fill-positive/15',      strokeClass: 'stroke-positive/80' },
  data:         { fillClass: 'fill-text-tertiary/10', strokeClass: 'stroke-text-tertiary/60' },
};
```

`GraphCanvas` applies these classes to `<circle>` and `<line>` SVG elements. The DOM has the right `class="..."` values. But every circle renders `fill: rgb(0,0,0); stroke: none` and every edge renders `stroke: none`. The graph reads as a constellation of black dots with no connectivity.

Caught only by a visual audit. CI, `next build`, lint, and type-check all pass.

## Symptoms

- Inspect a `<circle>` in DevTools. The `class` attribute shows `fill-alert/15 stroke-alert/70`. The Computed pane shows `fill: rgb(0,0,0)`.
- Grep the dev CSS bundle for the class:
  ```bash
  curl -s http://localhost:3000/_next/static/css/.../app/layout.css | grep 'fill-alert'
  # Returns nothing — the class isn't in the bundle.
  ```
- The visible failure mode is "the canvas is uniformly black and edgeless." Easy to misread as a D3 layout bug or a CSS specificity issue.

## What Didn't Work

- **Refreshing the dev server.** This isn't a stale-cache problem; the JIT genuinely never extracted the class.
- **Importing the class strings from a component** (`import { NODE_VISUAL_BY_CLASS } from '@/lib/graph/visual-encoding'`). The strings travel into the component, but Tailwind's content scan looks at file *contents*, not import graph. The string literal still lives in the original (unscanned) file.
- **Tightening the strokeWidth or fill opacity** (looking for a different bug). The bug is binary — the rule isn't in the bundle at all.

## Solution

Tailwind v3 JIT only generates CSS rules for class strings it can extract from files matched by the `content[]` glob in `tailwind.config.ts`. If the strings live in a file outside the glob, JIT can't see them and the rules never make it into the bundle.

Two fixes — apply both as belt-and-braces:

```ts
// tailwind.config.ts
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // The graph canvas's visual encoding stores its fill/stroke classes
    // as string literals in src/lib/graph/visual-encoding.ts so the
    // encoding is a single source of truth. Without scanning src/lib/,
    // JIT silently drops these classes from the bundle.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',  // ← extend glob
  ],
  // Even with the glob, name the specific classes explicitly. Survives
  // any future content-glob refactor.
  safelist: [
    'fill-alert/15', 'fill-accent/20', 'fill-positive/15', 'fill-text-tertiary/10',
    'stroke-alert/70', 'stroke-accent', 'stroke-positive/80', 'stroke-text-tertiary/60',
    'stroke-text-tertiary/50', 'stroke-text-secondary/70', 'stroke-alert/60',
  ],
  // ...
};
```

Restart the dev server (tailwind config isn't HMR-tracked). Re-grep the CSS bundle to verify the classes are now present.

## Why This Works

Tailwind v3 JIT does static analysis on the files matched by `content[]` — it tokenises each file, looks for strings that match its class-name grammar, and generates CSS only for those strings. Two channels feed into the JIT's known-classes set:

1. **Extracted classes** from scanned files (the `content[]` glob)
2. **Safelist** entries (the explicit `safelist[]` array)

Anything not in either channel produces zero CSS. The `class` attribute on the DOM is just a string at runtime; the browser looks up matching rules in the bundle, finds none, and applies the default (`fill: black; stroke: none` for SVG).

## Prevention

1. **Encoding-as-data patterns need explicit visibility.** If you're storing class strings in a TS module (status → colour, role → variant, enum → utility class), put that module in a file the content glob already scans, OR add a safelist for the classes, OR inline the strings in a component file as a redundant signal.

2. **CSS-bundle grep is the diagnostic.** After a build/dev compile:
   ```bash
   grep -E 'fill-(alert|accent|positive)/[0-9]+' .next/static/css/**/*.css
   ```
   If a class you expect isn't present, the content glob is the first place to check.

3. **The DOM check is misleading.** DevTools shows `class="fill-alert/15"` exactly as written. The bug isn't in the class string, it's in the CSS bundle. Always cross-check the Computed pane against the class attribute when SVG fills look wrong.

4. **Visual symptoms to recognise:**
   - All same-type elements render identical "default" appearance (black fills, no strokes)
   - DevTools shows expected class names
   - Other Tailwind utilities on the same element work fine (e.g., `rounded-card border` work; only the dynamic-via-encoding classes fail)

5. **Affects production parity.** This is a build-time concern, not runtime. `next build` produces the same broken bundle whether locally or on Vercel. Visual verification (real browser, real route) is the only catch.

## Related Issues

- This is the silent cousin of [Vercel-readfilesync-enoent-bundling-2026-05-15](./vercel-readfilesync-enoent-bundling-2026-05-15.md): both are "the bundler can't see what your code is going to use at runtime, so it doesn't ship it." Different bundlers (Tailwind JIT vs Next.js file tracer), same shape of bug.
- In this repo: fixed in PR #128's second commit (`a7153fa`). Also dispatched as a learning to the `/ce:work` workflow: visual audit is non-optional for UI changes (see `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`).
- A future improvement: a pre-commit / pre-build check that diffs declared encoding classes against the CSS bundle. Would catch this class of bug at CI time rather than visually.
