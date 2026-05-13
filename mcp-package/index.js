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
 * Auth: bearer token read from CLI arg #1, or MORNINGFORM_TOKEN env var.
 * Required — the proxy exits non-zero if absent (Claude Code surfaces
 * the error to the user).
 *
 * URL override: MORNINGFORM_URL env var, defaults to the production host.
 * Useful for local dev (point at http://localhost:3000/api/mcp).
 */

import { createInterface } from 'node:readline';

const DEFAULT_URL = 'https://morning-form.vercel.app/api/mcp';

function die(message) {
  process.stderr.write(`[@morningform/mcp] ${message}\n`);
  process.exit(1);
}

const token = process.argv[2] ?? process.env.MORNINGFORM_TOKEN;
if (!token || !token.trim()) {
  die(
    'No bearer token provided. Pass it as argv[1] (e.g. `npx @morningform/mcp <token>`) or set MORNINGFORM_TOKEN. Issue a token at https://morning-form.vercel.app/settings/integrations/claude.',
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: line,
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
    writeFrame({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `MorningForm transport error: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
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
  process.exit(0);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
