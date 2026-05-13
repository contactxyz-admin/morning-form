import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { createMcpToken, revokeMcpToken } from '@/lib/mcp/tokens';

// Route handler imports `prisma` from @/lib/db; we redirect to the test DB.
vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// No global deleteMany — every test creates its own user + token so the
// data is naturally scoped. A wipe-per-test would race against parallel
// test files sharing the same test DB.

// Static import — vi.mock above is hoisted by vitest's transform so the
// mock takes effect before the route module loads, regardless of import
// ordering in this file.
import { POST } from './route';

interface JsonRpcEnvelope {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

// MCP requires an initialize handshake before any tools/list or tools/call.
const initEnvelope: JsonRpcEnvelope = {
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.1' },
  },
};

function makeRequest(token: string | null, envelope: JsonRpcEnvelope): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
  });
}

describe('POST /api/mcp — auth gate', () => {
  it('401 when no Authorization header is provided', async () => {
    const res = await POST(makeRequest(null, initEnvelope));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/auth/i);
  });

  it('401 when the bearer token does not resolve', async () => {
    const res = await POST(makeRequest('not-a-real-token', initEnvelope));
    expect(res.status).toBe(401);
  });

  it('401 when the bearer is malformed (no "Bearer " prefix)', async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'just-a-raw-token', // missing "Bearer " prefix
    };
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(initEnvelope),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('401 on a revoked token', async () => {
    const userId = await makeTestUser(prisma, 'mcp-route-revoked');
    const { id, rawToken } = await createMcpToken(prisma, { userId, label: 'rev' });
    await revokeMcpToken(prisma, userId, id);

    const res = await POST(makeRequest(rawToken, initEnvelope));
    expect(res.status).toBe(401);
  });

  it('401 on an expired token', async () => {
    const userId = await makeTestUser(prisma, 'mcp-route-expired');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { rawToken } = await createMcpToken(prisma, {
      userId,
      label: 'expired',
      expiresAt: yesterday,
    });

    const res = await POST(makeRequest(rawToken, initEnvelope));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mcp — initialize handshake', () => {
  it('200 with a valid bearer + initialize envelope returns server info', async () => {
    const userId = await makeTestUser(prisma, 'mcp-route-init');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'init' });

    const res = await POST(makeRequest(rawToken, initEnvelope));
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonRpcResponse<{ serverInfo: { name: string } }>;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result?.serverInfo?.name).toBe('morningform');
  });
});

describe('POST /api/mcp — tools/list', () => {
  it('returns exactly the 8 read-allowlist tools', async () => {
    const userId = await makeTestUser(prisma, 'mcp-route-list');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'list' });

    // initialize first (MCP requires the handshake)
    await POST(makeRequest(rawToken, initEnvelope));

    const res = await POST(
      makeRequest(rawToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonRpcResponse<{
      tools: Array<{ name: string; description: string; inputSchema: unknown }>;
    }>;
    const names = body.result?.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      'compare_to_reference_range',
      'get_node_detail',
      'get_node_provenance',
      'get_topic_overview',
      'list_graph_index',
      'recognize_pattern_in_history',
      'resolve_entity',
      'search_graph_nodes',
    ]);

    // refer_to_specialist must NOT be exposed (spawns child scribes — not read-only).
    expect(names).not.toContain('refer_to_specialist');
    // route_to_gp_prep was removed from the allowlist in the ce:review pass —
    // its result payload is consumed by the compile pipeline (not run on
    // MCP path), so external calls were Silent Actions. Re-expose once a
    // real GpPrepQuestion write path lands.
    expect(names).not.toContain('route_to_gp_prep');
  });

  it('topic-scoped tools advertise a topicKey field in inputSchema', async () => {
    const userId = await makeTestUser(prisma, 'mcp-route-schema');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'schema' });
    await POST(makeRequest(rawToken, initEnvelope));

    const res = await POST(
      makeRequest(rawToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    );
    const body = (await res.json()) as JsonRpcResponse<{
      tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }>;
    }>;

    const searchTool = body.result?.tools.find((t) => t.name === 'search_graph_nodes');
    expect(searchTool?.inputSchema.properties).toHaveProperty('topicKey');

    const listTool = body.result?.tools.find((t) => t.name === 'list_graph_index');
    // Whole-graph tools — no topicKey in schema.
    expect(listTool?.inputSchema.properties ?? {}).not.toHaveProperty('topicKey');
  });
});

