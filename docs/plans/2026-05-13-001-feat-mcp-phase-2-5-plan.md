---
title: "MCP Phase 2.5 — usage-signal-gated hardening + capability additions"
date: 2026-05-13
status: queued
type: plan
origin: docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md
---

# MCP Phase 2.5 — usage-signal-gated hardening + capability additions

Backlog of follow-ups intentionally deferred from the MCP foundation. None block launch. Each item carries an explicit **trigger** — when to pull it forward — and an estimated lift. The launch checklist points at this plan; daily monitoring via `pnpm mcp:audit` is the watch surface.

## Scope boundaries

- **Not** a re-architecture. Foundation (bearer auth, HMAC tokens, audit table, rate-limit, 8-tool allowlist, settings UI, stdio package) stands as-is.
- **Not** a write-tool expansion. The read-only allowlist stays read-only until there's a deliberate product decision to expand it.
- **Not** a compliance pass. Founder-grade for now; revisit when we have real users (waived per founder direction 2026-05-13).

## Items

### 1. Redis-backed rate-limit (closes adv-mcp-001 parallel-burst bypass)

**Trigger:** any single token hits >60 req/min OR active-token count >1000 (whichever first).

**Why:** Current implementation counts `MCPAuditEvent` rows in Postgres — N concurrent requests all see count<60 before any row is written, bypassing the gate.

**Approach:** `INCR` + `EXPIRE` on a Redis key `mcp:rl:<tokenId>:<minuteBucket>`. Returns the new count atomically; reject when >60. Audit row still written async. Vercel KV is the natural fit (already in stack) but Upstash Redis works identically.

**Files:** `src/lib/mcp/rate-limit.ts` (swap implementation), keep API stable so callers don't change.

**Test:** Add a parallel-burst test that fires 100 concurrent requests against a single token and asserts >40 are rejected with `rate_limited`.

**Lift:** ~half a day.

### 2. `get_topic_content` tool

**Trigger:** any user asks an agent "what does my [topic] page say?" and gets back metadata only. Watch via `pnpm mcp:audit --tools` for high `get_topic_overview` call volume without follow-up node fetches (i.e. agents giving up).

**Why:** Agents currently see topic *status* (count, last-updated) via `get_topic_overview` but cannot read the compiled topic body. Topic pages are the most agent-shaped output we produce — withholding them is a leak in the read-only contract.

**Approach:** New scribe tool `get_topic_content(topicKey)` returning the `TopicPage.compiledMarkdown` field. Add to `READ_ALLOWED_TOOLS`. Topic-scoped (not whole-graph).

**Files:** `src/lib/scribe/tools/get-topic-content.ts` (new), `src/lib/scribe/tool-catalog.ts` (register), `src/lib/mcp/tool-adapter.ts` (allowlist).

**Test:** Handler test (happy path, missing topic returns null, cross-user returns null) + route test (tools/list now lists 9 names).

**Lift:** ~2 hours.

### 3. Pagination on `list_graph_index`

**Trigger:** any user with >200 graph nodes. Currently the result is capped at 200; users past that point see a silent truncation.

**Why:** Today's cap of 200 importance-scored nodes was chosen to keep wire size under ~50KB. A power user with 500+ nodes loses tail visibility, agents can't address the missing nodes.

**Approach:** Add `{ cursor?: string, limit?: number }` to the input schema. Cursor encodes the last-seen importance score + nodeId. Default `limit` 200 (unchanged), max 500. Return `nextCursor` in the response.

**Files:** `src/lib/scribe/tools/list-graph-index.ts`, `src/lib/record/aggregate.ts` (probably needs a windowing arg).

**Test:** Snapshot test confirming the 200th and 201st nodes are consistent across two paginated calls.

**Lift:** ~half a day.

### 4. MCP `resources` capability (alongside `tools`)

**Trigger:** Cursor or Claude Desktop ships an `@`-mention picker that uses MCP resources, OR a directory reviewer asks why we don't expose resources.

**Why:** MCP's `resources` capability lets clients show a picker of "things you can reference" (e.g. each topic as a resource). It's a UX upgrade for agents, not a security boundary.

