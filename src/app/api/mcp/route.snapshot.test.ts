/**
 * Wire-contract pin for `tools/list`.
 *
 * External MCP clients (Claude Desktop, Claude Code, Cursor) bind to the
 * JSON Schema returned by `tools/list`. A silent shape change — renaming a
 * field, loosening a validator, dropping a description — is a wire-contract
 * break that the type system won't catch, because Zod produces JSON Schema
 * via `zodToJsonSchema`, which is opaque to grep.
 *
 * Snapshot stability defenses:
 *   - Serialize `result.tools` only — the JSON-RPC envelope's `id` is
 *     request-coupled and would force-churn the snapshot.
 *   - Sort the tools array by `name` — McpServer iteration order is an
 *     implementation detail of the SDK.
 *   - Recursively sort object keys — `zodToJsonSchema`'s key ordering can
 *     drift across zod versions; sorting absorbs that drift.
 *
 * When this test fails:
 *   - Intentional change (added a tool, refined a description): re-run with
 *     `vitest -u` to update the snapshot. The diff in the snapshot file is
 *     the wire-contract change — review it on the PR.
 *   - Unintentional change (zod version bump, schema typo): investigate
 *     before updating.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { createMcpToken } from '@/lib/mcp/tokens';

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

import { POST } from './route';

const initEnvelope = {
  jsonrpc: '2.0' as const,
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'snapshot-test-client', version: '0.0.1' },
  },
};

function makeRequest(token: string, envelope: unknown): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(envelope),
  });
}

/**
 * Recursively sort object keys so `zodToJsonSchema` ordering drift across
 * zod / json-schema versions doesn't churn the snapshot. Arrays are
 * preserved in their existing order (the array order IS the contract for
 * things like `required` and `enum`).
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

describe('POST /api/mcp — tools/list wire contract', () => {
  it('returns the canonical tools/list payload (snapshot)', async () => {
    const userId = await makeTestUser(prisma, 'mcp-snapshot');
    const { rawToken } = await createMcpToken(prisma, { userId, label: 'snapshot' });

    await POST(makeRequest(rawToken, initEnvelope));

    const res = await POST(
      makeRequest(rawToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      result?: {
        tools: Array<{ name: string; description: string; inputSchema: unknown }>;
      };
    };
    const tools = body.result?.tools ?? [];
    expect(tools.length).toBe(8);

    // Sort tools by name + recursively sort keys; both defenses against
    // non-semantic drift.
    const stable = tools
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => sortKeys(t));

    expect(stable).toMatchSnapshot();
  });
});
