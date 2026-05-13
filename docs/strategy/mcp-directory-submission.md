---
title: "MCP discoverability — submission paths"
date: 2026-05-13
status: ready-to-submit
type: strategy
---

# MCP discoverability — submission paths

How to make `@morningform/mcp` discoverable to MCP clients. **Process changed since the original draft (2026-05-13 AM):** Anthropic retired the README list in `modelcontextprotocol/servers` in favour of a dedicated **MCP Server Registry** (`registry.modelcontextprotocol.io`). Cursor and VS Code's catalogs increasingly source from that same registry.

## Path 1 (canonical) — MCP Server Registry

Anthropic-hosted, queryable by every modern MCP client. Source-of-truth for server metadata. **This is the only submission worth doing right now** — both Cursor and VS Code's marketplaces consume it (or are converging on it).

### Pre-requisites already done in the repo

- `mcpName` field in `mcp-package/package.json` (must be `io.github.contactxyz-admin/morningform` per GitHub-auth namespace rule)
- `mcp-package/server.json` populated with metadata, npm package identifier, transport, and env-var descriptions
- `repository.url` + `repository.directory` in `package.json` so the registry can link back to source

### Founder run-list (5 commands)

```bash
# 1. npm publish — first time only
cd mcp-package
npm login                              # interactive; uses your npm account
npm publish --access public            # publishes @morningform/mcp@0.1.0

# 2. mcp-publisher (CLI tool from Anthropic)
brew install mcp-publisher             # or: curl -L … (see registry/quickstart)
mcp-publisher login github             # GitHub device-flow auth — opens browser

# 3. Publish server.json to the registry
mcp-publisher publish                  # reads ./server.json
```

### Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.contactxyz-admin/morningform"
```

Should return the manifest. Cursor / Claude Desktop / VS Code clients then auto-discover via their respective registry queries.

### Repeat-publish

For version bumps (e.g. fixing a bug in the proxy):

```bash
# In mcp-package/, bump version in BOTH package.json and server.json
npm publish --access public
mcp-publisher publish
```

The registry rejects a publish whose `version` already exists.

## Path 2 — Cursor (cursor.directory community listing)

Cursor's official documentation marketplace lists "official providers" only — submission process is unclear from public docs and likely requires direct Cursor outreach (Discord, support email). The community-discoverable path is **[cursor.directory/plugins](https://cursor.directory/plugins)** — a community-maintained list of MCP servers / plugins for Cursor.

**When to do this:** Once Path 1 (Registry) is live AND a user has confirmed Cursor picks the server up via Registry. If Cursor doesn't auto-source from the Registry, fall back to a cursor.directory submission.

**How:** cursor.directory has a "submit a plugin" path on its homepage. Process not documented in detail; expect a simple form or GitHub PR.

## Path 3 — VS Code MCP marketplace

VS Code 1.102+ (July 2025) ships with a built-in MCP marketplace in the Extensions panel (search `@mcp` to see installed servers). It sources from:

1. **VS Code extensions** that register MCP servers via `mcpServerDefinitionProviders` in their manifest. This requires shipping a VS Code extension that wraps our server — engineering effort beyond this launch.
2. **The MCP Server Registry** (Path 1) — VS Code is progressively consuming registry entries directly.

**When to do this:** Wait. After Path 1 lands, check `code --install-extension @mcp/...` or the in-app `@mcp` search to confirm visibility. If not visible after Registry approval, evaluate building a thin VS Code extension that registers the server (Phase 2.5+ work).

## Pre-submission checklist (Path 1)

- [x] `mcpName` in `mcp-package/package.json` (`io.github.contactxyz-admin/morningform`)
- [x] `server.json` populated in `mcp-package/`
- [ ] `@morningform/mcp` published to npm (`npm view @morningform/mcp` returns the manifest)
- [ ] Production smoke completed (token issued, Claude Desktop config tested, at least one `tools/call` confirmed via the `MCPAuditEvent` table)

## After-submission monitoring

- `pnpm mcp:audit` — daily breakdown by tool / user / status. Watch for the first inbound traffic.
- `curl https://registry.modelcontextprotocol.io/v0.1/servers/io.github.contactxyz-admin/morningform` — confirm registry visibility.
- Search Cursor + VS Code `@mcp` panels in-product after a few days to confirm cross-client pickup.
