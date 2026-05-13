---
title: "MCP directory submission drafts"
date: 2026-05-13
status: ready-to-submit
type: strategy
---

# MCP directory submission drafts

Ready-to-submit copy for the three MCP registries. Submit once `@morningform/mcp` is published to npm and the production smoke through Claude Desktop passes.

## Anthropic — modelcontextprotocol/servers

Submission target: PR against https://github.com/modelcontextprotocol/servers, adding a `MorningForm` entry to the **Community Servers** section of the README.

### README entry (markdown)

```markdown
- **[MorningForm](https://github.com/contactxyz-admin/morning-form)** — Read-only access to a user's personal health graph (biomarkers, symptoms, conditions, medications, source documents). Eight tools for searching nodes, fetching provenance, comparing reference ranges, and recognising temporal patterns. Bearer-token auth via the user's web settings; HTTP transport at `https://morning-form.vercel.app/api/mcp`; stdio bridge via `@morningform/mcp` for Claude Code.
```

### PR description

```markdown
Adding MorningForm as a community MCP server.

**What it is:** MorningForm is a longitudinal personal health record. Users connect lab PDFs, GP letters, wearable data, and free-text intake; the platform compiles these into a graph of biomarkers, symptoms, conditions, medications, and interventions with source-chunk provenance on every claim.

**What this MCP server exposes:** Eight read-only tools for an AI client to navigate that graph — `list_graph_index`, `search_graph_nodes`, `get_node_detail`, `get_node_provenance`, `compare_to_reference_range`, `recognize_pattern_in_history`, `resolve_entity`, `get_topic_overview`. No write tools. The full scribe-tool catalog is intentionally narrowed to a read-only allowlist for external clients.

**Transports:**
- Streamable HTTP at `https://morning-form.vercel.app/api/mcp`
- stdio via `@morningform/mcp` (npm) for Claude Code

**Auth:** bearer token issued from the user's account settings (`/settings/integrations/claude`). HMAC-hashed at rest with a `mcp:` domain-separation prefix; revocable; per-token rate limit 60 req/min.

**Setup docs:** https://morning-form.vercel.app/settings/integrations/claude (link visible after sign-in)
```

---

## Cursor — MCP marketplace

Submission target: Cursor's MCP server registry. Process TBD; check https://docs.cursor.com/context/model-context-protocol for the current submission flow at the time of submission.

### Entry shape (likely JSON for the cursor registry)

```json
{
  "name": "morningform",
  "displayName": "MorningForm",
  "description": "Read-only access to your personal health graph — biomarkers, symptoms, source documents — for clinical Q&A grounded in your real record.",
  "category": "health",
  "homepage": "https://morning-form.vercel.app",
  "transport": {
    "type": "http",
    "url": "https://morning-form.vercel.app/api/mcp",
    "auth": {
      "type": "bearer",
      "tokenIssuer": "https://morning-form.vercel.app/settings/integrations/claude"
    }
  }
}
```

---

## VS Code MCP extension catalog

Submission target: a PR against the VS Code MCP extension's catalog file (the extension reads a list of `name`/`command` entries). Path: see the extension's CONTRIBUTING.md at submission time.

### Catalog entry (likely YAML or JSON)

```yaml
- name: morningform
  displayName: MorningForm
  description: Read-only access to your personal health graph
  command: npx
  args: ["-y", "@morningform/mcp"]
  envVars:
    - name: MORNINGFORM_TOKEN
      description: Bearer token from https://morning-form.vercel.app/settings/integrations/claude
      required: true
  homepage: https://morning-form.vercel.app
```

---

## Pre-submission checklist

Before opening any of the three PRs:

- [ ] `@morningform/mcp` published to npm (`npm view @morningform/mcp` returns the manifest)
- [ ] Production smoke completed (token issued, Claude Desktop config tested, at least one `tools/call` confirmed via the MCPAuditEvent table)
- [ ] README in the repo updated with the install instructions (so the linked-from-directory README is the source of truth)
- [ ] License decided (the npm package currently declares MIT)

## Order of operations

1. `npm publish --access public` for `@morningform/mcp`
2. Smoke install in Claude Code (`claude mcp add morningform -- npx -y @morningform/mcp <real-token>`)
3. Smoke install in Claude Desktop (paste JSON config from settings UI)
4. Submit to all three registries (parallel — none of them have hard dependencies on each other)
5. Monitor `MCPAuditEvent` over the following 14 days for unexpected traffic patterns
