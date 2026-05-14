---
title: "feat: Multi-provider scribe routing via Vercel AI Gateway"
type: feat
status: deferred
date: 2026-05-14
origin: docs/plans/2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md
---

# feat: Multi-provider scribe routing via Vercel AI Gateway

## Overview

Migrate the scribe LLM client from Anthropic-direct to provider-agnostic via [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), enabling per-scribe model selection across providers (Anthropic, OpenAI, OpenRouter, etc.). The existing `Scribe.model` column already supports this — it's a free-form string per row. The `ScribeLLMClient` interface (`src/lib/scribe/llm.ts`) is already abstracted; today's `AnthropicScribeLLMClient` is one implementation. This plan adds a second.

**Deferred**: ship when there's signal that pulls it forward (see Trigger Conditions). Drafted alongside the Anthropic-only fix in [2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md](2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md) so the architectural runway is documented while the urgent bug ships.

## Problem Frame

The product thesis is that **agents trained on clinical datasets perform differently on different base models**. A cardio-specialist scribe may reason best on Anthropic Claude; a fast-classification scribe (intake document type detection, biomarker name normalisation) may run cheaper and faster on a Haiku-class or GPT-mini-class model; a specialised model fine-tuned by us for one task may live entirely on OpenRouter or a private endpoint.

