---
title: "fix: Self-healing Scribe.model guard + DB cleanup for legacy OpenRouter strings"
type: fix
status: active
date: 2026-05-14
---

# fix: Self-healing Scribe.model guard + DB cleanup for legacy OpenRouter strings

## Overview

P0 production bug: `/ask` returns Anthropic 404 `not_found_error: model: openrouter/openai/gpt-4.1` on every chat send. The `Scribe.model` column holds a stale OpenRouter-style identifier from when the app routed through a multi-provider gateway. The fallback `scribe.model ?? DEFAULT_SCRIBE_MODEL` never fires because the column is non-null; the bad string flows straight into the Anthropic SDK and is rejected.

The fix has three parts:

1. **Update `DEFAULT_SCRIBE_MODEL`** in `src/lib/scribe/repo.ts` so new scribe rows seed with a valid Anthropic id. (Currently the constant is still `openrouter/openai/gpt-4.1` — the original feature description claimed otherwise, but git disagrees.)
2. **Self-healing guard** at both fallback sites — reject non-Anthropic strings and fall through to the now-valid default.
3. **One-off DB cleanup** so the guard never has to fire in steady-state.

## Problem Frame

The Anthropic SDK rejects model strings it doesn't recognise with a 404. The `Scribe.model` column was populated months ago when the app talked to OpenRouter (`openrouter/openai/gpt-4.1`), and `getOrCreateScribeForTopic` only **creates**, never updates — so existing rows are permanently stuck. The constant on disk has also not been refreshed, so even if we wiped the column to `NULL` the fallback would route to the same broken id. This is currently breaking every signed-in user's first chat message in production.

