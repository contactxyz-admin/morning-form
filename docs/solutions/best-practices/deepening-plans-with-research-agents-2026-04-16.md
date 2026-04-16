---
module: planning
date: 2026-04-16
problem_type: best_practice
component: documentation
severity: medium
applies_when: Running a ce:plan deepening pass on an active plan that already has baseline structure. Especially valuable when the plan covers high-stakes domains (Article 9 PII, new sub-processors, auth, shareability) where thin sections become silent correctness risks.
tags:
  - ce-plan
  - deepening
  - planning-workflow
  - research-agents
  - health-graph
  - article-9
  - dpp
related_components:
  - documentation
  - development_workflow
---

## Context

This repo's active plan for the health-graph pivot (`docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`) existed as a 549-line baseline covering 19 implementation units. The user's new ask — port seam graph UI aesthetic, wire Karpathy perfect-context framing, make views DPP-shareable, add assessment-gating — overlapped heavily with the existing plan but surfaced gaps the baseline didn't anticipate: sub-processor compliance, prompt-injection surface on free-text intake, multi-column PDF extraction, share-link revocation semantics, first-login migration composition with cookie-based auth.

The `ce:plan` deepening fast path (skill Phase 5.3) applied cleanly because the plan already had YAML frontmatter, active status, and named implementation units. The route choice was "Deepen existing plan" over "Create new plan" — same scope, sharper.

## Guidance

**Five-research-agent dispatch in parallel, grouped by lens:**

1. `architecture-strategist` — Key Technical Decisions + System-Wide Impact
2. `security-sentinel` — Article 9 / auth / sub-processor risks
3. `data-integrity-guardian` — schema / migration / transaction semantics
4. `repo-research-analyst` — factual surface map (routes, handlers, current-user resolution)
5. `best-practices-researcher` — external references (seam patterns, Karpathy prompt discipline, DPP shareability)

Each agent fed a shared planning-context summary rather than the full plan — keeps prompts focused and agent context windows short. Agents returned structured findings; orchestrator grouped findings by theme (not by agent) for interactive review.

**Interactive finding review (skill step 5.3.6b) in themed rounds:**

- Round 1: Security/Auth/PII, Schema/Data-Integrity, LLM discipline
- Round 2: System-Wide Impact, seam patterns, DPP shareability

Six themes, two `AskUserQuestion` rounds of three. User chose "Accept all" per theme — the grouping let them make six decisions instead of ~40 per-finding decisions.

**Integration in focused batches:**

Edits land in logical groups, not one-finding-at-a-time:

1. Frontmatter + intro paragraph + Requirements Trace additions (U0, U20)
2. New "Key Technical Decisions" section (D1–D10) between Architecture and Patterns
3. New Unit 0 (real auth) as blocking precondition
4. Full rewrites of U1, U2, U5, U6, U8, U13, U15, U16, U17, U18, U19
5. New Unit 20 (shareable views)
6. New System-Wide Impact section
7. Risks rewrite (blocking/high/medium) + Dependencies graph update + Next Steps

Plan grew 549 → 929 lines. Unit count 19 → 21.

## Why This Matters

**A deepening pass is not a re-write.** If a plan is healthy but thin in high-stakes sections, spawning research agents against those sections specifically is 5–10x more useful than re-running the full `ce:plan` workflow. The baseline stays; the additions are surgical.

**Themed finding review preserves the user's authority without drowning them.** Per-finding review produces decision fatigue; unreviewed agent output produces plan drift. Themed "Accept all / mix / reject" (per theme) hits the right fidelity.

**Writing decisions as "Key Technical Decisions" (D1–D10) with rejected alternatives and trigger conditions** is more useful than burying rationale inline. Readers can scan decision headers, find the relevant one, and see what would change the decision (e.g., D1's explicit embedding-trigger threshold).

**System-Wide Impact is a load-bearing section when there are parked branches.** This plan intersects Stripe PR #15, the assessment-gating plan, and the existing health-pipeline — all of which need rebasing/amending after the deepened plan ships. A separate SWI section forces explicit enumeration of those collision points, rather than letting them surface at merge time.

## When to Apply

Apply this workflow when:

- A plan exists in `docs/plans/` with `status: active` and baseline structure (frontmatter + Requirements Trace + named Units)
- The user's next ask extends or refines the plan's domain (not a separate plan)
- The plan covers high-stakes concerns: PII / compliance, external sub-processors, auth, migrations, data contracts
- You'd otherwise be tempted to re-run the full `ce:plan` workflow — the deepening fast path is what you want instead

Don't apply when:

- The plan needs a local section edit, not a holistic review (just use Edit — don't spawn agents)
- The user's ask is a new scope, not an extension (use `ce:plan` fresh)
- The baseline plan is skeletal — deepening an empty scaffold amplifies the gaps rather than filling them

## Examples

**Theme grouping for interactive review** (what Round 1 looked like):

```
Round 1:
  Security/Auth/PII theme (7 findings)    → [Accept all | Mix | Reject]
  Schema/Data-Integrity theme (8 findings) → [Accept all | Mix | Reject]
  LLM discipline theme (6 findings)       → [Accept all | Mix | Reject]

Round 2:
  System-Wide Impact theme (6 findings)   → [Accept all | Mix | Reject]
  Seam pattern theme (7 findings)         → [Accept all | Mix | Reject]
  DPP shareability theme (~10 findings)   → [Accept — full model | Accept — subset | Reject]
```

**Decision-block format (D6 as exemplar — brief, with rejected alternatives):**

```markdown
### D6 — `graphRevision` is a monotonic per-user counter, not a content hash
**Decision.** `User.graphRevision BigInt`, bumped inside every
`addNode`/`addEdge`/`addSourceChunks` transaction. TopicPage cache keys
on this integer.
**Rationale.** The `(node count, edge count, max(updatedAt))` hash
originally specified has three collision modes (same-millisecond writes;
insert+delete balancing counts; non-atomic cross-table read) and is not
serializable under concurrent writes. A monotonic counter is atomic and
trivially serializable.
**Owned by.** U1 (schema + helper); U3 (mutations bump); U8 (caches key).
```

**Risk triage structure** — blocking / high / medium, each mapped to the Unit that mitigates:

```
### Blocking (must resolve before or during Phase A)
- R-A1. Unsigned-cookie authentication on special-category data. Mitigation: U0.
- R-A2. No DPA with Anthropic as Article 9 sub-processor. Mitigation: U18 + U2 startup check.
- R-A3. UK-GDPR right-to-erasure schema gap. Mitigation: U1 cascade + deleteUserData().

### High (must resolve before or during Phase B/C)
- R-B1. Upload DoS. Mitigation: U6 hardening.
- R-B2. Prompt injection. Mitigation: U5 sanitizer + U19 citation verifier + semantic lint.
...
```

This maps risks to units so the sequencing graph and risk register stay in sync.