Today, every scribe runs on Anthropic Sonnet 4.6 via `AnthropicScribeLLMClient`. The `Scribe.model` column accepts arbitrary strings, but the runtime guard (post-fix #001) only accepts `claude-*` ids because the client implementation only knows the Anthropic SDK. To enable per-scribe-type model selection, the client needs to be multi-provider.

Vercel AI Gateway is the natural target on the existing stack:
- Already part of Vercel (no infra cost, no new account boundary)
- Unified `provider/model` string contract: `anthropic/claude-sonnet-4-6`, `openai/gpt-4o`, `openrouter/<route>`, etc.
- Observability, fallback, zero data retention built in
- Streaming + tool-calling unified across providers (handled by the AI SDK)

## Requirements Trace

- **R1.** A scribe row with `model: 'anthropic/claude-sonnet-4-6'`, `model: 'openai/gpt-4o'`, or `model: 'openrouter/<route>'` routes correctly to the named provider.
- **R2.** Bare `claude-*` strings (the post-fix-#001 shape) continue to work — either by routing through `anthropic/` aliasing, or by a one-time migration of existing rows. **No drop in service for users mid-migration.**
- **R3.** Per-scribe-type model assignment is configurable — e.g., the cardio scribe and the general scribe can have different defaults set at scribe-creation time without code changes per type.
- **R4.** Streaming, tool-calling, citation extraction, and error mapping behave identically across providers (or fail in well-typed ways that the application layer can handle).
- **R5.** Cost and latency are observable per-scribe-type via the AI Gateway's built-in dashboards.

## Scope Boundaries

- **Not** rewriting every existing scribe to use a different model. The migration ships compatibility-first; per-scribe-type model overrides are a follow-on once the new client is proven.
- **Not** removing `AnthropicScribeLLMClient`. Keeps the option to revert to direct-SDK if the Gateway has an issue, and tests stay self-contained.
- **Not** replacing the `ScribeLLMClient` interface. The point of the interface is that this migration is "add an implementation," not "change the contract."
- **Not** building fine-tuning infrastructure, model evaluation tooling, or per-scribe-type A/B routing. Those are downstream of this work.

## Trigger Conditions (when to pull this forward)

Ship this when **any** of the following becomes true:

| Trigger | Why |
|---|---|
| A clinical-specialist scribe is built that's known to underperform on Sonnet relative to a non-Anthropic model | The core product thesis materialises and we have evidence in hand |
| Monthly Anthropic spend exceeds ~$200/mo OR latency p50 on classification tasks > 800ms | Cost / latency pressure makes routing routine tasks to cheaper/faster models worth the migration |
| Resilience: an Anthropic outage causes >1h of user-visible downtime | Multi-provider failover (via AI Gateway's built-in fallback) becomes urgent |
| OpenRouter (or another provider) account is provisioned with billing AND there's at least one concrete model in mind | The blocking external dependency clears |
| MCP audit log (`pnpm mcp:audit`) shows 100+ daily tool calls AND tool latency p50 > 2s | Real volume + real performance signal — both Gateway observability and provider diversity become valuable |
| First specialist scribe ships that NEEDS a non-Anthropic model from day one | Forcing function — no point shipping a feature that requires this infra unless the infra exists |

**Anti-triggers** (signals NOT to pull forward):
- "We want to try GPT-4o because it's new" — engineering curiosity isn't a real trigger.
- Cost optimisation pre-users (zero users → zero meaningful cost).
- Generic resilience hedging without observed outage pain.

## Context & Research

### Existing patterns to extend

- `src/lib/scribe/llm.ts` — defines `ScribeLLMClient` interface, `ScribeLLMClientRequest`, `ScribeLLMClientResponse`. **Already provider-agnostic.**
- `src/lib/scribe/llm-anthropic.ts` — current `AnthropicScribeLLMClient` implementation. The new `GatewayScribeLLMClient` mirrors this file's structure; only the SDK boundary differs.
- `src/lib/scribe/llm-anthropic.test.ts` — the test surface to replicate for the new client.
- `src/lib/scribe/repo.ts` — `isAcceptableModelForCurrentClient` helper (post-fix-#001). **This is the one site that widens.**
- `src/lib/scribe/execute.ts:211` — the runtime gate. Unchanged by this migration; it calls the helper, and the helper's behaviour widens.

### Vercel AI Gateway shape

- Install: `npm install ai` (AI SDK v6+) plus provider plugins as needed.
- Usage (directional sketch, not implementation):
  ```ts
  import { gateway } from 'ai';
  const result = await gateway.streamText({
    model: 'anthropic/claude-sonnet-4-6', // or 'openai/gpt-4o', etc.
    messages,
    tools,
  });
  ```
  *(Directional guidance, not implementation specification.)*
- AI Gateway handles auth (single `AI_GATEWAY_API_KEY` or Vercel-team-scoped credential), provider routing, observability, and (optionally) automatic fallback between providers.

### Things to verify at execution time (deferred — see "Deferred to Implementation")

- The AI SDK's streaming protocol vs the Anthropic SDK's `MessageStreamEvent` shape — does the existing `streamCallbacks` contract in `llm.ts` need a thin shim, or does it map 1:1?
- Tool-call schema differences between Anthropic and OpenAI — Anthropic returns `input_schema` (JSON Schema draft-7), OpenAI returns `parameters` (also draft-7 but with stricter `additionalProperties` rules). Whether AI SDK normalises this or leaves it to the caller.
- Streamed citation surfacing — Anthropic Sonnet 4.6 supports citations in a specific way; non-Anthropic models won't. May need to gracefully drop citation expectations for non-Anthropic scribes.

## Key Technical Decisions

- **Vercel AI Gateway over direct multi-SDK.** Single auth boundary, built-in observability, consistent streaming protocol across providers. Cost is one new dependency (`ai`).
- **`Scribe.model` adopts `provider/model` shape for new rows.** Existing bare `claude-*` rows continue to work via an alias in `isAcceptableModelForCurrentClient` (treat `claude-*` as shorthand for `anthropic/claude-*`). DB migration is optional, not blocking.
- **Keep `AnthropicScribeLLMClient` as a fallback path.** A boolean env var (`USE_AI_GATEWAY=true/false`) selects the client at startup. Ship Gateway-on by default in preview; production-on after one week of preview soak.
- **Per-scribe-type defaults via a config table or constant map** rather than scattered model strings. E.g., `SCRIBE_MODEL_DEFAULTS: Record<ScribeType, string>` in `repo.ts`. Single source of truth for "which model for which specialist."

## Open Questions (deferred to execution)

- Does AI SDK v6's `gateway.streamText` cover the full streaming contract our `ScribeLLMClient` needs (tool-call deltas, message-stop reasons, usage telemetry), or do we need to drop to provider-specific streamText calls + manual routing? **Answer at execution time by reading the SDK source.**
- Whether to migrate existing DB rows from `claude-sonnet-4-6` → `anthropic/claude-sonnet-4-6` immediately (one-time script) or rely on the alias in the helper indefinitely. Bias toward script — the alias becomes load-bearing legacy if kept too long.
- AI Gateway pricing model at our volume — flat per-token markup, or per-request? **Answer when Trigger #2 fires by checking current AI Gateway pricing.**

## Implementation Units

*(Estimated 4-6 units, ~1-2 days of work. Concrete unit breakdown to be filled in when the plan is pulled forward — keeping it sketchy here avoids the deepening reading stale by the time it ships.)*

- [ ] **Unit 1: Add AI SDK + Gateway dependency, env var, basic client scaffold**
  - Install `ai` package + any provider plugins.
  - Add `AI_GATEWAY_API_KEY` (or equivalent) to `vercel env`.
  - Create `src/lib/scribe/llm-gateway.ts` implementing `ScribeLLMClient`.
  - **Tests:** none yet (scaffold only).

- [ ] **Unit 2: Implement streaming + tool-call mapping**
  - Replicate `AnthropicScribeLLMClient.turn()` behaviour using `gateway.streamText`.
  - Map streaming events to the `streamCallbacks` shape `execute.ts` expects.
  - Map AI SDK errors → existing `LLMAuthError`, `LLMRateLimitError`, `LLMTransientError`, `LLMValidationError` classes.
  - **Tests:** mirror `llm-anthropic.test.ts` cases against the new client using mocked AI SDK.

- [ ] **Unit 3: Widen `isAcceptableModelForCurrentClient` allowlist**
  - Accept `anthropic/`, `openai/`, `openrouter/` prefixes plus the legacy bare `claude-*` shape.
  - Update tests in `repo.test.ts`.

- [ ] **Unit 4: Client selection via env var**
  - Add `getScribeLLMClient()` (already exists per session research) factory branching on `USE_AI_GATEWAY`.
  - Keep both clients in the build; selection is runtime.

- [ ] **Unit 5: Per-scribe-type model defaults**
  - Add `SCRIBE_MODEL_DEFAULTS: Record<ScribeTopicKey, string>` in `repo.ts`.
  - `getOrCreateScribeForTopic` reads from this map instead of using the single `DEFAULT_SCRIBE_MODEL`.
  - Keep `DEFAULT_SCRIBE_MODEL` as the catch-all for unknown topic keys.

- [ ] **Unit 6 (optional): One-off DB migration**
  - Rewrite existing `claude-*` rows to `anthropic/claude-*` so the alias in the helper can be removed.
  - Same shape as `scripts/fix-scribe-model.ts` from plan #001.

## System-Wide Impact

- **Interaction graph:** `getScribeLLMClient` (factory) → either `AnthropicScribeLLMClient` (today) or `GatewayScribeLLMClient` (post-migration). Everything above the interface is unchanged: `execute.ts`, `runChatTurn`, `/api/chat/send`, MCP tool-call paths.
- **Error propagation:** New client must map AI SDK errors to the same domain error classes the application catches. The route handlers in `src/app/api/scribe/compile/route.ts` and `src/app/api/chat/send/route.ts` should require zero changes.
- **API surface parity:** MCP scribe tools (recently shipped) use the same `execute()` pipeline — they get multi-provider routing for free.
- **Unchanged invariants:**
  - `Scribe.model` remains a free-form `String` (non-null).
  - `ScribeLLMClient` interface contract unchanged.
  - Streaming + tool-calling user-facing UX unchanged.
  - Audit-log shape unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| AI SDK v6 evolves between now and pull-forward; the sketch above may be stale | Re-read SDK docs at execution time. The architectural shape (factory + interface implementation) is robust to SDK details |
| Tool-call schema differences between providers cause subtle bugs | Add provider-aware tool-call normalisation in `GatewayScribeLLMClient`. Test with at least one Anthropic and one OpenAI model |
| Cost spikes when we route routine tasks to a new provider with different pricing | AI Gateway dashboards + a per-day spend alarm. Roll back via the env var if needed |
| Citation surfacing breaks for non-Anthropic scribes | Make citations optional in the `ScribeLLMClientResponse` shape; non-Anthropic scribes return `citations: []` rather than failing |
| Provider-specific behaviours (e.g. Anthropic Sonnet 4.6's specific reasoning style) become depended-on in scribe prompts | Document per-scribe-type model assignments + run a prompt-eval sweep when changing a scribe's default model |

## Dependencies / Prerequisites

- OpenRouter / OpenAI account provisioned with billing (or any non-Anthropic provider the team wants to enable)
- AI Gateway API key generated in Vercel dashboard
- Trigger condition (above) met — don't ship this on speculation

## Documentation / Operational Notes

- Update `docs/strategy/cto-architecture-*.md` to reflect multi-provider scribe routing when this ships
- File a `/ce:compound` writeup capturing the interface-first-multi-provider pattern for institutional knowledge
- Update onboarding docs (if/when they exist) to describe how to add a new provider

## Sources & References

- **Origin (the fix this defers from):** [docs/plans/2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md](2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md)
- **Vercel AI Gateway docs:** https://vercel.com/docs/ai-gateway
- **Vercel AI SDK docs:** https://sdk.vercel.ai/
- **Existing interface:** `src/lib/scribe/llm.ts`
- **Existing implementation:** `src/lib/scribe/llm-anthropic.ts`
- **Existing test surface to mirror:** `src/lib/scribe/llm-anthropic.test.ts`
- **Per-scribe model selection callsite:** `src/lib/scribe/repo.ts` (the `getOrCreateScribeForTopic` function + `DEFAULT_SCRIBE_MODEL`)