**Discovered during pre-flight cold-walkthrough on 2026-05-14**, immediately after the activation funnel instrumentation (#116) landed. Blocks seed-cohort outreach.

## Requirements Trace

- **R1.** A chat send on `/ask` reaches the Anthropic API with a valid model string for every user — new and existing.
- **R2.** Any future stale model string in the DB (not just `openrouter/openai/gpt-4.1`) routes to the default rather than the Anthropic SDK.
- **R3.** Existing dirty rows are cleaned up so the guard becomes a defensive check, not a daily load-bearer.
- **R4.** New scribe rows seed with a valid Anthropic model id by default.

## Scope Boundaries

- **Not** touching `src/lib/llm/client.ts` or `src/lib/scribe/llm-anthropic.ts`. The bug is entirely in the `scribe.model` value, not in the SDK wrapper.
- **Not** introducing a model-config service, a feature flag, or env-driven model selection. Constant + guard is sufficient.
- **Not** adding model-version tracking, drift detection, or migrations infrastructure beyond what's needed here.

### Deferred to Separate Tasks

- **Long-term: type `Scribe.model` as a domain enum** (or validate at write time in `repo.ts`). Worth doing once we have a stable allowlist of supported models. Out of scope for this fix.
- **Model-config telemetry** — log when the guard fires so we can detect new sources of bad data. Defer until/unless a second class of stale string appears in the audit log.

## Context & Research

### Relevant Code and Patterns

- `src/lib/scribe/repo.ts:20` — `DEFAULT_SCRIBE_MODEL` constant (currently `'openrouter/openai/gpt-4.1'`)
- `src/lib/scribe/repo.ts:128` — `getOrCreateScribeForTopic` creates new scribes with `options.model ?? DEFAULT_SCRIBE_MODEL`
- `src/lib/scribe/execute.ts:211` — runtime turn execution: `model: scribe.model ?? DEFAULT_SCRIBE_MODEL` inside the LLM-call loop
- `src/lib/scribe/execute.ts:28` — `DEFAULT_SCRIBE_MODEL` is already imported from `./repo`; no new imports needed
- `src/lib/scribe/llm-anthropic.ts` — passes the model id verbatim to `this.sdk.messages.create({ model, ... })`. Untouched by this plan; it is correctly opaque to the model string.
- `prisma/schema.prisma` → `Scribe.model` — `String` (non-null). The non-nullness is why `??` doesn't help today.

### Patterns from this repo's own scripting conventions

- All one-off scripts run via `tsx`, not `ts-node`. See `package.json`:
  - `scripts/metrics/mcp-audit.ts` → `"mcp:audit": "tsx scripts/metrics/mcp-audit.ts"`
  - `scripts/demo/seed-metabolic-persona.ts` → `"demo:seed": "tsx scripts/demo/..."`
- Import `prisma` from `'@/lib/db'` (the path alias works in `tsx` too — `mcp-audit.ts` uses `new PrismaClient()` directly because it's a long-running CLI; for a one-shot we should use the singleton).

### Institutional Learnings

- `docs/solutions/` contains no entries on stale-config DB rows or model-string migrations. This fix is greenfield in that sense — worth a `/ce:compound` writeup once landed.

## Key Technical Decisions

- **Allowlist (`startsWith('claude-')`), not denylist (`!startsWith('openrouter/')`).** The request proposed denylist; the allowlist is more durable. The day someone routes through a different provider gateway with prefix `gemini/`, `openai-direct/`, or anything else, denylist silently fails again — allowlist catches it.
- **Extract the allowlist as a named helper `isAcceptableModelForCurrentClient(m)` in `repo.ts`**, not an inline expression at the execute callsite. The allowlist *tracks the current `ScribeLLMClient` implementation's capabilities*, and that implementation will widen — see [2026-05-14-002-feat-multi-provider-scribe-routing-plan.md](2026-05-14-002-feat-multi-provider-scribe-routing-plan.md) for the migration target (Vercel AI Gateway, per-scribe-model selection across providers). When that migration happens, the helper widens at one site instead of grep-and-replace across execute.ts and any future callsite. Single source of truth.
- **DB cleanup query uses `startsWith: 'openrouter/'`, not exact-string match.** The error in production happened to be `openrouter/openai/gpt-4.1`, but `openrouter/anthropic/claude-3-sonnet` was also a known historical model. Prefix match catches both without enumerating.
- **Three units, not two — `DEFAULT_SCRIBE_MODEL` constant must be updated.** The request implied commit `3e2a7b0` had already updated it. Verification against the current file disproves that — line 20 still reads `'openrouter/openai/gpt-4.1'`. Without updating the constant, the guard's fallback target is itself invalid.
- **Order of operations: Unit 1 → Unit 2 → Unit 3.** Constant must land before guard (otherwise the guard's fallback is broken), and guard must land before script (otherwise the live site keeps 404'ing for any user who hits the chat between deploy and script-run).
- **Script is idempotent.** `updateMany` with a `startsWith` filter matches zero rows after the first successful run, so re-execution is safe.

## Open Questions

### Resolved During Planning

- **What's the correct Anthropic model id?** `claude-sonnet-4-6` per the environment context (also `claude-opus-4-7`, `claude-haiku-4-5-20251001` available). Sonnet is the right default for chat: stronger than Haiku, cheaper and faster than Opus.
- **Should the guard also live in `repo.ts:128`?** No. Creation path takes `options.model ?? DEFAULT_SCRIBE_MODEL`; once `DEFAULT_SCRIBE_MODEL` is fixed, all NEW rows are valid. The guard's only job is to heal EXISTING dirty rows on the runtime path, which is `execute.ts:211`.

### Deferred to Implementation

- **Whether `Scribe.temperature` needs the same treatment.** Probably not (it's a number, validated implicitly by SDK type coercion), but worth a 30-second check during execution.

## Implementation Units

- [ ] **Unit 1: Update `DEFAULT_SCRIBE_MODEL` to a valid Anthropic id**

**Goal:** Seed all new Scribe rows with a model the Anthropic SDK actually accepts.

**Requirements:** R1, R4

**Dependencies:** None.

**Files:**
- Modify: `src/lib/scribe/repo.ts` (line 20 — single-line value change)
- Test: `src/lib/scribe/repo.test.ts` (new assertion pinning the constant's shape)

**Approach:**
- Change the string literal from `'openrouter/openai/gpt-4.1'` to `'claude-sonnet-4-6'`.
- This is a one-line edit. The constant is already imported wherever it's used; no other callsite changes.

**Patterns to follow:**
- Existing `DEFAULT_SCRIBE_TEMPERATURE` (a sibling constant in the same file) is the shape convention.

**Test scenarios:**
- *Happy path*: Add an assertion in `repo.test.ts` that `DEFAULT_SCRIBE_MODEL.startsWith('claude-')`. This pins the constant against silent regression to another non-Anthropic provider in the future. Cheap insurance.

**Verification:**
- `grep -n "openrouter" src/lib/` returns no hits in `scribe/` (other matches in the repo are acceptable — historical text in comments, etc.).
- `repo.test.ts` passes the new assertion.

---

- [ ] **Unit 2: Self-healing guard in `execute.ts`**

**Goal:** Reject model strings that the current `ScribeLLMClient` implementation can't handle, falling back to `DEFAULT_SCRIBE_MODEL`. This heals existing dirty rows at runtime AND keeps a single source of truth for "what models does the current client accept" so the future multi-provider migration is a one-line widening.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (the fallback target must be valid before this guard means anything).

**Files:**
- Modify: `src/lib/scribe/repo.ts` (add `isAcceptableModelForCurrentClient` helper alongside `DEFAULT_SCRIBE_MODEL`)
- Modify: `src/lib/scribe/execute.ts` (line 211 — use the helper)
- Test: `src/lib/scribe/repo.test.ts` (extend; covers the helper's allowlist behaviour)
- Test: `src/lib/scribe/execute.test.ts` (extend; covers the end-to-end self-heal at the execute callsite)

**Approach:**
- In `repo.ts`, export a new helper:

  ```ts
  // Tracks what the CURRENT ScribeLLMClient implementation can handle.
  // Today: AnthropicScribeLLMClient → Anthropic SDK → `claude-*` only.
  // Future: when llm-gateway.ts lands (see plan
  // 2026-05-14-002-feat-multi-provider-scribe-routing-plan.md), widen
  // this allowlist to accept `provider/model` shapes — that's the
  // ONLY site that changes for multi-provider routing.
  export function isAcceptableModelForCurrentClient(
    m: string | null | undefined,
  ): m is string {
    return typeof m === 'string' && m.startsWith('claude-');
  }
  ```

  *(Code above is directional guidance, not implementation specification.)*

- In `execute.ts:211`, replace `model: scribe.model ?? DEFAULT_SCRIBE_MODEL` with `model: isAcceptableModelForCurrentClient(scribe.model) ? scribe.model : DEFAULT_SCRIBE_MODEL`.
- Add the helper to the existing import line at `execute.ts:28` (`DEFAULT_SCRIBE_MODEL` is already imported from `./repo`; the helper joins it).

**Patterns to follow:**
- `DEFAULT_SCRIBE_MODEL` and `DEFAULT_SCRIBE_TEMPERATURE` in `repo.ts` are the shape convention for module-level exports.
- The forward-pointing comment style mirrors existing comments in `route.ts` (`src/app/api/mcp/route.ts`) that name future-state plan documents.

**Test scenarios:**

*In `repo.test.ts` (helper unit tests):*
- *Happy path*: `isAcceptableModelForCurrentClient('claude-sonnet-4-6')` → `true`.
- *Happy path — future Claude family*: `'claude-opus-4-7'`, `'claude-haiku-4-5-20251001'` → `true`.
- *Self-heal*: `'openrouter/openai/gpt-4.1'` → `false`.
- *Edge case — empty string*: `''` → `false`.
- *Edge case — unknown future provider*: `'gemini/pro'`, `'openai/gpt-4o'` → `false`. Pins the allowlist semantics against regression to denylist.
- *Edge case — null/undefined*: both → `false`.

*In `execute.test.ts` (end-to-end self-heal at the callsite):*
- *Self-heal happy path*: scribe row with `model: 'claude-sonnet-4-6'` → `req.llm.turn` is called with `model: 'claude-sonnet-4-6'`.
- *Self-heal — bug being fixed*: scribe row with `model: 'openrouter/openai/gpt-4.1'` → `req.llm.turn` is called with `model: <DEFAULT_SCRIBE_MODEL>`, NOT the OpenRouter string.

Use the same `llm` mock pattern existing tests in `execute.test.ts` use — assert against the `model` argument passed to the turn call rather than against the SDK directly. Don't reach into `llm-anthropic.ts`.

**Verification:**
- All 5 test scenarios pass.
- The full `execute.test.ts` suite still passes (no regression on the existing tests).
- A manual `/ask` send against a scribe row with `model = 'openrouter/openai/gpt-4.1'` in the DB returns a streamed response, not a 404.

---

- [ ] **Unit 3: One-off DB cleanup script**

**Goal:** Update every Scribe row with a stale OpenRouter-prefixed model to the new default, so the guard becomes a defensive backstop rather than a daily-firing path.

**Requirements:** R3

**Dependencies:** Unit 1 (the value the script writes is `DEFAULT_SCRIBE_MODEL` from the updated constant). Unit 2 not strictly required, but ideal order ships Unit 2 first so the live site is healed before the cleanup runs.

**Files:**
- Create: `scripts/fix-scribe-model.ts`
- Modify: `package.json` (add `"scribe:fix-model": "tsx scripts/fix-scribe-model.ts"` entry under `scripts`)

**Approach:**
- Use `prisma.scribe.updateMany` with `where: { model: { startsWith: 'openrouter/' } }` and `data: { model: 'claude-sonnet-4-6' }` — prefix match catches every OpenRouter-prefixed historical model, not just the one observed in the bug report.
- Import `DEFAULT_SCRIBE_MODEL` from `src/lib/scribe/repo` so the script doesn't hardcode the new value (avoids drift if Unit 1's choice is ever revised).
- Log `Updated N scribe rows` and disconnect cleanly.
- Use `tsx` (not `ts-node` — the request's suggestion was wrong on this; the repo standardises on `tsx`, see all the other entries in `package.json`).
- Script is idempotent: a second run with no remaining bad rows matches zero, prints `Updated 0 scribe rows`, exits 0.

**Patterns to follow:**
- `scripts/metrics/mcp-audit.ts` for the general shape (Prisma client setup + `try { ... } finally { disconnect }`).
- `prisma/seed.ts` for a one-shot script that runs to completion and exits.

**Test scenarios:**
- *Test expectation: none — one-off script, manual execution against prod DB.* The behavioural guard for "did this work?" lives in Unit 2's manual `/ask` verification (post-script, the guard should never fire on the cleaned rows because they now hold valid model strings).
- If we want belt-and-braces: the script can `findMany({ where: { model: { startsWith: 'openrouter/' } } })` at the end and assert the count is zero, exiting non-zero otherwise. Recommended.

**Verification:**
- `pnpm scribe:fix-model` against a DB containing stale rows reports the count updated (matches the expected number of users who chatted before today).
- A re-run reports `Updated 0 scribe rows`.
- A direct SQL probe `SELECT count(*) FROM "Scribe" WHERE model LIKE 'openrouter/%'` returns 0.

## System-Wide Impact

- **Interaction graph:** `/api/chat/send` → `runChatTurn` (`src/lib/chat/turn.ts`) → `execute()` (`src/lib/scribe/execute.ts`) → `req.llm.turn(...)` → `AnthropicScribeLLMClient.turn()` (`src/lib/scribe/llm-anthropic.ts`) → Anthropic SDK. The guard intercepts at the `execute()` step; everything downstream is unchanged.
- **Error propagation:** Existing `LLMAuthError`, `LLMRateLimitError`, `LLMTransientError`, `LLMValidationError` mapping in `llm-anthropic.ts` is unaffected. The `not_found_error` from a bad model id will simply stop occurring once the guard lands.
- **State lifecycle risks:** None. The script's `updateMany` is atomic; the constant is a read-only static. No partial-write or cache invalidation concerns.
- **API surface parity:** The MCP scribe tool catalog (recently shipped, #105-#114) uses the same `execute()` pipeline — so any MCP `tools/call` that exercises the scribe also benefits from the guard. **Confirmed not broken:** MCP `tools/list` and `list_graph_index` don't invoke the LLM client, they only read graph state.
- **Integration coverage:** Unit 2's self-heal test exercises the cross-layer interaction (DB row → execute → mock LLM client). The path from `/api/chat/send` all the way to the Anthropic SDK is implicitly covered by existing integration in `turn.test.ts`.
- **Unchanged invariants:** `Scribe.model` remains a `String` (non-null). The schema doesn't change. The LLM wrapper API doesn't change. No new env vars.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Anthropic introduces a non-`claude-` family (e.g. a new model line); the allowlist silently rejects valid ids | Default fallback handles it — request still completes, just with the older model. We'd notice via funnel events / user reports and update the allowlist. |
| `claude-sonnet-4-6` is wrong / not enabled on our account | Verify in `/processing` end-to-end before merging; the state-profile call already exercises the same SDK with the same key. Cowork's pre-flight already saw a successful round-trip, so the key + a Claude model id work together in prod. Sonnet 4.6 specifically may need a one-line check. |
| The script is run before Unit 1/2 deploys, populating rows with the new value while production code still expects the old | Order of operations explicit in the plan: Unit 1 + Unit 2 ship together via Vercel auto-deploy, then Unit 3 runs after the deploy confirms healthy. |
| Another stale model string format exists that doesn't start with `openrouter/` and isn't `claude-` (e.g. a half-migration row with `gpt-4`) | Guard's allowlist catches it; falls back to default. Script's prefix filter misses it, leaving it dirty — but the guard heals on every turn. Acceptable. |

## Documentation / Operational Notes

- After Unit 3 lands and runs, file a `/ce:compound` writeup capturing the "constant + DB-value drift" pattern and the allowlist-over-denylist rationale. Goes in `docs/solutions/`. Cheap institutional knowledge.
- The `package.json` script `scribe:fix-model` is intentionally a one-off — once all rows are migrated, it can be removed in a follow-up PR alongside the script file. Or kept indefinitely as a no-op safety net. Implementer's call.

## Sources & References

- **Bug report:** in-session pre-flight walkthrough, 2026-05-14
- **Affected files:**
  - `src/lib/scribe/repo.ts:20` (the constant)
  - `src/lib/scribe/repo.ts:128` (creation-path fallback — fixed by Unit 1 alone)
  - `src/lib/scribe/execute.ts:211` (runtime fallback — fixed by Unit 2)
- **Pattern references:**
  - `scripts/metrics/mcp-audit.ts` (script shape)
  - `src/lib/scribe/execute.test.ts` (existing test surface to extend)
- **External:** Anthropic model ids are documented at https://docs.anthropic.com/en/docs/about-claude/models — `claude-sonnet-4-6` is the current Sonnet 4.6 id.
