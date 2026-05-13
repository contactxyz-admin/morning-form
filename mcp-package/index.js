#!/usr/bin/env node
/**
 * @morningform/mcp — stdio MCP proxy.
 *
 * Bridges Claude Code (and any stdio-only MCP client) to MorningForm's
 * HTTPS MCP server. Claude Code expects to spawn a stdio binary; the
 * MorningForm server speaks Streamable HTTP. This proxy is the seam.
 *
 * Wire model:
 *   1. Read newline-delimited JSON-RPC frames from stdin.
 *   2. POST each frame to MORNINGFORM_URL with the bearer token.
 *   3. Write the JSON response back to stdout, one line per response.
 *
 * No MCP SDK dependency. The proxy doesn't introspect the protocol — it
 * just forwards. Server-side `/api/mcp` runs in JSON-response mode
 * (enableJsonResponse: true), so each request maps to one response, no
 * SSE multiplexing.
 *
 * Auth: bearer token read from MORNINGFORM_TOKEN env (recommended) or
 * CLI arg #1 (legacy). Required — the proxy exits non-zero if absent
 * (Claude Code surfaces the error to the user).
 *
 * URL override: MORNINGFORM_URL env var, defaults to the production host.
 * Useful for local dev. Sensitive — a malicious .envrc or project
 * .claude.json could redirect your bearer token to an attacker.
 */

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_URL = 'https://morning-form.vercel.app/api/mcp';
const FETCH_TIMEOUT_MS = 60_000; // Longer than any single tool call should take.

// Distinct exit codes so a supervisor agent can tell why we failed.
const EXIT_OK = 0;
const EXIT_USAGE = 2; // Missing token or bad args.

function die(message, code = EXIT_USAGE) {
  process.stderr.write(`[@morningform/mcp] ${message}\n`);
  process.exit(code);
}

function getPackageVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const HELP = `@morningform/mcp — stdio MCP proxy for MorningForm

Usage:
  npx -y @morningform/mcp                 (reads token from MORNINGFORM_TOKEN)
  npx -y @morningform/mcp <bearer-token>  (legacy; token visible in ps output)

Environment:
  MORNINGFORM_TOKEN   Bearer token (recommended path; not visible in ps)
  MORNINGFORM_URL     Server URL (default ${DEFAULT_URL})
                      Sensitive — controls where your token is sent.

Issue a token at https://morning-form.vercel.app/settings/integrations/claude

Flags:
  -h, --help     Show this help and exit
  -v, --version  Show the version and exit

Exit codes:
  0  Clean shutdown (stdin closed, SIGINT, SIGTERM, --help, --version)
  2  Usage error (missing token, bad args)

Transport / auth errors stay in-band as JSON-RPC error frames (codes
-32001 unauthorized, -32002 rate-limited, -32603 transport) so the MCP
client can render them. The proxy stays running on transport errors.
`;

// Pre-token-resolution flag handling so `--help` and `--version` work
// without a token configured.
const flagArg = process.argv[2];
if (flagArg === '--help' || flagArg === '-h') {
  process.stdout.write(HELP);
  process.exit(EXIT_OK);
}
if (flagArg === '--version' || flagArg === '-v') {
  process.stdout.write(`${getPackageVersion()}\n`);
  process.exit(EXIT_OK);
}

const token =
  (process.env.MORNINGFORM_TOKEN && process.env.MORNINGFORM_TOKEN.trim()) ||
  (process.argv[2] && process.argv[2].trim());
if (!token) {
  die(
    'No bearer token provided. Set MORNINGFORM_TOKEN (recommended) or pass as argv[1]. Issue a token at https://morning-form.vercel.app/settings/integrations/claude.',
  );
}

const url = process.env.MORNINGFORM_URL ?? DEFAULT_URL;

const HEADERS = {
  'Content-Type': 'application/json',
  // The MCP Streamable HTTP transport requires this Accept header on POSTs.
  Accept: 'application/json, text/event-stream',
  Authorization: `Bearer ${token}`,
};

/**
 * Send one JSON-RPC frame upstream and write the response to stdout.
 * Catches network errors and synthesises a JSON-RPC error envelope so the
 * MCP client sees a structured failure rather than an aborted stream.
 */
async function proxy(line) {
  let id = null;
  try {
    // Best-effort id extraction so error envelopes carry the request id.
    const parsed = JSON.parse(line);
    id = parsed?.id ?? null;
  } catch {
    // Malformed input — let the server respond.
  }

  // Hard timeout — Node fetch has no default. A hung server (blackhole,
  // slow first byte) would otherwise freeze the JSON-RPC frame forever
  // and Claude Code would show a permanently spinning tool call.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: line,
      signal: ac.signal,
    });

    const body = await res.text();
    if (!res.ok) {
      // Server returned a non-2xx (401 unauthorized, 429 rate-limited,
      // 413 body too large, 500 internal). Surface as a JSON-RPC error
      // so the MCP client can render something useful.
      const errMessage = body
        ? body.slice(0, 500)
        : `HTTP ${res.status} ${res.statusText}`;
      writeFrame({
        jsonrpc: '2.0',
        id,
        error: {
          code: res.status === 401 ? -32001 : res.status === 429 ? -32002 : -32603,
          message: `MorningForm ${res.status}: ${errMessage}`,
        },
      });
      return;
    }

    if (body) {
      // Forward verbatim — server already produced a well-formed
      // JSON-RPC envelope.
      process.stdout.write(body.endsWith('\n') ? body : body + '\n');
    }
  } catch (err) {
    const isTimeout = err && err.name === 'AbortError';
    writeFrame({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: isTimeout
          ? `MorningForm transport timeout after ${FETCH_TIMEOUT_MS}ms`
          : `MorningForm transport error: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function writeFrame(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const rl = createInterface({
  input: process.stdin,
  // Disable terminal mode so we read raw lines regardless of TTY.
  terminal: false,
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  // Fire-and-forget — multiple in-flight requests are fine, the MCP
  // protocol correlates by id. Errors surface to stdout via writeFrame.
  void proxy(line);
});

rl.on('close', () => {
  // stdin closed (client disconnected). Exit cleanly.
  process.exit(EXIT_OK);
});

process.on('SIGINT', () => process.exit(EXIT_OK));
process.on('SIGTERM', () => process.exit(EXIT_OK));
