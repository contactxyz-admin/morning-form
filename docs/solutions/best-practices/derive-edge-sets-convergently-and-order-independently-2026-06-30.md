---
title: "Derive relationship/edge sets convergently and order-independently — append-only and caller-ordered both corrupt"
date: 2026-06-30
category: docs/solutions/best-practices
module: graph/temporal-succeeds / markers/panel-diff
problem_type: derived_state_drift
component: derived_graph_edges
severity: high
applies_when:
  - "You write derived edges/links computed from a set of records that can grow or arrive out of order (backdated uploads, late events)"
  - "A reader will walk those edges as a chain/sequence and a stray edge changes the traversal"
  - "A direction-sensitive comparison takes two caller-supplied endpoints (from/to, before/after)"
tags:
  - idempotency
  - convergence
  - derived-edges
  - temporal-graph
  - out-of-order
  - reconcile
  - direction-sensitive
---

# Derive relationship/edge sets convergently and order-independently

## Context

Two distinct bugs from the same root mindset — *trusting the order/append-only-ness of inputs when deriving structure* — surfaced in the longitudinal-trajectory work (plan 2026-06-30-001) and were caught in review before shipping.

**(A) Append-only edge linker leaves stale "skip" edges.** The first cut of `linkTemporalSucceedsForUser` linked each marker's consecutive observations (earlier → later) by **adding** the missing edges. Idempotent for a re-run on the same data — but *not convergent* under out-of-order input. Upload panels Jan(A) then Mar(B) → `A→B`. Later upload a **backdated** Feb(C) panel → the linker adds `A→C` and `C→B` but never removes the now-wrong `A→B`. The graph ends up with `A→B`, `A→C`, `C→B` — a successor-walk can traverse `A→B` and skip C, corrupting the trajectory order.

**(B) Direction-sensitive diff trusts caller-supplied endpoint order.** `diffPanels(from, to)` classified each marker via `classifyChange(before, after, …)` assuming `from` was the earlier panel. A caller (or a curious API hit) passing the ids reverse-chronologically (`from`=newer, `to`=older) inverted **every** classification — a marker that genuinely improved was reported as worsened, with chronologically backwards dates.

## Guidance

**(A) Reconcile to the desired set; don't only append.** For each owning entity, compute the exact set of derived edges its current records imply, then **add the missing and delete the stale** in one pass. This makes the writer *convergent* (re-runs and out-of-order arrivals both settle to the correct set), not merely idempotent — and as a bonus it removes the per-item existence probe (you already hold the existing set), killing an N+1.

```ts
const desired = orderObservationPairs(observations);                       // earlier → later
const desiredKeys = new Set(desired.map(p => `${p.fromNodeId} ${p.toNodeId}`));
const existing = await db.graphEdge.findMany({                             // scoped to THIS entity's instances
  where: { userId, type: 'TEMPORAL_SUCCEEDS', fromNodeId: { in: ids }, toNodeId: { in: ids } },
  select: { id: true, fromNodeId: true, toNodeId: true },
});
const existingKeys = new Set(existing.map(e => `${e.fromNodeId} ${e.toNodeId}`));
// prune stale (present but no longer consecutive — the backdated-insert skip-edge)
const stale = existing.filter(e => !desiredKeys.has(`${e.fromNodeId} ${e.toNodeId}`)).map(e => e.id);
if (stale.length) await db.graphEdge.deleteMany({ where: { userId, id: { in: stale } } });
// add only the genuinely-missing pairs
for (const p of desired) if (!existingKeys.has(`${p.fromNodeId} ${p.toNodeId}`)) await addEdge(db, userId, { type: 'TEMPORAL_SUCCEEDS', ...p });
```
Scope the existing-edge query to the owning entity's own instances so you never prune another entity's chain.

**(B) Normalize endpoint order inside the differ — don't trust the caller.** A direction-sensitive comparison should derive chronology from the data, not from which argument was labelled `from`:

```ts
// earlier = baseline, later = comparison — regardless of which the caller passed as from/to.
const [earlier, later] = a.capturedAt.getTime() <= b.capturedAt.getTime() ? [a, b] : [b, a];
return { previousPanelAt: earlier.capturedAt.toISOString(), latestPanelAt: later.capturedAt.toISOString(),
         changes: buildChanges(laterReadings, earlierReadings) };
```
Now `diffPanels(newer, older)` and `diffPanels(older, newer)` return the same correctly-signed result.

## Why This Matters

"Idempotent" is the weaker guarantee people reach for and stop at: *re-running on the same input doesn't double-write*. The property you actually need for derived structure over **mutable or unordered** inputs is **convergence**: whatever the arrival order, the output equals the function of the current input set. Append-only writers satisfy idempotency but not convergence — and the gap is exactly the cases that bite in production (backdated lab uploads, late-arriving events, manual corrections). Likewise, a direction-sensitive function that trusts argument order is correct only for the disciplined caller; one careless call inverts the meaning. Both classes vanish if you (a) reconcile against the desired set and (b) derive order from the data.

There were no live readers of these edges yet, so neither bug had user impact — but both would have been latent landmines for the first consumer. Catching them at write time is far cheaper than debugging a corrupted traversal later.

## When to Apply

- Any writer that materializes derived edges/links/rows from a set that can **grow, shrink, or arrive out of order** — link tables, "next/prev" chains, dedup clusters, denormalized rollups.
- Any **direction-sensitive** comparison taking two caller-chosen endpoints (`from`/`to`, `before`/`after`, `base`/`head`): normalize internally.
- Prefer "compute desired set → diff against existing → add missing + delete stale" over "append if not exists" whenever the source set is not strictly append-only.

## Examples

- `src/lib/markers/temporal-succeeds.ts` — `reconcileConceptChain` prunes stale `TEMPORAL_SUCCEEDS` edges and adds missing ones per biomarker; documented as "convergent", with an out-of-order backfill test that asserts the stale skip-edge is removed.
- `src/lib/markers/panel-diff.ts` — `diffPanels` orders the two documents by `capturedAt` before diffing; a test passes the ids reversed and asserts the classification does **not** invert.

## Related

- `docs/solutions/best-practices/derive-display-state-from-source-never-author-it-2026-06-16.md` — the broader "derive, don't author/duplicate" family; this note is the *write-side set* dimension of it.
