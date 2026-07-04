# Connecting to the MorningForm Ops MCP

The ops board (`/ops`) has a companion MCP endpoint so you can manage tasks
from your own Claude client — e.g. "assign the venue risk assessment to Joe."

- **URL:** `https://<app-domain>/api/ops/mcp`
- **Auth:** `Authorization: Bearer <your token>`

Ask Reuben for your token — it's issued per founder via the
`COMPANY_OPS_MCP_TOKENS` environment variable and never appears in this repo
or in any committed file.

## Adding it as a custom connector

1. In your Claude client, open connector/MCP settings and choose "Add custom
   connector" (or equivalent — the exact wording varies by client: Claude
   Desktop, Claude Code, claude.ai).
2. Paste the URL above.
3. When prompted for auth, choose Bearer token and paste the token Reuben
   gave you.
4. Save. You should see four tools available: `list_ops_tasks`,
   `create_ops_task`, `assign_ops_task`, `update_ops_task`.

## What it can do

- List tasks on the shared board, optionally filtered by status or owner.
- Create a new task (optionally already assigned — this notifies the
  assignee immediately).
- Reassign an existing task's owner — this notifies the new owner by email
  (and Slack, if configured) exactly once.
- Update a task's status, title, detail, or due date.

Every call is written to an audit log server-side. If your token stops
working, ask Reuben to check `COMPANY_OPS_MCP_TOKENS` and
`COMPANY_OPS_ALLOWLIST` in Vercel.
