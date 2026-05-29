---
title: "vercel env add via stdin pipe can silently fail — use the --value flag"
date: 2026-05-16
category: docs/solutions/runtime-errors
module: tooling / vercel cli
problem_type: silent_command_failure
component: ops
symptoms:
  - "Script reports `vercel env add` exit code 0 — looks like it worked"
  - "`vercel env ls` shows the var is still missing"
  - "No error message anywhere (especially with stderr suppressed)"
  - "Subsequent `vercel env pull` returns empty for the (missing) variable"
root_cause: cli_input_handling
resolution_type: command_change
severity: high
tags:
  - vercel-cli
  - env-vars
  - silent-failure
  - rotation
  - automation
---

# vercel env add via stdin pipe can silently fail — use the --value flag

## Problem

A common rotation pattern looks like this:

```bash
printf '%s' "$NEW_TOKEN" | vercel env add RESEND_API_KEY preview > /dev/null 2>&1
echo "exit: $?"  # → 0
```

Exit code 0 implies success. But `vercel env ls` afterwards shows the variable is **not** set on the targeted environment. The pipe-through-stdin path didn't persist the value, and the CLI didn't report an error.

Hit this mid-rotation of a Resend API key: the new preview-scoped key was created in Resend (HTTP 201), its token was piped into `vercel env add`, the script reported success, and then preview deploys started failing with "RESEND_API_KEY is undefined." The key value was effectively lost (Resend only displays a key's token once at creation).

## Symptoms

- `vercel env add ... < <(...)` or `printf X | vercel env add ...` returns exit code 0
- No stderr output (or stderr suppressed by `2>&1 > /dev/null`)
- `vercel env ls` shows no entry for the variable on the targeted env
- If a previous value was `rm`'d before the failed `add`, the env is now empty and dependent services break

## What Didn't Work

- **`< <(printf %s "$TOKEN")` (process substitution).** Same failure mode as `|` piping.
- **Heredoc input** (`vercel env add ... <<< "$TOKEN"`). Same.
- **Checking exit code.** Exit code 0 lied.
- **Adding `--yes` to skip confirmation.** Doesn't change the stdin handling.

## Solution

Use the `--value` flag, which is the documented non-interactive path. No stdin, no prompt:

```bash
vercel env add RESEND_API_KEY preview --value "$NEW_TOKEN" --yes
```

Even better, verify immediately:

```bash
vercel env add RESEND_API_KEY preview --value "$NEW_TOKEN" --yes
vercel env ls | grep -q RESEND_API_KEY.*Preview || { echo "ADD SILENTLY FAILED"; exit 1; }
```

## Why This Works

`--value` bypasses every interactive code path. The CLI receives the value as a direct argument; there's no prompt to mis-handle, no stdin TTY check to misfire. It's the same code path Vercel's own automation tooling uses.

The stdin path appears to assume an interactive terminal and may exit "successfully" when input is detected but not consumed in the expected shape. This was observed empirically; the exact reproduction conditions weren't isolated. But `--value` is the documented contract and the safe default.

## Prevention

1. **Never use stdin-piping for `vercel env add`.** Use `--value` exclusively in any automation.

2. **Always verify after `vercel env add`.** A one-line grep against `vercel env ls` catches the silent failure immediately:
   ```bash
   vercel env ls | grep -E "^\s*RESEND_API_KEY.*\b${ENV_TARGET}\b" || exit 1
   ```

3. **Don't suppress stderr on stateful CLI calls.** `2>&1 > /dev/null` hid whatever signal the CLI may have emitted. Only suppress stderr after you've verified the success path is genuinely silent.

4. **Be aware: new env vars are now "sensitive by default" on Production AND Preview.** This means `vercel env pull --environment=production|preview` returns the variable with an empty value (`VAR=""`) — the encrypted secret never leaves Vercel's server-side. If your rotation flow relies on pulling-and-reusing the value, switch to:
   - Pulling from a less-sensitive scope (e.g., development), OR
   - Using `--no-sensitive` on `vercel env add` if you genuinely need the value to be pullable, OR
   - Generating new secrets at the source-of-truth (Resend, Stripe, etc.) and adding them directly via `--value`, never round-tripping through `vercel env pull`.

5. **For rotations, the canonical pattern is:**
   ```bash
   # 1. Generate new value at source (Resend dashboard, etc.) — never via script-with-hardcoded-keys
   # 2. Capture to clipboard
   # 3. Push to Vercel with explicit verification:
   vercel env rm RESEND_API_KEY preview --yes 2>/dev/null || true
   vercel env add RESEND_API_KEY preview --value 'PASTE' --yes
   vercel env ls | grep 'RESEND_API_KEY.*Preview' || { echo "FAIL"; exit 1; }
   # 4. Trigger redeploy
   # 5. Smoke-test via the app (e.g., trigger a magic-link send)
   # 6. Revoke old value at source (only AFTER the new one is verified working)
   ```

## Related Issues

- This was the trip-up in a Resend API-key rotation in this session. The orphan key (Resend created it, never shown again because Resend tokens display once) had to be deleted from the dashboard manually as part of recovery.
- A sibling gotcha worth knowing: `vercel env pull` returns empty strings for sensitive vars on Production/Preview. Documented in the same incident.
- For full rotation workflows, the runbook to follow is in `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` (process discipline) and inline in this doc's "Prevention" section.
