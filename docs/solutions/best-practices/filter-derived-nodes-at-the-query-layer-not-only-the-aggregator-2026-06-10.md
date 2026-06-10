---
title: "Filter derived-node noise at the query layer, not just the aggregator — most consumers don't go through the aggregator"
date: 2026-06-10
category: docs/solutions/best-practices
module: graph layer / read pipeline
problem_type: filter_applied_at_wrong_altitude
component: graph-queries
symptoms:
  - "Plan filters new node category at one consumer (e.g. `/api/record`); all OTHER consumers (topic compile, scribe tools, MCP) still get the unfiltered set"
  - "Tests pass for the named consumer; LLM prompts and other downstream layers silently bloat with noise"
  - "Defect not visible to canvas or list UIs because they DO go through the aggregator — only discoverable by enumerating every consumer"
root_cause: filter_added_at_aggregation_not_at_query_layer
resolution_type: structural_change
severity: high
tags:
  - graph-layer
  - read-pipeline
  - altitude
  - llm-prompt-budget
  - code-review
---

# Filter derived-node noise at the query layer, not just the aggregator — most consumers don't go through the aggregator

## Problem

When a feature introduces a new node category that exists in the data but should be hidden from human/LLM consumers (history points behind a concept, derived/computed nodes, low-confidence drafts), the obvious place to filter is the *aggregator* that builds the user-facing payload — `aggregateRecord` for `/api/record`, in this codebase. That fix is necessary but rarely sufficient: in a graph backend with multiple read consumers, **most consumers don't go through the aggregator**. They call the query layer (`getSubgraphForTopic`, `getFullGraphForUser`, raw `prisma.graphNode.findMany`) directly. Each of those layers sees the unfiltered set unless the filter is pushed down with the data.

The longitudinal graph PR shipped this shape. Unit U6 ("canvas noise control") filtered lab-reading instance nodes — `observation` nodes that are `INSTANCE_OF` a `biomarker` — out of `aggregateRecord` so the D3 canvas and the 200-node cap stayed clean. The unit had a test; the test passed. The filter lived in `src/lib/record/aggregate.ts`.

But the BFS in `src/lib/graph/queries.ts::getSubgraphForTopic` expands seed nodes via every non-`SUPPORTS` edge with no node-type filter on expanded nodes. `INSTANCE_OF` IS a non-`SUPPORTS` edge. So a topic seeded on biomarkers (iron, sleep, etc.) at any depth ≥ 1 silently pulled every dated observation instance of every seeded marker into the subgraph — which the topic-compile prompt and `search_graph_nodes` scribe tool then ship to the LLM verbatim.

Quantified: a user with six quarterly panels and twenty markers has ~120 instance nodes. The iron topic seeds three markers (ferritin, iron, tibc); at depth 1 the subgraph grows to ~3 concepts + ~24 instances. Every topic compile prompt and every scribe search includes them — token cost grows linearly with the user's upload history, with no cap mitigating because the canvas cap is downstream.

Code-review Angle C surfaced this. A verifier confirmed it as actually reachable in the prompt path (not just theoretical).

The fix moves the predicate one altitude up: a pure helper `computeLabInstanceNodeIds(nodes, edges)` lives in its own module `src/lib/graph/lab-instances.ts`, and both `getSubgraphForTopic` and `aggregateRecord` import it. Now the BFS drops instance nodes (and their dangling edges) after expansion, before the subgraph returns — every consumer of the query layer inherits the filter.

## Symptoms

- A "filter X from the user-facing payload" unit lands with a test against one consumer (the API route).
- The same data exists in other consumers — topic-compile prompts, scribe tools, MCP read APIs, account export — and is unfiltered there.
- LLM token consumption silently grows with user data size.
- Tests pass; the regression is visible only by enumerating every read path or by reading actual production prompts.

## Solution

