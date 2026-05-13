---
title: "MCP Phase 2.5 — usage-signal-gated hardening + capability additions"
date: 2026-05-13
status: queued
type: feat
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

**Trigger:** any single token hits >60 req/min OR active-token count >1000 (whichever first). Pre-defined in foundation plan §D9 — pull that wording verbatim when this lands. Observe via direct SQL (today's `pnpm mcp:audit` groups by day/tool/user, not by token-minute):

```sql
-- per-token-per-minute rate
SELECT "tokenId", date_trunc('minute', "createdAt") AS m, count(*) AS calls
FROM "MCPAuditEvent" WHERE "createdAt" > now() - interval '1 day'
GROUP BY 1, 2 HAVING count(*) > 60 ORDER BY m DESC;

-- active-token count
SELECT count(*) FROM "MCPToken"
WHERE "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now());
```

**Why:** Current implementation counts `MCPAuditEvent` rows in Postgres — N concurrent requests all see count<60 before any row is written, bypassing the gate.

**Approach:** `INCR` + `EXPIRE` on a Redis key `mcp:rl:<tokenId>:<minuteBucket>`. Returns the new count atomically; reject when >60. Audit row still written async. Vercel KV is the natural fit (already in stack) but Upstash Redis works identically.

**Files:** `src/lib/mcp/rate-limit.ts` (swap implementation), keep API stable so callers don't change.

**Test:** Add a parallel-burst test that fires 100 concurrent requests against a single token and asserts >40 are rejected with `rate_limited`.

**Lift:** ~half a day.

### 2. `get_topic_content` tool

**Trigger:** any user asks an agent "what does my [topic] page say?" and gets back metadata only. Watch via SQL on `MCPAuditEvent`: consecutive `get_topic_overview` calls per `tokenId` without a follow-up `get_node_detail` / `search_graph_nodes` in the same minute window (i.e. agents giving up after the metadata-only response). Today's `pnpm mcp:audit --tools` shows raw counts but not the follow-up pattern — add a `--funnel` flag here if this trigger fires.

**Why:** Agents currently see topic *status* (count, last-updated) via `get_topic_overview` but cannot read the compiled topic body. Topic pages are the most agent-shaped output we produce — withholding them is a leak in the read-only contract.

**Approach:** New scribe tool `get_topic_content(topicKey)` returning the parsed `TopicCompiledOutput` (the three-tier structured object: `understanding`, `whatYouCanDoNow`, `discussWithClinician`, `gpPrep`). The compiled body is stored as `TopicPage.rendered: String?` (JSON-serialized) — the tool parses on read and exposes the structured shape so agents get section-level addressability, not a markdown blob. Add to `READ_ALLOWED_TOOLS`. Topic-scoped (not whole-graph). Return `null` when `rendered` is unset (topic in `stub` or `error` status).

**Files:** `src/lib/scribe/tools/get-topic-content.ts` (new), `src/lib/scribe/tool-catalog.ts` (register), `src/lib/mcp/tool-adapter.ts` (allowlist).

**Test:** Handler test — happy path returns parsed `TopicCompiledOutput`, missing topic (no row) returns `null`, stub-status topic returns `null`, cross-user lookup returns `null` (mirror the pattern in `resolve-entity.test.ts:56-72`: userA owns topic, userB calls with same `topicKey`, asserts userB gets `null` not userA's content) + route test (tools/list now lists 9 names).

**Lift:** ~2 hours.

### 3. Pagination on `list_graph_index`

**Trigger:** any user with >200 graph nodes. `aggregateRecord` already returns `truncated: true` + `totalNodes` so the truncation is *visible* but **unaddressable** — agents see "there are more nodes" with no way to fetch them. Observe via:

```sql
SELECT "userId", count(*) FROM "GraphNode"
GROUP BY "userId" HAVING count(*) > 200;
```

**Why:** Today's cap of 200 importance-scored nodes was chosen to keep wire size under ~50KB. A power user with 500+ nodes loses tail visibility, agents can't address the missing nodes.

**Approach:** Add `{ cursor?: string, limit?: number }` to the input schema. Cursor encodes the last-seen importance score + nodeId. Default `limit` 200 (unchanged), max 500. Return `nextCursor` in the response.

**Files:** `src/lib/scribe/tools/list-graph-index.ts`, `src/lib/record/aggregate.ts` (probably needs a windowing arg).

**Test:** Snapshot test confirming the 200th and 201st nodes are consistent across two paginated calls.

**Lift:** ~half a day.

### 4. MCP `resources` capability (alongside `tools`)

**Trigger:** Cursor or Claude Desktop ships an `@`-mention picker that uses MCP resources, OR a directory reviewer asks why we don't expose resources.

**Why:** MCP's `resources` capability lets clients show a picker of "things you can reference" (e.g. each topic as a resource). It's a UX upgrade for agents, not a security boundary.

**Approach:** Register the user's topics as resources via `server.registerResource`. URI scheme `morningform://topic/<topicKey>` (reserve `morningform://node/<canonicalKey>` for a future iteration — biomarker nodes are an even more natural `@`-mention target than topics). Resource read **must delegate to a shared `loadTopicBody(userId, topicKey)` helper** also used by `get_topic_content` so the two surfaces can't drift on payload shape. Returns the same parsed `TopicCompiledOutput` as item 2.

**Files:** `src/app/api/mcp/route.ts` (capabilities + registrations), `src/lib/mcp/resource-adapter.ts` (new).

**Test:** Route test asserting `resources/list` returns the user's topics, `resources/read` returns the topic body (parsed `TopicCompiledOutput`), and cross-user `resources/read` returns an error / empty rather than another user's content (same probe as item 2's cross-user test).

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

**Approach:** Extend foundation plan §U4 (which already snapshotted one tool's MCP definition) to all 8 tools via a full `tools/list` response. Snapshot `result.tools` only (not the JSON-RPC envelope — its `id` is request-coupled), sort tools by name and recursively sort object keys to defang `zodToJsonSchema` ordering drift across zod versions.

**Files:** `src/app/api/mcp/route.snapshot.test.ts` (new — extend the U4 fixture pattern).

**Test:** The test itself.

**Lift:** ~1 hour.

### 7. `MCPToken` → `McpToken` schema rename

**Trigger:** anyone touching the token model is annoyed by `prisma.mCPAuditEvent` enough to actually do it. (Aesthetic, low priority.)

**Why:** Prisma's accessor convention lowercases the first letter of the model name, so `MCPToken` becomes `prisma.mCPToken` and `MCPAuditEvent` becomes `prisma.mCPAuditEvent`. `McpToken` would yield `prisma.mcpToken` — cleaner.

**Approach:** Standard Prisma model rename. Migration is a `@@map` to the existing table name (so no data move) plus a global rename of the Prisma accessor in code. Contrast with the priorities-pivot rename (D1 in [2026-05-10-001-feat-priority-markers-pivot-plan.md](2026-05-10-001-feat-priority-markers-pivot-plan.md)) which chose `db push --accept-data-loss` + `TRUNCATE CASCADE` because there was only 1 production row — `@@map` is correct here precisely because `MCPAuditEvent` carries live audit data we already read via `pnpm mcp:audit`.

**Files:** `prisma/schema.prisma`, anywhere `mCPToken` / `mCPAuditEvent` appears (~15 files).

**Test:** Existing tests should pass unchanged (it's a code-level rename, not a behaviour change).

**Lift:** ~2 hours.

## Agent-native parity audit

The seven items above cover graph-side gaps the foundation left. Below is every read-shaped surface in the domain with an explicit disposition, so future "should agents have X?" questions resolve against a documented call rather than ad hoc taste. Trigger to flip `defer` to `expose` is real user demand surfaced through `MCPAuditEvent` or product asks — not engineering preference.

| Surface | Human path | Disposition | Why |
|---|---|---|---|
| `CheckIn` (morning / evening) | `/api/check-in` | **expose** (Phase 3) | "What has this user told me lately" is squarely in agent-prompt territory; own-data, low security cost |
| `WeeklyReview` aggregate | `/api/insights/weekly` | **expose** (Phase 3) | Exactly the surface for "summarize my last week" — derived signal, not raw |
| `Suggestion` (today's prompts) | `/api/suggestions` | **expose** (Phase 3) | Material context for "why is this on my mind today" — small payload, simple shape |
| Node → topics cross-ref | `/api/graph/nodes/[id]/topics` | **expose** (Phase 2.5 candidate) | Natural follow-up to `get_node_detail`; cheap to add — consider folding into the structure of item 2 |
| Source-document retrieval | `/api/record/source/[id]` | **expose** (Phase 3) | Provenance escalation path agents currently lack — chunk text from `get_node_provenance` only, no parent doc |
| `HealthDataPoint` (Apple Health / Terra) | `/api/insights/health-history` | **defer** | High signal but needs a deliberate tool shape (windowed? aggregated? raw time-series?). Phase 3+ design call |
| `ConversationMessage` (chat history) | `/api/chat/history` | **defer** | Sensitive — user's prior agentic conversations. Reconsider only if an agent demonstrably needs "what did the user already explore" |
| `/api/scribe/explain` (selection-grounded) | scribe Explain UI | **defer** | Write-shaped (creates a scribe annotation). Reconsider once read-side is solid |
| Intake document listing | `/api/intake/documents` | **defer** | Privacy-sensitive onboarding flow; not load-bearing for grounded Q&A |
| `route_to_gp_prep` | scribe tool (currently excluded from allowlist) | **expose later** | Tied to a real `GpPrepQuestion` write path landing. Currently noted in `tool-adapter.ts` comment as deferred — name it here too so the backlog isn't split |
| Health connections status | `/api/health/connections` | **never** | Settings ceremony, not user data |
| Token management (`/settings/integrations/claude`) | settings UI | **never** | Self-referential; leaked token must not enable token-laundering. Enforces foundation §R15 (session cookie is not a valid MCP credential) |

Item 2 (`get_topic_content`) and item 4 (resources) above remain the top of the Phase 2.5 queue. Everything in the **expose (Phase 3)** rows is candidate work once the Phase 2.5 backlog clears or a real user signal pulls one forward.

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

- Foundation plan: [docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md](2026-05-12-002-feat-external-mcp-server-plan.md) — see §D9 (rate-limit promotion criteria) and §U4 (one-tool snapshot fixture this plan's item 6 extends)
- Launch checklist §5 (canonical deferral source-of-truth): [docs/strategy/mcp-launch-checklist.md](../strategy/mcp-launch-checklist.md)
- Directory submission drafts: [docs/strategy/mcp-directory-submission.md](../strategy/mcp-directory-submission.md)
- Monitoring CLI: [scripts/metrics/mcp-audit.ts](../../scripts/metrics/mcp-audit.ts)
- Original ce:review (Phase 1+2 stacked): adv-mcp-001 (parallel-burst), adv-mcp-004 (audit amplification — fixed in Phase 5), adv-mcp-007 (TOCTOU revoke — documented)
- Overdue follow-up: foundation plan promised a `/ce:compound` writeup capturing the bearer-token + audit + rate-limit pattern as institutional knowledge — never filed. File one after Phase 2.5 ships covering both the foundation patterns and the new cursor-pagination convention from item 3.
