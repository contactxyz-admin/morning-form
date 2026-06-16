---
title: "Derive display state from source — never author it alongside the data it represents"
date: 2026-06-16
category: docs/solutions/best-practices
module: demo/record graph / biomarker change-ring / classifier
problem_type: data_integrity_gap
component: derived_ui_state
severity: high
applies_when:
  - "A UI element shows a computed signal (ring, badge, label, status, delta) that has a calculable source of truth in the underlying data"
  - "Fixture / seed / demo data is hand-authored instead of run through the same deriver the production path uses"
  - "A display field and the source it summarizes coexist in one structure and can silently diverge"
  - "A shared classifier is trapped in a server/ORM-coupled module and can't be bundled where the derivation is needed"
tags:
  - derived-state
  - single-source-of-truth
  - demo-fixtures
  - classifier
  - data-integrity
  - anti-regression
  - client-bundle
---

# Derive display state from source — never author it alongside the data it represents

## Context

On the public `/demo/record` health graph, each biomarker node showed a coloured **change ring** (improved / worsened / stable / new) — the most authoritative signal on the canvas. The ring was **hand-authored** as a `change` field on the fixture node, stored *next to* the recorded values and the source chunks it claimed to be grounded in. The two drifted, badly:

- A **red "worsened" ring on LDL** whose own cited lab chunk said it *improved* (3.6 → 2.9 mmol/L). A red alarm on an improving marker.
- "Free testosterone" labelled **`new`** with a fabricated value (`19.5`) that matched no source (the lab said 9.5 → 11.8).
- A **unit mismatch** (`µg/L` on the ring vs the cited `ng/mL`).

The product's entire thesis — *"every node is grounded in a record you could cite"* — was being contradicted by its own headline visual. In a clinical product that is a patient-safety pattern, not a cosmetic bug. A CMO review caught it; the visual audit confirmed it.

The root issue was not the specific wrong values. It was that the data model **allowed** a hand-set display value to exist independently of the source — so consistency had to be *policed* (by review, by tests, by discipline), and policing leaks.

## Guidance

**When a UI shows a computed signal that has a source of truth, derive it — and delete the field that lets you author it.** Make the contradiction *structurally impossible*, not a thing to remember to check.

**1. Replace the authored display field with the raw source.** The node carries only the recorded readings (values, units, dates, reference ranges) that match its cited chunks. There is no longer a place to type a tone.

```ts
// prisma/fixtures/demo-navigable-record.ts
export interface DemoNode {
  nodeKey: string;
  canonicalKey: string;
  displayName: string;
  // change?: NodeChangeWire;   ← DELETED: nowhere to author a divergent tone
  readings?: DemoReading[];     // value / unit / at / referenceLow / referenceHigh
}

// prisma/fixtures/synthetic/graph-narrative.ts — BEFORE (authored, contradicts the cited lab)
{ nodeKey: 'bm-ldl', /* … */,
  change: { direction: 'up', classification: 'worsened', beforeValue: 3.1, afterValue: 3.6, unit: 'mmol/L' } }

// AFTER (recorded readings only — the cited chunk says exactly these numbers)
{ nodeKey: 'bm-ldl', /* … */,
  readings: [
    { value: 2.7, unit: 'mmol/L', at: T_BASELINE, referenceLow: null, referenceHigh: 3.0 },
    { value: 3.4, unit: 'mmol/L', at: T_RECHECK,  referenceLow: null, referenceHigh: 3.0 },
  ] }
```

**2. Derive at adapt/render time, through the *same* function the production path uses.** Don't re-implement the rule per surface, or the surfaces will disagree.

```ts
// src/lib/demo/graph-adapter.ts — nodeToWire
const change = deriveChange(node.readings);   // computed; never passed through
return { /* … */, ...(change ? { change } : {}) };
```

**3. Watch the bundle boundary when you share the deriver.** The classifier lived in `panel-diff.ts`, which transitively imports Prisma (and `node:crypto`). Importing it into the **client** demo bundle failed the build with `UnhandledSchemeError: node:crypto`. The fix was to extract the *pure* function into its own dependency-free module and re-export it for back-compat:

