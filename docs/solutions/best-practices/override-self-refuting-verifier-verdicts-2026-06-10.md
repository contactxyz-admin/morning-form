---
title: "When a code-review verifier's verdict contradicts its own evidence, the orchestrator overrides"
date: 2026-06-10
category: docs/solutions/best-practices
module: ce:code-review workflow / phase-2 verify
problem_type: verifier_self_contradiction
component: code-review
symptoms:
  - "Verifier returns CONFIRMED with a transition table or worked example that proves the opposite verdict"
  - "Orchestrator records the verdict line without reading the evidence — false positive enters the findings list"
  - "Cleanup time wasted on a non-bug; trust in the review process erodes"
root_cause: orchestrator_trusted_verdict_without_reading_evidence
resolution_type: process_change
severity: medium
tags:
  - code-review
  - phase-2-verify
  - one-vote-3-state
  - orchestrator
---

# When a code-review verifier's verdict contradicts its own evidence, the orchestrator overrides

## Problem

The code-review skill's Phase 2 is a one-vote, three-state verifier (CONFIRMED / PLAUSIBLE / REFUTED) per candidate finding. The orchestrator records the verdict, deduplicates, and proceeds. This pipeline assumes verifier verdicts are consistent with the evidence each verifier supplies in its own response — usually a fair assumption, occasionally not. When a verifier's verdict line contradicts its own quoted evidence and the orchestrator records the verdict without reading the evidence, a false positive enters the final findings list and someone wastes refactor time on a non-bug.

This session's worked example: a candidate claimed the new `/demo/ask` page's autoscroll effect — `useEffect(() => endRef.current?.scrollIntoView(...), [items.length, activeId])` — had regressed against the old `MessageList`'s `[messages.length, lastContent]`: there should be a reachable state transition where visible content changes but neither dep changes, leaving the page unscrolled. The verifier built a careful transition table and returned **CONFIRMED**:

| Action | items before | items after | items.length Δ | activeId Δ |
|---|---|---|---|---|
| Pick slot in studio-booking | 3 | 4 | yes (3→4) | no |
| Confirm order in supply-reorder | 3 | 4 | yes (3→4) | no |
| ... | ... | ... | ... | ... |

The table shows `items.length` changing on every transition the verifier flagged. `items.length` is in the dep array. The effect fires. The CONFIRMED verdict contradicts the verifier's own evidence.

The orchestrator caught it on re-read, recorded REFUTED instead, noted the override in the final report, and the false positive did not enter the 7 findings. Had the verdict line been trusted, ~30 minutes would have been spent memoizing a `lastContent` value to fix a problem that doesn't exist.

## Symptoms

- A verifier returns CONFIRMED or PLAUSIBLE with a structured artifact attached (transition table, decision tree, worked example, quoted line).
- A close reading of the artifact shows it proves the opposite of the verdict line.
- The verifier's prose summary glosses the contradiction in one phrase ("so the deps don't fire" — without checking that they do).

## Solution

Before recording any non-REFUTED verdict, the orchestrator reads the verifier's evidence section, not just its verdict line. Most verifier outputs are 100–500 words; the contradiction (when present) is glaring once you look for it.

The override is the orchestrator's call, not a second-vote request. Code-review at high effort runs in recall mode (bias toward keeping findings), but a verdict whose own evidence refutes itself is not uncertainty — it's a wrong conclusion on the evidence supplied. Recasting as REFUTED is correct.

**Document the override in the final findings**, in the same place the refuted-during-review list lives: *"for the record: refuted during review despite the verifier's CONFIRMED — the verifier's own transition table showed `items.length` changing on every transition it flagged, which is in the dep array."* This both anchors the decision and preserves the verifier-quality signal across sessions.

## What Didn't Work

- **Trusting the verdict line.** The verifier is one agent; it can be wrong. The one-vote design assumes consistent self-reasoning, not infallibility.
- **Spawning a second verifier on the same candidate.** Wastes context and risks re-running the same flawed chain. The orchestrator reading the existing evidence is faster and more reliable.

## Why This Works

Verifier verdicts are usually right because the verifier has the diff, the candidate, and the file context — high-signal inputs. When they're wrong, the wrongness is usually visible *in the same output*: the verifier walked through the evidence correctly, then summarized incorrectly. Reading both halves of the verifier's response is the cheapest possible cross-check.

The override pattern also matters because false positives erode trust in the review process: one bogus high-severity finding makes the next ten findings less likely to be acted on. Catching them at the orchestrator stage preserves the review's signal-to-noise ratio.

## When to Apply

- Every non-REFUTED verdict in code-review Phase 2, especially at high / xhigh effort where verifier load is high.
- Verifier verdicts on subtle React lifecycle / dependency-array reasoning — easy to generate evidence for and easy to read backward.
- Verifier verdicts that include a structured artifact (table, tree, list) and a one-line summary — the artifact is the truth-anchor; the summary may not match it.
- TypeScript type-checking claims where the verifier ran an experiment whose direction can be inverted (e.g. checking that `satisfies` catches what a return-type annotation also catches).

## Related

- docs/solutions/best-practices/deepening-plans-with-research-agents-2026-04-16.md — earlier learning about themed orchestrator review of agent findings; same principle (read the substance, not just the conclusion).
