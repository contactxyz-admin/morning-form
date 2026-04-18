---
title: "feat: Clinical scribes embedded in the record — in-content judgments, selection→explain, clinical audit trail"
type: feat
status: active
created: 2026-04-18
origin: docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md
siblings:
  - docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md
  - docs/plans/2026-04-17-002-feat-navigable-ia-restructure-plan.md
---

## Problem

Plan `docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md` shipped the record-family surface: `/record`, `/record/source/[id]`, `/r/[slug]`, grid-pattern ground, mesh-gradient source thumbnails, cross-linking via `NodeDetailSheet` in topic prose, `TopicLogFooter`, and a unified seam-inspired aesthetic (PRs #43–#52). Plan `docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md` shipped the substrate: typed graph, SUPPORTS-edge provenance, `compileTopic` → three-tier output (Understanding / What you can do now / Discuss with clinician) + GP-prep, linter, share-token redaction.

**What's missing is the layer that actually innovates on health UX**: the seam-style *scribe* embedded **inside** the record — a per-topic, clinically-scoped agent that acts **like a specialist GP for that topic**: confident to make judgments within its specialty, disciplined about referring anything outside it. Backs every claim with SUPPORTS-edge citations. Answers selection-triggered "explain this" questions without leaving the page. Not a chat sidebar. Not narrative summaries hovering above the record. A scribe baked into the prose at compile time and reachable by selection at runtime, bounded by a per-topic safety policy that encodes the specialist's scope of practice.

The specialist-GP analogy matters for three reasons: (1) a specialist has *confidence* within their scope — the Iron scribe should state reference-range classifications plainly rather than hedging; (2) a specialist has *referral discipline* — anything outside scope routes to "Discuss with clinician" or GP-prep, not a watered-down answer; (3) a specialist has a *narrow domain of expertise* — one scribe per topic maps cleanly to one specialist per specialty, rather than a generalist trying to cover everything.

The seam reference (`/Users/reubenselby/Developer/seam/api/src/chat/scribes.service.ts`, `/Users/reubenselby/Developer/seam/app/src/components/features/review-topic-v2/seeker/{SelectionPopover,InlineExplainCard}.tsx`) gives us the pattern: per-topic `Chatbot` with a tool palette, `SelectionPopover` → Explain → `InlineExplainCard` streaming a bounded answer rooted in the reading surface. The MorningForm adaptation diverges in three non-trivial ways:

1. **Clinical safety is a first-class policy layer**, not a soft system-prompt nudge. Scribes may only make judgments inside an allow-list of judgment kinds per topic (reference-range comparisons, pattern-recognition against the user's own history, citation surfacing). Everything else is deferred to "Discuss with clinician" or GP-prep.
2. **Two execution modes** that share one tool palette: compile-time (baked into `TopicPage.rendered` with full auditability) and runtime (selection→Explain, bounded, logged). Compile-time dominates for headline prose; runtime handles user-initiated comprehension.
3. **Every scribe utterance is auditable** — prompt, tool calls, citations, model+version, safety classification — satisfying R17–R19's decision-support regulatory posture and making future clinical review tractable.

Scope-adjacent requirements from the origin document (`docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`):
- **R1** — typed graph is the read-side substrate for scribe tool calls
- **R2, R16** — every scribe judgment resolves to SUPPORTS citations already rendered inline
- **R12** — covers all three v1 topics (Iron / Sleep & recovery / Energy & fatigue)
- **R13** — scribes enrich but do not restructure the three-tier topic shape; GP-prep routing is part of the safety policy
- **R17–R19** — information/decision-support framing, no drug names/doses/treatment imperatives, persistent disclaimer, auditability
- **R20–R23** — graph-as-primary; scribes attach to the record where users already live

See origin: `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`.

## Scope Boundaries

**In scope:**
- Scribe data model (per-user, per-topic) + migrations
- Per-topic clinical safety policy layer (allow-listed judgment kinds, forbidden outputs, citation-density floor, out-of-scope routing)
- MorningForm scribe tool palette (server-side tools over existing graph + RAG; no new infra)
- Compile-time scribe integration inside the existing `compileTopic` pipeline (enriches schema; reuses linter)
- Runtime selection→Explain UX on topic prose for all three v1 topics
- Clinical audit log written on every scribe output (compile-time and runtime)
- Agent-native parity for all new UI affordances
- Regulatory copy + disclaimer persistence on topic + `/r/[slug]` share views

**Out of scope:**
- **The clinical-LLM training pipeline itself** — this plan consumes a configurable model endpoint. Model selection, fine-tuning, eval harness are a separate system.
- **Freeform chat** — the runtime surface is strictly selection-triggered and single-turn. No "Continue in Scribe" affordance is rendered in v1; the button returns when the bounded multi-turn surface ships in a follow-on plan.
- **Cross-topic scribe federation** — each scribe is scoped to exactly one topic; cross-topic navigation suggestions use the existing `NodeDetailSheet` + cross-link pattern, not a multi-scribe bus.
- **Scribe-authored edits to the graph** — scribes read the graph; ingest remains human + ingest-pipeline only.
- **New visual tokens** — must stay within `tailwind.config.ts` as shipped (PRs #29/#30/#57/#68).

## Requirements Trace

| Req | How this plan satisfies it |
|---|---|
| R1 | Scribe tool palette reads typed graph + SUPPORTS edges; no new substrate. |
| R2 | Every scribe judgment (compile-time or runtime) must resolve to a `Citation{nodeId, chunkId, excerpt}` — enforced by linter + safety policy. |
| R12 | All three v1 topics (Iron / Sleep / Energy) get a scribe at compile time; selection→Explain available on rendered prose for all three. |
| R13 | Scribe enrichments ride inside the existing `understanding`/`whatYouCanDoNow`/`discussWithClinician`/`gpPrep` tiers; out-of-scope prompts route to `discussWithClinician` or GP-prep. |
| R16 | Inline citations unchanged for prose; new scribe annotations carry their own citation set, surfaced through the same `NodeDetailSheet` affordance. |
| R17 | Safety policy forbids drug names, dosages, treatment imperatives; linter rule enforces in CI. |
| R18 | Persistent disclaimer pinned at record footer + every scribe explain card. |
| R19 | `ScribeAudit` table logs prompt/tool-calls/citations/model-version/safety-classification; exportable for review. |
| R20–R23 | No new top-level surface; scribe lives inside the record users already inhabit. |

## Key Decisions

**D1. Compile-time dominates; runtime is the escape hatch.** Headline prose and inline judgments are produced at compile time so they are linted and auditable before a user ever reads them. Runtime selection→Explain handles comprehension gaps and is scoped to the selected span + the topic subgraph — no freeform reasoning. Rationale: compile-time output is reviewable as a static artifact; runtime output is only ever a bounded follow-up against prose the user has already loaded. This split keeps the clinical-review surface small.

**D2. Safety is a declarative policy, not a prompt — encoding the specialist's scope of practice.** Per-topic config (TypeScript module, same shape/location pattern as `src/lib/topics/prompts/*.ts`) declares `allowedJudgmentKinds`, `forbiddenPhrasePatterns`, `minCitationDensity`, `outOfScopeRoute`. The policy file is the scribe's scope of practice — the explicit list of what a specialist GP for this topic is licensed to say, and what they must defer. Prompt text still repeats key rules verbatim (belt + braces), but the authoritative check is the policy run on every output before it's rendered or streamed. Rationale: prompts drift; compiled config doesn't. A clinical reviewer reads the policy file as a scope-of-practice document, not five prompt templates.

**D3. One scribe per topic, seeded lazily per user — three specialists, not one generalist.** Follows seam's `ChatbotTopicLink` pattern but fixed 1:1 (no user-configurable reassignment in v1). A user's first visit to `/topics/iron` triggers `getOrCreateScribeForTopic(userId, 'iron')`. The mental model is three specialist GPs (Iron, Sleep, Energy) rather than one generalist covering everything — each with its own scope, its own allowed-judgment list, and its own referral rules. Rationale: flexibility is a v2 concern; v1 needs reproducible, narrowly-scoped outputs per topic, which rules out user-editable system prompts and shared scribes.

**D4. Scribe tool palette is a thin adapter over existing substrate.** Six server-side tools: `search_graph_nodes`, `get_node_detail`, `get_node_provenance`, `compare_to_reference_range`, `recognize_pattern_in_history`, `route_to_gp_prep`. No new indexes, no new storage — all back onto `GraphNode`/`GraphEdge`/`SourceChunk`/`CheckIn`/`HealthDataPoint` queries already used by `compileTopic`. Rationale: seam's `search_knowledge_base` et al. are thin too; the value is in the policy layer, not in exotic tooling.

**D5. Streaming is SSE, not WebSocket.** Runtime Explain streams tokens over SSE (edge-compatible, works inside the existing Next.js route handlers). The streaming contract mirrors seam's chat-store output but is one-shot. Rationale: matches the infrastructure already in `src/app/api/`; no new transport.

**D6. Audit log is append-only and redacted in shares.** `ScribeAudit` rows are never mutated or deleted; share-token redaction strips them from `/r/[slug]` views the same way it strips `CheckIn` (see `src/lib/share/redaction.ts`). Rationale: R19 auditability + R22's share surface must not leak a user's raw prompts.

**D7. Compile-time scribe annotations ride inside the existing `TopicCompiledOutput` schema.** The Zod schema (`src/lib/topics/types.ts`) grows a `scribeAnnotations: ScribeAnnotation[]` field per section; each annotation carries a `spanAnchor` (substring of `bodyMarkdown`), a `judgmentKind`, inline `citations`, and an optional `outOfScopeRoute`. Rationale: keeps one compile call per page (no second round-trip), and the linter runs once against the whole output.

**D8. No "Continue in Scribe" affordance in v1.** The `InlineExplainCard` ends at its streamed answer + citations + disclaimer. No disabled button, no tooltip, no placeholder. Rationale: bounded multi-turn clinical chat is a separate safety surface with its own review cycle, and a disabled affordance invites exactly the interaction we aren't ready to support. Absence is cleaner than a stub.

**D9. Model version is pinned at scribe creation and re-captured at every call.** The `Scribe` row stores the *resolved* model version string at seed time (e.g., `'openrouter/openai/gpt-4.1@2026-04-15'`). Every `ScribeAudit` row re-captures the version actually used for that call. Drift detection is a simple read: if `ScribeAudit.modelVersion !== Scribe.modelVersion`, flag for clinical re-review. Rationale: R-1 / R19 — clinical output tied to a specific model version is the only auditable unit; string-named models that silently upgrade break the audit contract.

**D10. Tool-handler user-scoping is an invariant of the executor, not per-handler discipline.** `src/lib/scribe/execute.ts` resolves `userId` once per invocation and threads it through every tool-handler call; no tool handler is callable without a resolved user context. Cross-user data leaks become structurally impossible rather than testable-per-handler. Rationale: per-handler scoping decays as new tools are added; an invariant enforced by the executor does not.

**D11. Audit writes are idempotent and land before the final policy gate.** Each scribe invocation (compile or runtime) is keyed by a deterministic `requestId` (UUIDv4 generated at entry). `ScribeAudit` rows are upserted on that key. The audit row is written *before* the final `enforce(policy, output)` gate so rejected outputs are still captured with classification `'rejected'`. Client disconnect mid-stream cannot produce a missing audit for a rejected or delivered output. Rationale: R19 requires every scribe utterance to be auditable; "on stream close" fails that when the stream doesn't close cleanly.

## Non-Goals

- Multi-turn chat with a scribe (see D8)
- User-editable scribe prompts or tool palettes (see D3)
- Scribes writing to the graph (ingest only)
- Real-time re-compile on graph edit (existing revision-hash cache handles this; compile stays lazy)
- Offline / client-side scribe execution

## Implementation Units

Each unit carries an Execution note where test-first discipline is appropriate. Compile pipeline and safety policy are **test-first**; UI units are pragmatic.

### U1 — Scribe data model + migrations

- [x] migration + models land
- [x] seed produces 3 scribes for demo user
- [x] `repo.ts` unit tests green

**Goal:** Persist per-user, per-topic scribes, their tool-enable state, topic-link (1:1), and audit trail.

**Files:**
- `prisma/schema.prisma` — add models `Scribe`, `ScribeTool`, `ScribeTopicLink`, `ScribeAudit`
- `prisma/migrations/<next>/migration.sql` — generated
- `prisma/seed.ts` — seed default scribe for `demo@morningform.com` per topic key
- `src/lib/scribe/repo.ts` — query helpers (`getOrCreateScribeForTopic`, `listEnabledTools`, `appendAudit`)
- `src/lib/scribe/repo.test.ts` — unit tests

**Approach:**
- `Scribe`: `id`, `userId`, `topicKey`, `systemPrompt` (nullable; defaults to topic-policy prompt when null), `model` (default `'openrouter/openai/gpt-4.1'` to mirror seam; configurable), `modelVersion` (resolved version string captured at seed time — see D9), `temperature` (default `0.3` — tighter than seam's 0.7 for clinical surfaces)
- `ScribeTool`: `(scribeId, toolName)` unique, `enabled` boolean; seeded from `src/lib/scribe/tool-catalog.ts` (U3)
- `ScribeTopicLink`: `(userId, topicKey)` unique → `scribeId` — enforces 1:1 at DB level
- `ScribeAudit`: `id`, `scribeId`, `userId`, `topicKey`, `requestId` (UUIDv4, unique per scribe — see D11), `mode` (`'compile' | 'runtime'`), `prompt`, `toolCalls` (JSON), `output`, `citations` (JSON), `safetyClassification`, `modelVersion` (the version *actually used* for this call, may differ from `Scribe.modelVersion` if the upstream upgraded), `createdAt`, `updatedAt`; `@@unique([scribeId, requestId])` enforces idempotent upsert; append-semantics — the upsert path is the only write surface, no update/delete routes exposed

**Patterns to follow:** `src/lib/topics/registry.ts` for the per-topic module shape; existing Prisma models in `prisma/schema.prisma` for index/relation conventions.

**Execution note:** Test-first for `repo.ts` — write failing unit tests for `getOrCreateScribeForTopic` (idempotent) and `appendAudit` (append-only) before implementation.

**Test scenarios:**
- Happy: `getOrCreateScribeForTopic(user, 'iron')` creates scribe + 6 tool rows + topic-link on first call; returns same scribe id on second call.
- Edge: concurrent first calls for the same `(user, topic)` — only one `Scribe` row exists (rely on unique index + upsert).
- Edge — model version capture: new scribes persist `modelVersion` at creation; subsequent `getOrCreateScribeForTopic` calls do **not** mutate the stored version (drift must be observable).
- Edge — audit idempotency: calling `appendAudit` twice with the same `requestId` produces exactly one row; second call updates the existing row rather than creating a duplicate.
- Error: `appendAudit` only exposes upsert; repo has no `updateAudit` / `deleteAudit` exports (structural guard, not runtime check).
- Integration: seed runs end-to-end and produces the three scribes for the demo user, each with `modelVersion` populated.

**Verification:** `pnpm prisma migrate dev` succeeds; `pnpm test src/lib/scribe/repo.test.ts` green; `pnpm seed` produces exactly 3 scribes for the demo user.

### U2 — Clinical safety policy layer

- [ ] policy types + per-topic modules land
- [ ] `enforce.ts` passes exhaustive unit tests (including positive scope-appropriate scenarios)
- [ ] registry lookup wired

**Goal:** Declarative, testable policy module per topic that gates every scribe output.

**Files:**
- `src/lib/scribe/policy/types.ts` — `SafetyPolicy`, `JudgmentKind`, `SafetyClassification`
- `src/lib/scribe/policy/iron.ts`, `sleep-recovery.ts`, `energy-fatigue.ts` — per-topic policy instances
- `src/lib/scribe/policy/enforce.ts` — pure `enforce(policy, candidate): { ok: true, classification } | { ok: false, violations }`
- `src/lib/scribe/policy/enforce.test.ts` — exhaustive unit tests
- `src/lib/scribe/policy/registry.ts` — `getPolicy(topicKey)`

**Approach:**
- `JudgmentKind` enum: `'reference-range-comparison' | 'pattern-vs-own-history' | 'citation-surfacing' | 'definition-lookup'`. Anything else is rejected or routed out-of-scope. These are the kinds a specialist GP would make within their scope — classify a value against a reference range, recognize a pattern in the patient's own history, point to a source, define a term — without venturing into prescribing or treatment choice.
- `SafetyPolicy`: `{ topicKey, allowedJudgmentKinds: JudgmentKind[], forbiddenPhrasePatterns: RegExp[], minCitationDensityPerSection: number, outOfScopeRoute: 'discussWithClinician' | 'gpPrep' }` — the per-topic scope-of-practice document.
- `forbiddenPhrasePatterns` seeded with drug-name list (pull from existing linter if present, else derive from NHS common-drug list as a comment-referenced static array), dose patterns (`/\b\d+\s*(mg|mcg|g|iu|ml)\b/i`), imperative verbs (`/(you should take|stop taking|increase your dose)/i`)
- `enforce()` returns a `SafetyClassification` (`'clinical-safe' | 'out-of-scope-routed' | 'rejected'`) that is persisted to `ScribeAudit`.

**Patterns to follow:** `src/lib/llm/linter.ts` — existing rule shape, violation objects, remedial-prompt contract. The safety layer runs *before* the existing linter; both must pass.

**Execution note:** Test-first. Policy enforcement is the single most important correctness surface in this plan — every violation is a potential clinical harm or regulatory breach.

**Test scenarios:**
- Happy — scope-appropriate plain statement: "Your ferritin of 12 μg/L is below the typical reference range of 15–150 μg/L" with a citation on the ferritin biomarker node passes with classification `'clinical-safe'`. (A specialist GP for Iron should state this plainly; a policy that rejects this is too strict.)
- Happy — pattern-vs-own-history: "Your HRV has trended below your 30-day baseline on four of the last seven days" citing `HealthDataPoint` nodes passes with classification `'clinical-safe'`.
- Happy — citation surfacing: a statement paired with an explicit excerpt from a `SourceChunk` passes.
- Edge — judgment kind: a `'pattern-vs-own-history'` judgment on Sleep citing `CheckIn` nodes passes; same kind with zero citations fails.
- Edge — citation density: a section with 3 paragraphs and only 1 citation fails `minCitationDensityPerSection: 0.5` (one citation per two paragraphs floor).
- Error — forbidden phrase: output containing "take 65mg ferrous sulfate" is rejected, classification `'rejected'`, violations list includes both the drug-name pattern and the dose pattern.
- Error — forbidden imperative: "you should stop taking X" → rejected.
- Edge — out-of-scope route: a prompt asking "should I start iron supplements?" returns a scribe output whose `judgmentKind` is absent from the Iron policy's `allowedJudgmentKinds` → classification `'out-of-scope-routed'`, output rewritten to a GP-prep pointer.
- Regression: `enforce` is pure (no I/O) and deterministic — same inputs always produce same output.

**Verification:** `pnpm test src/lib/scribe/policy` green; policy files reviewed by plan author before merge.

### U3 — MorningForm scribe tool palette (server-side)

- [ ] tool catalog + six handlers land
- [ ] `execute.ts` executor enforces user-scoping invariant (D10)
- [ ] per-tool unit tests green

**Goal:** Six server-side tools the scribe can call during compile-time or runtime execution.

**Files:**
- `src/lib/scribe/tool-catalog.ts` — tool definitions (name, JSON schema, handler)
- `src/lib/scribe/tools/search-graph-nodes.ts`
- `src/lib/scribe/tools/get-node-detail.ts`
- `src/lib/scribe/tools/get-node-provenance.ts`
- `src/lib/scribe/tools/compare-to-reference-range.ts`
- `src/lib/scribe/tools/recognize-pattern-in-history.ts`
- `src/lib/scribe/tools/route-to-gp-prep.ts`
- `src/lib/scribe/tools/*.test.ts` — one test file per tool
- `src/lib/scribe/execute.ts` — LLM dispatch loop (request → tool-call → handler → response) that mirrors `src/lib/topics/compile.ts`'s shape but is reused for compile + runtime modes

**Approach:**
- Executor invariant (D10): `execute()` resolves `userId` and `topicKey` once at entry and threads them through every tool-handler call. Tool handlers have no default-user fallback — calling a handler without a resolved `userId` is a type error (handler signature requires it). This makes cross-user leakage structurally impossible rather than per-handler-testable.
- Tool handlers are thin adapters on existing queries:
  - `search_graph_nodes(userId, topicKey, query)` → `src/lib/graph/queries.ts::searchNodes` scoped to the topic subgraph (`getSubgraphForTopic`)
  - `get_node_detail(userId, nodeId)` / `get_node_provenance(userId, nodeId)` → existing `getProvenanceForNodes`; both reject (return "not found") when the node doesn't belong to `userId`
  - `compare_to_reference_range(userId, biomarkerKey)` → reads `GraphNode.meta` for reference-range fields already captured during ingest; returns `{ value, range, classification: 'below' | 'in-range' | 'above' }`
  - `recognize_pattern_in_history(userId, topicKey, window)` → reads `CheckIn` + `HealthDataPoint` for the user over a bounded window (default 90 days, capped at 180); bails out and returns `null` when matching rows exceed a safety threshold (default 2000 rows) to protect p95 latency on the runtime path
  - `route_to_gp_prep(topicKey, reason)` → returns a deterministic handoff payload that the compile pipeline rewrites into a `gpPrep` entry, and the runtime surface renders as an "Add to GP prep" button
- `execute()` guarantees: each tool call must resolve before the LLM produces its final output; the final output is passed through `enforce(policy, output)` before being returned to the caller; `ScribeAudit` is upserted by `requestId` *before* the final policy gate (D11) so rejected outputs still land.

**Patterns to follow:** `src/lib/topics/compile.ts` for the LLM request/retry shape; `src/lib/graph/queries.ts` for query ergonomics; `/Users/reubenselby/Developer/seam/app/src/lib/chat/tool-definitions.ts` as a reference for tool-definition shape (do not copy the tool list — MorningForm's palette is distinct).

**Execution note:** Pragmatic. Test handlers individually; integration covered by U4 compile tests.

**Test scenarios (per handler + executor):**
- Happy: `compare_to_reference_range` on a ferritin biomarker returns `{ value: 12, range: [15, 150], classification: 'below' }`.
- Edge: `recognize_pattern_in_history` returns `null` when the window has fewer than 3 check-ins.
- Edge: `recognize_pattern_in_history` bails with `null` and a telemetry event when the row count exceeds the safety threshold (simulate by seeding >2000 `HealthDataPoint` rows).
- Edge: `search_graph_nodes` respects topic scope — a query in the Iron scribe returns only Iron-subgraph nodes.
- Error — executor invariant: `execute()` called without a resolved `userId` is a TypeScript compile error; runtime type narrowing asserts the value at entry and throws on null (covered by the executor's own unit test).
- Error — cross-user across the board: `get_node_detail`, `get_node_provenance`, `compare_to_reference_range`, `recognize_pattern_in_history`, `search_graph_nodes` each return empty / "not found" when the resolved `userId` does not own the target data. One test table per handler, not per-suite drift.

**Verification:** `pnpm test src/lib/scribe/tools` green.

### U4 — Compile-time scribe integration

- [ ] `TopicCompiledOutput` schema extended with `scribeAnnotations`
- [ ] `compileTopic` pipeline invokes scribe, enforces policy, writes audit
- [ ] existing compile tests still green; scribe-annotation path covered

**Goal:** The existing `compileTopic` pipeline produces, in one LLM call, prose + inline scribe annotations, all policy-enforced, all linted, all audited.

**Files:**
- `src/lib/topics/types.ts` — extend `SectionSchema` with `scribeAnnotations: ScribeAnnotationSchema[]`
- `src/lib/topics/compile.ts` — invoke scribe via `src/lib/scribe/execute.ts` during compile; write `ScribeAudit` with `mode: 'compile'` before returning
- `src/lib/topics/prompts/{iron,sleep-recovery,energy-fatigue}.ts` — append scribe-annotation instructions + safety-policy rule echo
- `src/lib/topics/compile.test.ts` — extend coverage for scribe-annotation path
- `src/lib/scribe/annotations.ts` — `ScribeAnnotation` shape (`spanAnchor: string`, `judgmentKind: JudgmentKind`, `content: string`, `citations: Citation[]`, `outOfScopeRoute?: 'gpPrep'`)

**Approach:**
- `ScribeAnnotationSchema` = Zod equivalent of the above, with `spanAnchor.min(8)` to avoid anchoring on trivial substrings.
- Compile pipeline orchestration after this change: `subgraph → prompt build → LLM (forced tool-use with scribe palette enabled) → safety.enforce → existing linter → write TopicPage + ScribeAudit`.
- Two safety outcomes that still write a successful `TopicPage`: `'clinical-safe'` (annotations rendered) and `'out-of-scope-routed'` (annotation elided from prose; `gpPrep.questionsToAsk` appended instead). `'rejected'` triggers the existing one-retry linter flow with a remedial prompt; a second rejection writes `compileError` and leaves `rendered` alone.

**Patterns to follow:** `src/lib/topics/compile.ts` cache + retry pattern (already documented in file header); `src/lib/llm/linter.ts` for composing safety + lint passes.

**Execution note:** Test-first — extend `compile.test.ts` with a scribe-annotation scenario before implementation; existing tests must stay green.

**Test scenarios:**
- Happy: Iron topic compile produces `understanding` section with at least one `scribeAnnotation` of kind `'reference-range-comparison'` and citations resolving to real `GraphNode` ids.
- Edge: forced out-of-scope prompt (simulated by seeding a user whose graph lacks biomarker nodes) produces `gpPrep.questionsToAsk` entries instead of inline annotations.
- Edge — cache (graph-revision): second compile with an unchanged `graphRevisionHash` short-circuits; no scribe invocation; no new `ScribeAudit` row.
- Edge — cache (model-version drift): second compile where `Scribe.modelVersion` no longer matches the upstream resolved version forces a recompile even when `graphRevisionHash` is unchanged; audit captures both old and new versions.
- Error — policy rejection first attempt: inject a forbidden-phrase output in a test-only LLM stub → `ScribeAudit` is written with classification `'rejected'` *before* the remedial retry fires (D11 ordering).
- Error — policy rejection after retry: second rejection sets `compileError`, leaves prior `rendered` intact, writes a second `ScribeAudit` row (distinct `requestId`) with classification `'rejected'`. Verify the remedial prompt was actually passed to the second LLM call.
- Regression: existing three-tier + GP-prep schema shape still validates for all three topics.

**Verification:** `pnpm test src/lib/topics/compile.test.ts` green; manual spot-check of `/topics/iron`, `/topics/sleep-recovery`, `/topics/energy-fatigue` on the demo user shows inline scribe annotations rendered beneath section prose with citation pills.

### U5 — Runtime selection→Explain UX

- [ ] `SelectionPopover` + `InlineExplainCard` land, styled within shipped tokens
- [ ] SSE `POST /api/scribe/explain` route handler green under integration tests
- [ ] manual walkthrough on all three topics shows selection→Explain + citations

**Goal:** On any topic prose, selecting text exposes an "Explain" action that streams a bounded scribe response inline — no page navigation, no freeform chat.

**Files:**
- `src/components/scribe/selection-popover.tsx` — port of seam's `SelectionPopover.tsx` adapted for the record aesthetic; action set = `['Explain']` only in v1
- `src/components/scribe/inline-explain-card.tsx` — port of `InlineExplainCard.tsx`, draggable, streams via SSE, shows citation pills and persistent disclaimer; no "Continue in Scribe" affordance per D8
- `src/components/scribe/use-explain-stream.ts` — hook that opens SSE, buffers tokens, exposes `{ status, content, citations, error }`
- `src/app/(app)/topics/[topicKey]/page.tsx` — mount `SelectionPopover` over prose containers; thread `topicKey` + selected span to the card
- `src/app/api/scribe/explain/route.ts` — `POST` route handler: validates auth, resolves scribe via `getOrCreateScribeForTopic`, calls `scribe/execute.ts` with selection span + topic subgraph, pipes SSE, writes `ScribeAudit` with `mode: 'runtime'` on stream close
- `src/app/api/scribe/explain/route.test.ts` — integration test against a stubbed LLM

**Approach:**
- Runtime prompt template: `"You are the specialist scribe for {topic}. Explain this passage briefly (2-3 sentences): \"{selection}\". Stay within your scope of practice: {allowedJudgmentKinds}. Cite graph nodes by id. Refer anything outside your scope to 'Discuss with clinician' rather than answering partially."`
- Card appears fixed `bottom-24` (matches seam), constrained `max-w-sm`, uses `bg-surface` + `shadow-modal` + `border-border-strong` — all existing tokens.
- Card footer: persistent disclaimer copy (R18). No "Continue in Scribe" button — the card ends at disclaimer + close.
- Stream implementation: route handler returns a `Response` with `text/event-stream`; client consumes via `EventSource`. On `done`, the final payload is re-validated against the safety policy before being surfaced.

**Patterns to follow:** existing `src/components/graph/node-detail-sheet.tsx` for the modal/sheet aesthetic; `src/app/api/insights/weekly/route.ts` for API handler scaffolding; `/Users/reubenselby/Developer/seam/app/src/components/features/review-topic-v2/seeker/InlineExplainCard.tsx` and `.../SelectionPopover.tsx` for component shape.

**Execution note:** Pragmatic. Write the API integration test first (it's the correctness boundary); iterate UI visually.

**Test scenarios:**
- Happy (API): `POST /api/scribe/explain` with a valid Iron selection streams a well-formed SSE response; final payload passes safety policy; `ScribeAudit` row written.
- Edge (API): empty selection → 400; cross-topic selection (topic in body doesn't match topicKey param) → 400.
- Edge (API): auth missing → 401; user has no scribe for the topic yet → scribe is created lazily before execute.
- Error (API): LLM emits forbidden phrase → safety rejects → response degrades to a fixed "I can't answer that here — here's a GP-prep suggestion" payload; `ScribeAudit` records classification `'rejected'`.
- Edge (API) — client disconnect mid-stream: client closes connection before final token; `ScribeAudit` row still exists (written pre-gate per D11) with whatever classification the output had resolved to. No missing audit for a disconnect.
- UI: selecting prose shows the popover; clicking Explain opens the card; card streams tokens; closing the card emits no lingering listeners.
- UI: keyboard parity — Tab to popover, Enter to trigger Explain, Escape to dismiss card.

**Verification:** `pnpm test src/app/api/scribe/explain` green; manual walkthrough on all three topics shows selection→Explain works with citations visible; `pnpm lint` + `pnpm typecheck` clean.

### U6 — Agent-native parity

- [ ] `POST /api/scribe/compile`, `GET /api/scribe/audit` routes land
- [ ] auth + scope tests green

**Goal:** Every scribe capability a user has via UI is reachable programmatically — no UI-only affordances.

**Files:**
- `src/app/api/scribe/compile/route.ts` — `POST` endpoint to re-run compile for a topic (idempotent wrt cache); agent-facing wrapper over `compileTopic({ force: true })`
- `src/app/api/scribe/explain/route.ts` — already defined in U5; reaffirm that it's the canonical agent-facing entry
- `src/app/api/scribe/audit/route.ts` — `GET` endpoint returning paginated `ScribeAudit` rows scoped to the authenticated user (for agent review of clinical trail)
- `docs/agent-api.md` — append the three endpoints (note: only if this doc already exists per project convention; otherwise skip the doc and rely on OpenAPI-style JSDoc on the routes)
- `src/app/api/scribe/*.test.ts` — auth + scope tests per route

**Approach:**
- Endpoints mirror the existing convention in `src/app/api/` (Zod-validated body, `getCurrentUser()` auth, JSON response).
- `audit/route.ts` returns at most 50 rows per page, newest first, redacted to the current user.

**Patterns to follow:** `src/app/api/insights/weekly/route.ts` + existing API conventions.

**Execution note:** Pragmatic.

**Test scenarios:**
- Happy: `POST /api/scribe/compile` re-compiles a topic and returns the compiled output.
- Edge: `GET /api/scribe/audit?cursor=...` paginates correctly.
- Error: cross-user audit access returns 404 (never 403 — don't leak existence).

**Verification:** `pnpm test src/app/api/scribe` green.

### U7 — Clinical audit log + telemetry

- [ ] `audit.ts` + `telemetry.ts` helpers land
- [ ] share-redaction pipeline extended to strip `scribeAudit`; tests green
- [ ] telemetry fields emitted on every scribe output

**Goal:** Every scribe utterance, compile-time or runtime, is persisted with enough fidelity for clinical review.

**Files:**
- `src/lib/scribe/audit.ts` — `appendAudit` helper (thin wrapper over `src/lib/scribe/repo.ts::appendAudit`), called from both `src/lib/topics/compile.ts` and `src/app/api/scribe/explain/route.ts`
- `src/lib/scribe/telemetry.ts` — emits structured logs on every audit write (reuse existing logger if present; else `console.log` in the project's conventional shape)
- `src/lib/share/redaction.ts` — extend share-redaction pipeline to strip `scribeAudit` from `/r/[slug]` views
- `src/lib/share/redaction.test.ts` — extend coverage

**Approach:**
- The `ScribeAudit` write happens *inside* the same transaction/request as the user-visible output (compile or explain) so we can never have a rendered scribe output without its audit row.
- Telemetry fields: `event: 'scribe.output'`, `topicKey`, `mode`, `safetyClassification`, `toolCallCount`, `latencyMs`, `modelVersion`. No prompt/output content in telemetry (that lives in the audit row, not the log stream).

**Patterns to follow:** `src/lib/share/redaction.ts` existing pass pattern.

**Execution note:** Test-first for redaction — the share-redaction surface is security-sensitive.

**Test scenarios:**
- Happy: a share view of a topic with scribe annotations still renders annotations but exposes no `scribeAudit` rows.
- Edge: a user with zero audit rows still renders the topic (no crash on empty set).
- Regression: existing redaction tests still pass.

**Verification:** `pnpm test src/lib/share/redaction.test.ts` green; manual inspection of `/r/demo-navigable-record` network response confirms no `scribeAudit` leakage.

### U8 — Regulatory copy + disclaimer persistence + record footer surfacing

- [ ] `Disclaimer` component land; mounted on topic pages + explain cards
- [ ] `TopicLogFooter` extended with scribe-review events
- [ ] copy-drift snapshot test green; legal review flagged as ship gate

**Goal:** R18 persistent disclaimer lives everywhere scribe output lives; scribe metadata (model, last-compile timestamp) surfaces in the record footer.

**Files:**
- `src/components/scribe/disclaimer.tsx` — single-source-of-truth copy for the decision-support disclaimer
- `src/app/(app)/topics/[topicKey]/page.tsx` — mount `<Disclaimer />` at page root
- `src/components/scribe/inline-explain-card.tsx` — render `<Disclaimer compact />` in card footer
- `src/components/record/topic-log-footer.tsx` — extend footer to show "Last reviewed by scribe: {topic} · {relative time}" sourced from the most recent `ScribeAudit` row for each topic
- `src/app/(app)/r/[slug]/page.tsx` — `<Disclaimer />` remains on share view; scribe metadata redacted to "Reviewed by scribe" without timestamp
- `docs/regulatory-copy.md` — capture disclaimer copy + rationale (*create only if this file doesn't already exist*; if it does, append)
- `src/components/scribe/disclaimer.test.tsx` — snapshot test to guard copy drift

**Approach:**
- Disclaimer copy (first draft, subject to legal review before ship): "This is decision-support information to help you understand your own health data. It is not medical advice. Anything actionable should be discussed with a qualified clinician."
- Footer surfacing uses the existing `TopicLogFooter` pattern — scribe reviews appear alongside ingest events in the log.

**Patterns to follow:** `src/components/record/topic-log-footer.tsx` existing event rendering; `src/lib/share/redaction.ts` for the share-view redaction.

**Execution note:** Pragmatic; legal review is a ship gate, not an implementation gate.

**Test scenarios:**
- Happy: disclaimer renders on all three topic pages and in every explain card.
- Regression: share view redaction of scribe metadata verified in U7 still holds.
- Copy-drift: snapshot test fails if disclaimer text is edited without snapshot refresh.

**Verification:** `pnpm test src/components/scribe/disclaimer.test.tsx` green; manual review of all three topics + `/r/demo-navigable-record` + a fresh explain card.

## Risks

- **R-1. Clinical LLM output drifts across model upgrades.** Mitigation (D9): `modelVersion` pinned on `Scribe` at seed time; `ScribeAudit.modelVersion` captures actual version used per call; compile pipeline force-recompiles on model-version drift (U4 test); a version bump is an explicit migration + re-review cycle, not a silent upgrade.
- **R-2. Policy too strict → over-routing to GP-prep, scribe feels unhelpful.** Mitigation: tune `minCitationDensityPerSection` and `allowedJudgmentKinds` per topic during internal review; Iron starts strictest, Sleep mid, Energy widest (matches the topic's graph-native-synthesis nature from the origin doc).
- **R-3. Compile-pipeline latency grows with scribe annotations.** Current compile is a single LLM call; this plan keeps that — the scribe annotations ride inside the same response. Mitigation: no second round-trip; cache already in place via `graphRevisionHash`.
- **R-4. Selection→Explain on mobile is gesture-hostile.** Mitigation: start with desktop-primary UX for v1 (record-family is already desktop-leaning per plan 001). Tap-to-select fallback covered by iOS/Safari's default text selection.
- **R-5. Audit log grows unbounded.** Mitigation: deferred. Rough sizing — 3 topics × runtime explains per user-session × 2KB prompt+output ≈ negligible for v1 user count. Add retention policy in a follow-on plan if it becomes material.
- **R-6. Cross-topic or cross-user leakage via tool handlers.** Mitigation (D10): user-scoping is enforced by the executor — handler signatures require a resolved `userId`, no default-user fallback, no escape hatch in v1. Topic scoping via `getSubgraphForTopic` covers the topic dimension. Unit tests cover both dimensions across all handlers (U3 error-table).
- **R-7. The "clinical-LLM training pipeline" dependency stays vague.** Mitigation: this plan consumes a configurable `model` string; swapping from `openrouter/openai/gpt-4.1` to a clinical-trained model when that system ships is a config change per `Scribe` row.
- **R-8. Audit coverage gap on transport failures.** Mitigation (D11): audit upsert is keyed by `requestId` and lands *before* the final policy gate, so client disconnects, SSE buffering failures, and server crashes after LLM response all still produce an audit row. Covered by U5 disconnect test.

## Deferred to Implementation

- Exact `forbiddenPhrasePatterns` regex list — seed from existing `src/lib/llm/linter.ts` patterns if present; otherwise draft on first pass and harden via U2 test coverage.
- Reference-range source-of-truth — either `GraphNode.meta` (if the ingest pipeline already populates it) or a static `src/lib/scribe/reference-ranges.ts` constants table. Decide by reading `src/lib/graph/ingest/*` at implementation start.
- Whether `ScribeAudit.toolCalls` stores raw JSON or a denormalized summary — decide after U3 is wired and we see actual shape + size.
- Error-surface UX on scribe policy rejection in the runtime path (U5): either toast + collapse, or replace card body with the fallback copy inline. Pick whichever reads better during visual iteration.
- SSE framing format for citation pills — stream the final citations payload as a trailing `event: citations` frame, or embed inline token-by-token. Implementation decides based on LLM tool-call timing.
- Whether `docs/agent-api.md` exists — check at U6 start; if not, skip doc scaffolding.

## Open Questions (none blocking)

All blocking product questions from the origin document were resolved in plans 001/002 and the ce:plan interaction above. None remain.

## Sequencing

Recommended order: **U1 → U2 → U3 → U4 → U7 (share redaction)** sequentially (each depends on the prior). **U5, U6, U8** can parallelize after U4 lands. U7 telemetry hooks are folded into U4/U5 as they ship; only the share-redaction slice of U7 blocks U8's share-view work.