describe('POST /api/mcp — tools/call', () => {
  it('list_graph_index returns the empty-graph wire shape', async () => {
    const userId = await makeTestUser(prisma, 'mcp-call-list-empty');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'empty' });
    await POST(makeRequest(rawToken, initEnvelope));

    const res = await POST(
      makeRequest(rawToken, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_graph_index', arguments: {} },
      }),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonRpcResponse<{
      content: Array<{ type: string; text: string }>;
    }>;
    const text = body.result?.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text!);
    expect(parsed.totalNodes).toBe(0);
    expect(parsed.nodes).toEqual([]);
  });

  it('list_graph_index returns nodes when the user has them', async () => {
    const userId = await makeTestUser(prisma, 'mcp-call-list-populated');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'populated' });
    await POST(makeRequest(rawToken, initEnvelope));

    const res = await POST(
      makeRequest(rawToken, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_graph_index', arguments: {} },
      }),
    );
    const body = (await res.json()) as JsonRpcResponse<{
      content: Array<{ type: string; text: string }>;
    }>;
    const parsed = JSON.parse(body.result!.content[0].text);
    expect(parsed.totalNodes).toBe(1);
    expect(parsed.nodes[0].canonicalKey).toBe('ferritin');
  });

  it('writes an MCPAuditEvent row on successful tool call', async () => {
    const userId = await makeTestUser(prisma, 'mcp-call-audit');
    const { id: tokenId, rawToken } = await createMcpToken(prisma, {
      userId,
      label: 'audit',
    });
    await POST(makeRequest(rawToken, initEnvelope));

    await POST(
      makeRequest(rawToken, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'list_graph_index', arguments: {} },
      }),
    );

    // Audit write is fire-and-forget — give it a tick.
    await new Promise((r) => setTimeout(r, 200));

    const events = await prisma.mCPAuditEvent.findMany({
      where: { tokenId },
      orderBy: { createdAt: 'desc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[0];
    expect(event.toolName).toBe('list_graph_index');
    expect(event.resultStatus).toBe('success');
    expect(event.userId).toBe(userId);
  });
});

describe('POST /api/mcp — rate limit envelope', () => {
  it('returns 429 with a Retry-After header after the 60th call in a window', async () => {
    const userId = await makeTestUser(prisma, 'mcp-rate-limit');
    const { id: tokenId, rawToken } = await createMcpToken(prisma, {
      userId,
      label: 'rl',
    });

    // Pre-seed 60 audit rows in the rolling window so the next call trips
    // the gate. Cheaper than making 60 real HTTP calls and pins the route's
    // 429 envelope (Retry-After header + JSON body shape) without relying
    // on the actual rate-limit implementation strategy.
    const now = new Date();
    await prisma.mCPAuditEvent.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        tokenId,
        userId,
        toolName: 'list_graph_index',
        parameters: '{}',
        resultStatus: 'success' as const,
        latencyMs: 5,
        createdAt: new Date(now.getTime() - i * 100),
      })),
    });

    const res = await POST(makeRequest(rawToken, initEnvelope));
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number.parseInt(retryAfter!, 10)).toBeGreaterThan(0);

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rate limit/i);
  });
});

describe('POST /api/mcp — body cap', () => {
  it('rejects POST bodies larger than 256KB even with no Content-Length header', async () => {
    const userId = await makeTestUser(prisma, 'mcp-body-cap');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'cap' });

    // Build a >256KB payload. Use a valid-looking JSON-RPC envelope so we
    // know the rejection is by size, not by parse failure.
    const padding = 'a'.repeat(260 * 1024);
    const oversize = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { padding },
    });

    // Construct the Request manually so we can omit Content-Length entirely.
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${rawToken}`,
    });
    headers.delete('Content-Length');

    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers,
        body: oversize,
      }),
    );

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too large/i);
  });
});
