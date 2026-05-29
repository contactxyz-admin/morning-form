---
title: "Search adjacent directories for parallel implementations before writing a feature plan"
date: 2026-05-16
category: docs/solutions/best-practices
module: ce:plan workflow / repo discovery
problem_type: process_gap
component: planning
symptoms:
  - "Detailed plan written for a feature that already exists in a sibling directory"
  - "Doc-review and audit pass without surfacing the duplicate"
  - "User discovers parallel implementation mid-planning"
  - "Plan gets rewritten in-place from rebuild to consolidate/retire"
root_cause: incomplete_phase_1_research
resolution_type: process_change
severity: medium
tags:
  - ce-plan
  - repo-research
  - phase-1
  - parallel-implementations
  - consolidation
---

# Search adjacent directories for parallel implementations before writing a feature plan

## Problem

`/ce:plan` Phase 1 (Repo Research) typically searches for relevant patterns, conventions, and existing primitives. It often misses the question of **whether the feature being planned already exists in a sibling form, under a different name, in a different folder.**

Cost of missing this: a complete plan gets written, doc-reviewed, deepened — then the user notices the parallel implementation and the plan has to be rewritten as a consolidation rather than a rebuild. The rebuild work itself was avoided, but planning time was burned.

Example from this session: a 7-unit `/ce:plan` was written to add a navigable-graph view to `/r/demo-navigable-record` (an existing public route that rendered topic prose). The plan passed `/ce:plan` doc-review with one P1 fixed. Then the user pointed out `/demo/record` — a parallel public route under a different folder, using a different persona, with a different fixture, that had been shipping the same navigable-graph UX for weeks. The plan was rewritten in place to **retire `/r/[slug]` and polish `/demo/record`** instead.

The rewrite was straightforward because the new plan was structurally simpler than the old. The wasted time was the original plan's research, drafting, and doc-review — ~30 minutes of focused work that could have been short-circuited by 5 minutes of grep at the start of Phase 1.

## Symptoms

- Phase 1 Repo Research returns a clean read: "no parallel implementation found, this would be a new surface."
- Plan goes through doc-review cleanly (no scope-guardian flag on duplication).
- User, reading the plan or about to start `/ce:work`, says "but isn't there already a `/X/Y` route doing this?" — and there is.

## What Didn't Work

- **Grepping for the exact route shape** (`grep -r "demo-navigable-record" src/`). Only finds explicit references to the slug; doesn't find adjacent routes with different naming.
- **Reading CLAUDE.md / AGENTS.md.** No project-level instruction to search for parallels.
- **The doc-review pass.** Five reviewers (coherence, feasibility, scope-guardian, security, adversarial) all read the plan against itself. None of them checked whether the feature already existed elsewhere — that's not their charter.

## Solution

In `/ce:plan` Phase 1 (Repo Research), add a **parallel-implementation check** as an explicit step. Three queries to run:

1. **User-visible noun search:** find every route directory under `src/app/` whose name contains the feature's primary noun.
   ```bash
   find src/app -type d | grep -iE "(demo|record|graph|chat|share|profile)" | sort
   ```
   Yields a quick map of sibling surfaces. If the feature is "navigable record demo," the result `src/app/r/`, `src/app/demo/`, `src/app/share/` is the answer to "where else might this live?"

2. **Headline-component search:** find every consumer of the components your plan proposes to use.
   ```bash
   grep -rln "GraphCanvas\|NodeDetailSheet" src/
   ```
   If `GraphCanvas` is already imported by two different routes, your plan needs to address how it relates to both.

3. **Data-shape search:** find every callsite of the data the feature loads.
   ```bash
   grep -rln "DemoRecordFixture\|METABOLIC_PERSONA_GRAPH" src/ prisma/
   ```
   Reveals parallel data sources backing parallel surfaces.

If any of the three queries returns multiple distinct routes/components/data-sources implementing the same UX shape, **the plan must address consolidation before introducing a third.** Options to evaluate explicitly:

- **Retire the existing surface(s)** and route everything to the new plan
- **Retire the new feature** (don't ship; document why the existing one is fine)
- **Coexist with clear scope boundaries** (e.g., authed vs public; different audiences)
- **Consolidate onto one** (the actual answer for the consolidation PR this learning came from)

## Why This Works

Route trees and component trees are physically searchable. Parallel implementations live in adjacent siblings (`src/app/demo/`, `src/app/r/`, `src/app/share/`). A quick three-query scan at the start of Phase 1 takes ~5 minutes and surfaces them.

The cost of missing parallels compounds: each subsequent phase (doc-review, deepening, work execution) operates against the wrong premise. Catching it at Phase 1 is the cheapest possible fix.

## Prevention

1. **`/ce:plan` Phase 1 prompt should include:**
   > "Before planning the new surface, search the repo for adjacent implementations. Report: (a) sibling routes by directory name, (b) consumers of headline components your plan will use, (c) callsites of the data the feature loads. If any return multiple matches, address consolidation explicitly in Decisions."

2. **`/ce:brainstorm` should ask:** "Is there an adjacent surface (different persona, different route shape) doing something similar today?" — users often know but don't volunteer it.

3. **Dispatch `repo-research-analyst` with explicit instruction.** Default research is too generic. Frame the query as:
   > "Search for parallel implementations of `<surface>`. List all routes/components/data-sources that render the same UX shape, even with different data or naming."

4. **Read the route directory listing as part of Phase 1.** `ls src/app/` is the cheapest possible signal — every sibling there is a potential parallel.

5. **Scope-guardian doc-review prompt should include:** "Does this plan create a third implementation of an existing UX? If so, justify the trifurcation."

## Related Issues

- This session, PR #128 (`feat/consolidate-demo-surface`). The original plan would have built a new graph view; the rewrite retired the duplicate route and polished the canonical one. End state: one fewer route, one more polish, same code volume.
- A pattern from this session worth carrying: when the plan gets pivoted mid-flight, **rewrite the plan file in place** rather than abandoning it. The plan doc becomes the historical record of "what we considered and rejected" as well as "what we shipped." Adversarial-review-style "Considered Alternatives" sections capture the abandoned approach.
- Related discipline: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` — visual audit is the analog of this discipline for UI fidelity. Both are about catching gaps that the standard workflow doesn't surface.