When a node category is conceptually "data that should be invisible to concept-level reads", filter it **at the query layer**, not at one aggregator. The query layer is shared; the aggregator is per-surface.

The minimal-surface shape:

1. Extract the predicate as a pure function in its own module, in the graph layer:
   ```ts
   // src/lib/graph/lab-instances.ts
   export function computeLabInstanceNodeIds(
     nodes: ReadonlyArray<{ id: string; type: string }>,
     edges: ReadonlyArray<{ type: string; fromNodeId: string; toNodeId: string }>,
   ): Set<string> {
     // ...
   }
   ```
2. Apply it inside the query function (`getSubgraphForTopic`) after expansion, before the return — and drop dangling edges so callers don't see edges-to-nothing.
3. Apply the SAME helper inside the aggregator, so canvas + topic compile + scribe search agree on what counts as a "concept node".
4. Don't put the helper in the same module as the query functions that route tests mock — see "What Didn't Work".

## What Didn't Work

- **Filtering only at `aggregateRecord`.** That's what U6 shipped; it covered the canvas but missed every other read consumer. Necessary but not sufficient.
- **Putting the shared helper inside `src/lib/graph/queries.ts`.** First attempt at the fix lived there. Route tests that mock `@/lib/graph/queries` (e.g. `src/app/api/record/route.test.ts`) now needed to also mock the new export, and four tests failed with "No `computeLabInstanceNodeIds` export is defined on the mock." Symptom: a pure helper accidentally inherited the mocking story of the DB layer it was hosted in. Fix: hoist to its own pure module (`lab-instances.ts`). Module boundaries follow concerns; pure predicates don't belong inside mocked DB-layer modules.
- **Filtering at the LLM-prompt builder.** Every consumer (topic compile, scribe search, MCP) would need the same opt-in. Higher altitude — at the query layer — covers all of them once.
- **A `promoted: false` filter at the query layer.** `promoted` exists and instances are written with `promoted: false`, but vital-sign `observation` nodes (T4) are legitimately `promoted: true` and concept-level — and standalone `observation` nodes (not `INSTANCE_OF` a biomarker) must still surface. The predicate has to be "observation AND INSTANCE_OF biomarker", not "any non-promoted node". The shape of the relation, not a boolean flag, is the right discriminator.

## Why This Works

The query layer is the single chokepoint where a graph read leaves the DB and enters the rest of the system. Pushing the filter down means every consumer is correct by default — including consumers the next feature adds (think: a future "ask deep" tool that calls `getSubgraphForTopic` directly). The aggregator stays the right place for *layout* concerns (importance scoring, 200-node cap, wire serialization), but *what counts as a graph concept* is a graph-layer concern.

The cost is two integrations of one pure function instead of one — trivial — and the BFS still runs over the full data, so depth-bounded reachability is unchanged. Only the post-expansion projection differs.

## When to Apply

- Adding a node type or relation that represents "data behind a concept" (history points, computed projections, scratch/draft state) rather than a first-class concept.
- Any plan unit titled "filter X from {one surface}" — challenge it: list every read consumer of the same data; would the filter need to apply there too?
- New attribute or edge metadata that should hide certain nodes from LLM context — write the filter as a pure helper at the graph layer, not inside the prompt builder.

The general rule, lifted from the existing `deepening-plans-with-research-agents-2026-04-16.md`: when a fix is implemented at the wrong altitude, it always comes back as the same defect on a different surface a few releases later.

## Related

- `docs/solutions/best-practices/deepening-plans-with-research-agents-2026-04-16.md` — altitude principle (fix at the right depth; special cases on shared infrastructure are a smell).
- `docs/plans/2026-06-10-002-feat-longitudinal-health-graph-plan.md` U6 — the unit that filtered at the aggregator; the post-merge `fix(longitudinal)` commit landed the query-layer pushdown.
- Found by `/ce:code-review` Angle C (cross-file tracer) and confirmed by Phase 2 verifier — see PR #162.