**Approach:** Register the user's topics as resources via `server.registerResource`. URI scheme `morningform://topic/<topicKey>`. Resource read returns the compiled topic markdown (same as `get_topic_content` above).

**Files:** `src/app/api/mcp/route.ts` (capabilities + registrations), `src/lib/mcp/resource-adapter.ts` (new).

**Test:** Route test asserting `resources/list` returns the user's topics and `resources/read` returns the topic body.

**Lift:** ~1 day (mostly figuring out the SDK's resource shape).

### 5. `X-RateLimit-*` headers on every response

**Trigger:** any well-behaved client (Claude Code, Cursor) ships rate-limit-aware retry logic, OR a 429 spike forces us to communicate budget back to clients.

**Why:** Letting clients self-throttle before hitting 429 reduces noise and improves agent UX.

**Approach:** After computing the per-request `remaining` value in `rate-limit.ts`, attach `X-RateLimit-Limit: 60`, `X-RateLimit-Remaining: N`, `X-RateLimit-Reset: <unix ts>` to the response. Both for the success path and the 429 path.

**Files:** `src/app/api/mcp/route.ts`, `src/lib/mcp/rate-limit.ts` (return the remaining count from `checkRateLimit`).

**Test:** Route test asserting the three headers are present on both success and 429.

**Lift:** ~2 hours.

### 6. Snapshot tests on `tools/list` JSON Schema

**Trigger:** any change to a tool's Zod schema, OR a new tool added to the allowlist. (Sooner is fine — this is cheap insurance.)

**Why:** External agents bind to the JSON Schema returned by `tools/list`. A silent shape change (renaming a field, loosening a validator) is a wire-contract break that the type system won't catch — Zod produces JSON Schema via `zodToJsonSchema`, which is opaque to grep.

**Approach:** Add a vitest snapshot test that serializes the full `tools/list` response (all 8 tool schemas) and pins it. PR review surfaces any drift.

**Files:** `src/app/api/mcp/route.snapshot.test.ts` (new).

**Test:** The test itself.

**Lift:** ~1 hour.

### 7. `MCPToken` → `McpToken` schema rename

**Trigger:** anyone touching the token model is annoyed by `prisma.mCPAuditEvent` enough to actually do it. (Aesthetic, low priority.)

**Why:** Prisma's accessor convention lowercases the first letter of the model name, so `MCPToken` becomes `prisma.mCPToken` and `MCPAuditEvent` becomes `prisma.mCPAuditEvent`. `McpToken` would yield `prisma.mcpToken` — cleaner.

**Approach:** Standard Prisma model rename. Migration is a `@@map` to the existing table name (so no data move) plus a global rename of the Prisma accessor in code.

**Files:** `prisma/schema.prisma`, anywhere `mCPToken` / `mCPAuditEvent` appears (~15 files).

**Test:** Existing tests should pass unchanged (it's a code-level rename, not a behaviour change).

**Lift:** ~2 hours.

## Order of operations (when triggered)

These items are independent — pull whichever the usage signal demands first. The likely realistic ordering once we have users:

1. **#6 snapshot tests** — do this any time (cheap insurance, no trigger needed)
2. **#2 `get_topic_content`** — first capability gap real users will hit
3. **#3 pagination** — second capability gap
4. **#1 Redis rate-limit** — only when abuse signal appears
5. **#5 rate-limit headers** — when a client implements the consumer side
6. **#4 resources capability** — when an MCP client ships an `@`-mention UX that benefits
7. **#7 schema rename** — never, probably

## References

- Foundation plan: [docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md](2026-05-12-002-feat-external-mcp-server-plan.md)
- Launch checklist: [docs/strategy/mcp-launch-checklist.md](../strategy/mcp-launch-checklist.md)
- Directory submission drafts: [docs/strategy/mcp-directory-submission.md](../strategy/mcp-directory-submission.md)
- Monitoring CLI: [scripts/metrics/mcp-audit.ts](../../scripts/metrics/mcp-audit.ts)
- Original ce:review (Phase 1+2 stacked): adv-mcp-001 (parallel-burst), adv-mcp-004 (audit amplification — fixed in Phase 5), adv-mcp-007 (TOCTOU revoke — documented)
