---
title: "MCP server launch checklist"
date: 2026-05-13
status: active
type: strategy
---

# MCP server launch checklist

Operational checklist for taking the external MCP server out of code-complete into shipped, discoverable, and supported.

## Pre-publish (eng — all done by Phase 5)

- [x] Bearer-token auth with HMAC + domain-separation prefix
- [x] Rate limit: 60/min/token via Postgres count, throttle-row exclusion (no self-amplifying)
- [x] Per-call audit (`MCPAuditEvent`) with 8KB parameter truncation
- [x] Request body cap (256KB Content-Length check)
- [x] `Cache-Control: no-store, private` + `Vary: Authorization` headers
- [x] Token never appears in any log, response body, or URL
- [x] Read-only allowlist of 8 tools (positive allowlist; new scribe tools NOT auto-exposed)
- [x] Domain-separation tested (mcp/share/session token hashes never collide)
- [x] 22 fuzz tests passing (body cap, header parsing, malformed envelopes, tool name validation)
- [x] Settings UI for token issue/revoke at `/settings/integrations/claude`
- [x] `@morningform/mcp` stdio proxy package (zero deps, ~100 LOC)

## Founder actions (post-merge)

### 1. Smoke against a real token
Issue a token via the production settings UI; configure Claude Desktop:

```json
{
  "mcpServers": {
    "morningform": {
      "url": "https://morning-form.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Restart Claude Desktop. Verify the 8 tools appear in the tool picker. Ask "what's in my MorningForm vault?" — Claude should call `list_graph_index` and render a response.

### 2. Publish `@morningform/mcp` to npm

```bash
cd mcp-package
npm pack                              # produce a tarball; inspect contents
# verify: package.json, index.js (executable), README.md present
# verify: no .git, no node_modules, no source-map files

npm login                              # one-time
npm publish --access public            # name is @morningform/mcp (scoped public)
```

Verify install path:

```bash
npx @morningform/mcp --help            # should fail with the missing-token message
```

Add the Claude Code instructions to the just-issued dialog after the package is live (a follow-up commit to `claude-tokens-client.tsx` toggling the "Once the package publishes…" warning).

### 3. Submit to MCP directories

#### Anthropic MCP directory
Process: not yet automated; reach out to the Anthropic DevRel team or submit via their MCP servers PR list (https://github.com/modelcontextprotocol/servers).

Information to provide:
- Name: MorningForm
- Description: Read-only access to a user's personal health graph — biomarkers, symptoms, conditions, medications, source documents — for AI agents to ground responses in real clinical context.
- Server URL: `https://morning-form.vercel.app/api/mcp`
- Setup instructions: link to https://morning-form.vercel.app/settings/integrations/claude
- Tools: list the 8 read-only tools with one-line descriptions (from `tools/list`)
- Auth: bearer token (user-issued via web UI)
- License: TBD

#### Cursor MCP marketplace
Cursor's MCP server registry: https://cursor.sh/mcp (URL TBD; check Cursor docs).
Same info as Anthropic submission.

#### VS Code MCP extension catalog
The MCP extension's catalog: settings JSON entry. Open a PR against the extension's example-servers list with the same info.

### 4. Post-launch monitoring

For the first 2 weeks, watch:
- `MCPAuditEvent` table: tool call rate per user, error rate, rate-limit hit rate
- 401 traffic: anomalous bursts suggest token harvesting attempts
- 429 traffic: legitimate over-cap users → consider per-token rate-limit override

Set up a daily query:
```sql
SELECT
  date_trunc('day', "createdAt") AS day,
  "resultStatus",
  count(*)
FROM "MCPAuditEvent"
WHERE "createdAt" > now() - interval '14 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

### 5. Known follow-ups (Phase 2.5 backlog)

These were intentionally deferred from the foundation; address based on usage signal:

- **Redis-backed rate-limit** — closes the parallel-burst bypass (review adv-mcp-001). Trigger: any user hitting >60 in a minute, OR active-token count >1000.
- **`get_topic_content` tool** — agents currently get topic *status* (count, last-updated) but can't read the compiled topic body. Trigger: agents asking "what does my iron topic say?" and getting nothing.
- **Pagination on `list_graph_index`** — capped at 200 nodes today. Trigger: any user with >200 graph nodes.
- **MCP `resources` capability** — for `@`-mention-style discovery in Cursor / Claude Desktop.
- **`X-RateLimit-*` headers** — let well-behaved clients self-throttle before hitting 429.
- **Snapshot tests on `tools/list` JSON Schema** — pin the wire contract.
- **`MCPToken` → `McpToken` schema rename** — Prisma's all-caps accessor is awkward.

## Reference

- Plan: [docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md](../plans/2026-05-12-002-feat-external-mcp-server-plan.md)
- CTO brief: [docs/strategy/cto-architecture-2026-05-12.md](cto-architecture-2026-05-12.md)
- PRs: #105 (schema + tokens) → #106 (HTTP transport) → #107 (settings UI) → #108 (stdio package) → #109 (this Phase 5 hardening + checklist)
