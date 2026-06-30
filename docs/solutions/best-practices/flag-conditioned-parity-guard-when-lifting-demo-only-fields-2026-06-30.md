---
title: "Lifting a demo-only field to the authed path: make the parity guard flag-conditioned, don't delete it"
date: 2026-06-30
category: docs/solutions/best-practices
module: api/record / graph wire shape / longitudinal flag
problem_type: test_guard_evolution
component: api_surface_parity
severity: medium
applies_when:
  - "A field was previously emitted ONLY by the demo/fixture adapter and a test asserts the authed/prod path never emits it"
  - "You're now intentionally emitting that field on the authed path, behind a feature flag"
  - "Flag-off must remain byte-for-byte the pre-feature response shape"
tags:
  - feature-flags
  - api-parity
  - prod-parity-guard
  - test-evolution
  - byte-for-byte
  - demo-vs-authed
---

# Lifting a demo-only field to the authed path: make the parity guard flag-conditioned

## Context

The graph wire node (`GraphNodeWire`) had several fields the **demo adapter** set but the **authed `/api/record`** route never did — `firstSeenAt`, `evidenceGrade`, `interpretation`. A prod-parity test pinned that invariant:

```ts
// the authed route must never emit demo-only fields
expect(body.nodes[0]).not.toHaveProperty('firstSeenAt');
expect(body.nodes[0]).not.toHaveProperty('evidenceGrade');
expect(body.nodes[0]).not.toHaveProperty('interpretation');
```

Phase 2 (longitudinal plan 2026-06-30-001 U8) intentionally started emitting `interpretation` on the authed graph — **but only behind `LONGITUDINAL_GRAPH_ENABLED`, and only for CMO-authored markers that moved**. The naive moves are both wrong: *deleting* the assertion abandons the guarantee that flag-off is unchanged; *leaving it* makes the test a lie the moment the flag is on.

## Guidance

**Evolve the guard from "never emits X" to "flag-off → absent, flag-on → present". Keep BOTH halves machine-checked.** The flag-off assertion is the load-bearing one — it's what protects the byte-for-byte pre-feature contract; the flag-on assertion documents and locks the new behaviour.

```ts
// flag OFF (the existing test's env default): the field is STILL absent.
// firstSeenAt / evidenceGrade stay demo-only; interpretation is gated.
expect(body.nodes[0]).not.toHaveProperty('firstSeenAt');
expect(body.nodes[0]).not.toHaveProperty('interpretation');   // ← still guaranteed off

// flag ON (dedicated test): the field IS present for an eligible node…
envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
expect(body.nodes[0]).toHaveProperty('interpretation');

// …and NOT present for an ineligible one (the gate is real, not blanket).
// an unauthored marker gets `change` but no `interpretation`:
expect(body.nodes[0]).toHaveProperty('change');
expect(body.nodes[0]).not.toHaveProperty('interpretation');
```

Three assertions, three distinct guarantees: flag-off parity, flag-on enablement, and the *gate within* the flag-on path. Update the comment on the guard to say **why** the field is now conditionally emitted (cite the plan), so the next reader doesn't "fix" it back.

Keep the actual emission gated by the same condition the rest of the feature uses — here, inside the `if (diff && diff.previousPanelAt)` block that only runs when the flag is on — so "flag-off emits nothing new" is true *by construction*, not by a second code path that can drift.

## Why This Matters

A "never emits X" parity test is exactly the kind of guard that gets **deleted** when it starts failing during a legitimate feature — taking the byte-for-byte guarantee with it. Converting it to flag-conditioned preserves the original protection (flag-off users see no change at all, which is what lets you merge the code long before the launch/DPIA/advisor gate flips the flag) while turning the test into living documentation of the new conditional contract. The "ineligible node still has no field" assertion is what stops a blanket emission from sneaking in under cover of the flag.

## When to Apply

- Any time you start populating, on the authed/prod path, a field that was previously demo/fixture-only and is asserted-absent by a parity test.
- Any flag-gated surface where "flag-off == current behaviour" is a hard requirement (regulatory, billing, contract): assert the flag-off shape explicitly, not just the flag-on one.
- When the flag-on path has its *own* eligibility gate (authored-only, premium-only, cohort-only): add the "eligible → present, ineligible → absent" pair so the gate can't silently widen.

## Examples

- `src/app/api/record/route.test.ts` — the flag-off parity block kept `interpretation` asserted-absent; two new flag-on tests assert it present for an authored changed marker and absent for an unauthored one.
- Emission stayed inside the existing flag-gated diff block in `src/app/api/record/route.ts` (`applyInterpretationsToWireNodes(index.nodes, diff.changes)` next to `applyChangesToWireNodes`), so no separate flag-off code path exists to drift.

## Related

- `docs/solutions/best-practices/derive-display-state-from-source-never-author-it-2026-06-16.md` — same `interpretation`/`change` wire fields, the demo-vs-authed derivation boundary they live on.
