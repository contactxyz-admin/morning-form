# @morningform/mcp

stdio MCP proxy for [MorningForm](https://morning-form.vercel.app) — bridges Claude Code (and any stdio-only MCP client) to MorningForm's HTTPS MCP server.

## What it does

MorningForm exposes its scribe tool catalog via [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP at `https://morning-form.vercel.app/api/mcp`. Claude Desktop and Cursor talk to that directly. Claude Code expects to spawn a stdio binary — this package is that bridge.

The proxy itself is ~100 lines of Node. It reads newline-delimited JSON-RPC frames from stdin, POSTs each to `/api/mcp` with your bearer token, and writes the response back to stdout. No SDK dependency, no tool introspection — straight passthrough.

## Setup

### 1. Issue a token

Visit https://morning-form.vercel.app/settings/integrations/claude → **New token** → name it → copy the raw value. It's only shown once.

### 2. Add to Claude Code

Pass the token via `MORNINGFORM_TOKEN` (recommended) so it doesn't appear in `ps` / process listings on multi-user hosts.

In your project root (or `~/.claude.json`):

```json
{
  "mcpServers": {
    "morningform": {
      "command": "npx",
      "args": ["-y", "@morningform/mcp"],
      "env": { "MORNINGFORM_TOKEN": "<your-token-here>" }
    }
  }
}
```

Or via the Claude Code CLI:

```bash
claude mcp add morningform --env MORNINGFORM_TOKEN=<your-token-here> -- npx -y @morningform/mcp
```

Passing the token as `argv[1]` (`npx -y @morningform/mcp <token>`) still works for backward compatibility but is discouraged — the token is visible to anyone who can list local processes.

### 3. Use it

In Claude Code, start a session and ask anything about your health record. Claude will discover the MorningForm tools via `tools/list` and call `list_graph_index`, `resolve_entity`, `get_node_detail`, `compare_to_reference_range`, etc. as needed.

## Exposed tools (read-only)

- `list_graph_index` — whole-graph index (topics, recent activity, top 200 nodes)
- `resolve_entity` — canonical key → node id
- `get_topic_overview` — per-topic status (counts, evidence)
- `search_graph_nodes` — search within a topic subgraph
- `get_node_detail` — full attributes for a node
- `get_node_provenance` — supporting source chunks for a node
- `compare_to_reference_range` — biomarker comparison
- `recognize_pattern_in_history` — temporal pattern recognition

No write tools. The MCP surface is intentionally read-only.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MORNINGFORM_TOKEN` | — | Bearer token (recommended path) |
| `MORNINGFORM_URL` | `https://morning-form.vercel.app/api/mcp` | Server endpoint (override for local dev) |

Token resolution order: `argv[1]` first (legacy), then `MORNINGFORM_TOKEN`. Exits non-zero if neither is set. Pass via env in any setup script you share — `argv[1]` exposes the secret to `ps`.

**`MORNINGFORM_URL` is sensitive.** It controls where your bearer token is sent. A malicious `.envrc`, project `.claude.json`, or shell rc edit could silently redirect it to an attacker. Only override for local dev, and audit any project that ships its own `MORNINGFORM_URL` before installing this MCP server in it.

## Security

- The proxy does not store or log your token. It lives in process memory for the duration of the session.
- The remote server enforces a 60 calls/minute rate limit per token. If you hit it, the proxy surfaces a JSON-RPC error code `-32002` with the upstream response body.
- Authentication failures (401) surface as JSON-RPC error code `-32001`.
- Revoke tokens at https://morning-form.vercel.app/settings/integrations/claude.

## Requirements

Node.js 18+ (uses the built-in `fetch`).

## License

MIT.