```ts
// src/lib/markers/classify-change.ts  ← NEW: pure, zero server/Prisma deps
export function classifyChange(before, after, low, high):
  { direction: ChangeDirection; classification: ChangeClassification } { /* range-relative */ }

// src/lib/markers/panel-diff.ts (Prisma-coupled, authed path) now imports + RE-EXPORTS it
export { classifyChange, distanceToRange };
export type { ChangeDirection, ChangeClassification };
```

Now the authed `/record` route and the client demo classify through the identical function — they cannot disagree.

**4. Add an anti-regression test that the derived state can't contradict its source.** This is the guardrail that replaces "remember to keep them in sync".

```ts
// src/lib/demo/graph-adapter.test.ts
it('NEVER contradicts the source: direction + values match the readings', () => {
  for (const node of METABOLIC_PERSONA_GRAPH.nodes) {
    if (!node.readings?.length) continue;
    const change = adapted.graph.nodes.find((n) => n.id === node.nodeKey)!.change!;
    const sorted = [...node.readings].sort((a, b) => a.at.localeCompare(b.at));
    const after = sorted.at(-1)!, before = sorted.at(-2);
    expect(change.afterValue).toBe(after.value);            // value is the recorded value
    if (before) {
      const expected = after.value > before.value ? 'up' : after.value < before.value ? 'down' : 'flat';
      expect(change.direction).toBe(expected);              // a red ring on an ↑-that-improved is impossible
    }
  }
});
```

**5. Pin fixture values against the cited text.** A separate integrity test caught a residual drift the anti-regression guard could not — an HbA1c source chunk narrated *"down from 6.1"* while the readings were 5.9 → 5.7:

```ts
// prisma/fixtures/synthetic/metabolic-persona.test.ts
const PINNED = { 'bm-ldl': [2.7, 3.4], 'bm-hba1c': [5.9, 5.7], 'bm-ferritin': [42, 68], 'bm-apob': [0.98] };
// for each: node.readings values === PINNED, AND each value string appears in some source chunk text
```

## Why This Matters

A contradiction between a headline signal and its *own* cited evidence destroys trust instantly — and in a clinical or safety context it is a defect class, not a polish item (a red alarm on an improving marker). Crucially, **policing consistency via code review or test coverage is permanently leaky**: a developer under deadline hand-sets the ring to match a UI mock without touching the readings, or edits the readings and forgets the ring. Removing the field that allows the divergence eliminates the entire bug class *by construction*. After this change, the only way to get a red ring is for the recorded readings to actually rise.

The shared-deriver discipline (step 2) extends the guarantee across surfaces: demo and production classify identically because they call the same pure function — there is no second implementation to drift.

## When to Apply

- Any UI that renders a **computed signal** (badge, ring, status dot, severity chip, delta/trend label) for which a source of truth exists in the data.
- **Demo / fixture / seed data that mirrors a real derived pipeline** — the fixture must carry the *inputs* and run the real deriver, never a hand-set copy of the expected output.
- Whenever you're tempted to add a "convenience" display field (`change`, `status`, `badge`, `severity`, `direction`, `label`) as a *sibling* to the data it summarizes — that sibling is the bug waiting to happen; delete it and derive.
- When sharing the deriver across a **server/client boundary**: extract the pure function out of any ORM/`node:`-coupled module first, or the client bundle breaks.

## Examples

- **The fix in one line:** the node went from carrying a hand-typed `change: { classification: 'worsened', … }` to carrying only `readings: [...]`; the ring is computed from them. There is no longer a field in which to lie.
- **The shared classifier:** `src/lib/markers/classify-change.ts` (pure) is imported by both `src/lib/demo/derive-change.ts` (demo) and re-exported through `src/lib/markers/panel-diff.ts` (authed `/record`). One rule, two surfaces, zero drift.

## Related

- [`docs/solutions/best-practices/filter-derived-nodes-at-the-query-layer-not-only-the-aggregator-2026-06-10.md`](filter-derived-nodes-at-the-query-layer-not-only-the-aggregator-2026-06-10.md) — adjacent "derive, don't duplicate" principle on a different axis (filter *altitude* in the read pipeline). Shares the extract-a-pure-module-so-consumers-can-share-it pattern.
- [`docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md`](../runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md) — the pure-module-extraction-for-bundleability dimension (why server-coupled logic can't be shared with the client as-is).
- [`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`](visual-audit-non-optional-ui-gate-2026-05-16.md) — the visual audit is *how* this drift was detected; this doc is *how* to make the drift impossible to author in the first place.
