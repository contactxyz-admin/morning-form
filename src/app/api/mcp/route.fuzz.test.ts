/**
 * Fuzz / adversarial tests for the external MCP route.
 *
 * route.test.ts covers the happy paths (auth, initialize, tools/list,
 * tools/call). This file covers the seams an attacker probes — header
 * smuggling, oversize payloads, malformed envelopes, non-allowlisted
 * tool calls, case variants. The goal is contract pinning: each pattern
 * here produces a documented response shape, not a 500 or a hang.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { createMcpToken } from '@/lib/mcp/tokens';

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

import { POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function mintToken(suffix: string): Promise<string> {
  const userId = await makeTestUser(prisma, `mcp-fuzz-${suffix}`);
  const { rawToken } = await createMcpToken(prisma, { userId, label: 'fuzz' });
  return rawToken;
}

function postRequest(opts: {
  token?: string | null;
  body?: string;
  contentLength?: string;
  authHeader?: string;
  acceptHeader?: string;
}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: opts.acceptHeader ?? 'application/json, text/event-stream',
  };
  if (opts.authHeader !== undefined) {
    headers.Authorization = opts.authHeader;
  } else if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }
  if (opts.contentLength) headers['Content-Length'] = opts.contentLength;
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers,
    body: opts.body ?? '{}',
  });
}

// ---------------------------------------------------------------------------
// Body size cap (sec-1)
// ---------------------------------------------------------------------------
describe('body size cap', () => {
  it('rejects 413 when Content-Length exceeds 256KB', async () => {
    const token = await mintToken('cl-exceeds');
    const res = await POST(
      postRequest({
        token,
        contentLength: String(256 * 1024 + 1),
        body: '{}',
      }),
    );
    expect(res.status).toBe(413);
  });

  it('accepts when Content-Length is at the cap boundary (256KB exactly)', async () => {
    // Boundary: > cap is 413, <= cap is allowed through.
    const token = await mintToken('cl-boundary');
    const res = await POST(
      postRequest({
        token,
        contentLength: String(256 * 1024),
        body: '{}',
      }),
    );
    // Falls through to auth/transport; we just assert NOT 413.
    expect(res.status).not.toBe(413);
  });

  it('accepts when Content-Length header is absent (no false 413)', async () => {
    const token = await mintToken('cl-absent');
    const res = await POST(postRequest({ token, body: '{}' }));
    expect(res.status).not.toBe(413);
  });

  it('handles non-numeric Content-Length safely (treats as no cap, falls through)', async () => {
    const token = await mintToken('cl-nan');
    const res = await POST(
      postRequest({ token, contentLength: 'not-a-number', body: '{}' }),
    );
    // parseInt('not-a-number') = NaN; `NaN > N` is false, so no 413.
    expect(res.status).not.toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Authorization header parsing
// ---------------------------------------------------------------------------
describe('Authorization header parsing', () => {
  it('401 when Authorization header is empty string', async () => {
    const res = await POST(postRequest({ authHeader: '' }));
    expect(res.status).toBe(401);
  });

  it('401 when Authorization has Bearer prefix but empty token', async () => {
    const res = await POST(postRequest({ authHeader: 'Bearer ' }));
    expect(res.status).toBe(401);
  });

  it('401 when Authorization is just whitespace after Bearer', async () => {
    const res = await POST(postRequest({ authHeader: 'Bearer    ' }));
    expect(res.status).toBe(401);
  });

  it('accepts lowercase "bearer" prefix (RFC 7235 case-insensitivity)', async () => {
    const token = await mintToken('lowercase-bearer');
    const res = await POST(postRequest({ authHeader: `bearer ${token}` }));
    // Reaches transport (not 401); SDK may return 400/406 depending on the
    // initialize handshake — we just assert auth didn't reject.
    expect(res.status).not.toBe(401);
  });

  it('accepts BEARER (all caps) — RFC 7235 case-insensitive', async () => {
    const token = await mintToken('caps-bearer');
    const res = await POST(postRequest({ authHeader: `BEARER ${token}` }));
    expect(res.status).not.toBe(401);
  });

  it('401 on a Basic auth header (wrong scheme)', async () => {
    // base64-encoded user:pass — fails the Bearer regex.
    const res = await POST(postRequest({ authHeader: 'Basic dXNlcjpwYXNz' }));
    expect(res.status).toBe(401);
  });

  it('Web Fetch Headers constructor rejects embedded CRLF before reaching our code (smuggling impossible at the platform layer)', () => {
    // Even constructing a Request with a CRLF-laced header throws — the
    // attack vector is closed by the platform, not our code. Useful pin:
    // if this ever STOPS throwing, our auth path would need to defensively
    // sanitize the header value itself.
    expect(() =>
      postRequest({ authHeader: 'Bearer valid-token\r\nX-Injected: evil' }),
    ).toThrow(/invalid header value/i);
  });
});

// ---------------------------------------------------------------------------
// Malformed envelopes — server's job to reject cleanly, not crash
// ---------------------------------------------------------------------------
describe('malformed JSON-RPC envelopes', () => {
  it('returns a structured error on completely empty body', async () => {
    const token = await mintToken('empty-body');
    const res = await POST(postRequest({ token, body: '' }));
    // Reaches the transport with an empty body; the SDK returns its own
    // error envelope. We never 500.
    expect(res.status).not.toBe(500);
  });

  it('returns a structured error on non-JSON body', async () => {
    const token = await mintToken('not-json');
    const res = await POST(postRequest({ token, body: 'this is not JSON' }));
    expect(res.status).not.toBe(500);
  });

  it('returns a structured error on truncated JSON', async () => {
    const token = await mintToken('truncated');
    const res = await POST(postRequest({ token, body: '{"jsonrpc": "2.0", "id": 1, "method"' }));
    expect(res.status).not.toBe(500);
  });

  it('returns a structured error when method field is missing', async () => {
    const token = await mintToken('no-method');
    const res = await POST(
      postRequest({ token, body: JSON.stringify({ jsonrpc: '2.0', id: 1 }) }),
    );
    expect(res.status).not.toBe(500);
  });

  it('returns a structured error when jsonrpc version is wrong', async () => {
    const token = await mintToken('wrong-version');
    const res = await POST(
      postRequest({
        token,
        body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'initialize' }),
      }),
    );
    expect(res.status).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Unknown / case-variant tool names — allowlist enforcement
// ---------------------------------------------------------------------------
describe('tool name validation', () => {
  async function callTool(token: string, name: string): Promise<Response> {
    // initialize first per MCP spec
    await POST(
      postRequest({
        token,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'fuzz', version: '0.0.1' },
          },
        }),
      }),
    );
    return POST(
      postRequest({
        token,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: {} },
        }),
      }),
    );
  }

  it('rejects a tool name that exists in the scribe catalog but is NOT in the read-allowlist (refer_to_specialist)', async () => {
    const token = await mintToken('refer-specialist');
    const res = await callTool(token, 'refer_to_specialist');
    // SDK returns 200 with a JSON-RPC error inside (tool not found).
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it('rejects a tool name that exists in the scribe catalog but was removed from allowlist (route_to_gp_prep)', async () => {
    const token = await mintToken('gp-prep');
    const res = await callTool(token, 'route_to_gp_prep');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it('rejects a completely fabricated tool name', async () => {
    const token = await mintToken('fake-tool');
    const res = await callTool(token, 'definitely_not_a_real_tool_xyzzy');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it('rejects a case-variant of an allowlisted name (List_Graph_Index)', async () => {
    // SDK uses exact string match; case variants don't sneak past.
    const token = await mintToken('case-variant');
    const res = await callTool(token, 'List_Graph_Index');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it('rejects an UPPERCASE variant of an allowlisted name', async () => {
    const token = await mintToken('upper-variant');
    const res = await callTool(token, 'LIST_GRAPH_INDEX');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it('rejects a unicode-padded variant (zero-width chars in the name)', async () => {
    const token = await mintToken('unicode-pad');
    // U+200B zero-width space between chars — visually identical, byte-different.
    const sneaky = 'list_graph​_index';
    const res = await callTool(token, sneaky);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });
});
