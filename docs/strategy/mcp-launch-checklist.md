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

### 2. Publish `@morningform/mcp` to npm + MCP Registry

The MCP discoverability story changed mid-launch — Anthropic retired the README list in favour of a dedicated **MCP Server Registry**. Cursor and VS Code marketplaces converge on this registry, so it's the **single canonical submission**, not three separate ones. Full detail in [mcp-directory-submission.md](mcp-directory-submission.md).

```bash
cd mcp-package
npm pack                              # produce a tarball; inspect contents
# verify: package.json, server.json, index.js (executable), README.md present

# Step 1 — publish to npm
npm login                              # one-time, interactive
npm publish --access public            # publishes @morningform/mcp

# Step 2 — install mcp-publisher (Anthropic's registry CLI)
brew install mcp-publisher             # or curl-install per registry quickstart

# Step 3 — authenticate to the registry
mcp-publisher login github             # opens GitHub device-flow

# Step 4 — publish server.json metadata to the registry
mcp-publisher publish                  # reads ./server.json
```

Verify both:

```bash
npx @morningform/mcp --version         # should print 0.1.0
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.contactxyz-admin/morningform"
```

Add the Claude Code instructions to the just-issued dialog after the package is live (a follow-up commit to `claude-tokens-client.tsx` toggling the "Once the package publishes…" warning).

### 3. Submit to MCP directories

**Step 2 above already submits to the canonical registry.** Cursor and VS Code's marketplaces source from `registry.modelcontextprotocol.io` (or are converging on it), so a single `mcp-publisher publish` covers all three at once.

After Path 1 lands and propagates (~24h):
- Search `@mcp` in VS Code Extensions panel to confirm pickup
- Search "MorningForm" on cursor.directory to confirm community visibility
- Fall back to per-platform submissions only if pickup doesn't happen (see [mcp-directory-submission.md](mcp-directory-submission.md) Path 2 + Path 3)

### 4. Post-launch monitoring

For the first 2 weeks, watch:
- `MCPAuditEvent` table: tool call rate per user, error rate, rate-limit hit rate
- 401 traffic: anomalous bursts suggest token harvesting attempts
- 429 traffic: legitimate over-cap users → consider per-token rate-limit override

Use the bundled CLI rather than ad-hoc SQL:

```bash
pnpm mcp:audit                       # 14-day daily breakdown by status
pnpm mcp:audit --days 30 --status error   # last month, errors only
pnpm mcp:audit --tools               # which tools agents actually call
pnpm mcp:audit --users               # who's actively using MCP
```

The script reads `MCPAuditEvent` rows from `DATABASE_URL` and renders a compact tabular breakdown. See [scripts/metrics/mcp-audit.ts](../../scripts/metrics/mcp-audit.ts).

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
