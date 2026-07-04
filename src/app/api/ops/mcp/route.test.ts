import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz,joe@contact.xyz',
  COMPANY_OPS_MEMBERS: JSON.stringify([
    { email: 'reuben@contact.xyz', name: 'Reuben' },
    { email: 'joe@contact.xyz', name: 'Joe' },
  ]),
  COMPANY_OPS_SLACK_WEBHOOK: '',
  COMPANY_OPS_MCP_TOKENS: JSON.stringify([
    { email: 'reuben@contact.xyz', token: 'reuben-token' },
    { email: 'not-staff@example.com', token: 'not-staff-token' },
  ]),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { POST } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  envMock.COMPANY_OPS_ENABLED = 'true';
});

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
  return new Request('http://localhost/api/ops/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
  });
}

async function callTool<T>(token: string, name: string, args: Record<string, unknown>, id = 1) {
  await POST(makeRequest(token, initEnvelope));
  const res = await POST(
    makeRequest(token, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  );
  const body = (await res.json()) as JsonRpcResponse<{
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  }>;
  const isError = body.result?.isError === true;
  const result = body.result && !isError ? (JSON.parse(body.result.content[0].text) as T) : undefined;
  return { res, result, isError, body };
}

describe('POST /api/ops/mcp — auth gate', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    const res = await POST(makeRequest('reuben-token', initEnvelope));
    expect(res.status).toBe(404);
  });

  it('401 when no Authorization header is provided', async () => {
    const res = await POST(makeRequest(null, initEnvelope));
    expect(res.status).toBe(401);
  });

  it('401 when the bearer token does not resolve to any configured founder', async () => {
    const res = await POST(makeRequest('not-a-real-token', initEnvelope));
    expect(res.status).toBe(401);
  });

  it('403 when the token resolves to an email not on the staff allowlist', async () => {
    const res = await POST(makeRequest('not-staff-token', initEnvelope));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ops/mcp — initialize handshake', () => {
  it('200 with a valid token returns server info', async () => {
    const res = await POST(makeRequest('reuben-token', initEnvelope));
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonRpcResponse<{ serverInfo: { name: string } }>;
    expect(body.result?.serverInfo?.name).toBe('morningform-ops');
  });
});

describe('POST /api/ops/mcp — tools', () => {
  it('list_ops_tasks returns tasks for the default "pilot" board', async () => {
    await prisma.companyOpsTask.create({
      data: { board: 'pilot', title: 'A pilot task', createdBy: 'reuben@contact.xyz' },
    });

    const { res, result } = await callTool<{ tasks: Array<{ title: string }> }>(
      'reuben-token',
      'list_ops_tasks',
      {},
    );
    expect(res.status).toBe(200);
    expect(result?.tasks.some((t) => t.title === 'A pilot task')).toBe(true);
  });

  it('create_ops_task with ownerEmail notifies exactly once and audits the call', async () => {
    const { res, result } = await callTool<{ task: { id: string; ownerEmail: string | null } }>(
      'reuben-token',
      'create_ops_task',
      { title: 'MCP-created task', ownerEmail: 'joe@contact.xyz' },
      2,
    );
    expect(res.status).toBe(200);
    expect(result?.task.ownerEmail).toBe('joe@contact.xyz');

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: result!.task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(1);
    expect(notifyAudits[0].actor).toBe('mcp:reuben@contact.xyz');

    const callAudits = await prisma.companyOpsAudit.findMany({
      where: { actor: 'mcp:reuben@contact.xyz', action: 'mcp.create_ops_task' },
    });
    expect(callAudits.length).toBeGreaterThanOrEqual(1);
  });

  it('create_ops_task rejects a non-staff ownerEmail', async () => {
    const { res, isError } = await callTool(
      'reuben-token',
      'create_ops_task',
      { title: 'bad owner', ownerEmail: 'nobody@example.com' },
      3,
    );
    expect(res.status).toBe(200); // MCP-level 200, tool-level isError
    expect(isError).toBe(true);
  });

  it('assign_ops_task reassigns and notifies exactly once per real change', async () => {
    const task = await prisma.companyOpsTask.create({
      data: { title: 'To be assigned', createdBy: 'reuben@contact.xyz' },
    });

    const { res, result } = await callTool<{ task: { ownerEmail: string | null }; notified: boolean }>(
      'reuben-token',
      'assign_ops_task',
      { taskId: task.id, ownerEmail: 'joe@contact.xyz' },
      4,
    );
    expect(res.status).toBe(200);
    expect(result?.notified).toBe(true);

    // Reassigning to the same owner again must not notify a second time.
    const second = await callTool<{ notified: boolean }>(
      'reuben-token',
      'assign_ops_task',
      { taskId: task.id, ownerEmail: 'joe@contact.xyz' },
      5,
    );
    expect(second.result?.notified).toBe(false);

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(1);
    // The inner task.assign/notify.sent audit rows must carry the same
    // mcp:-prefixed actor as the outer per-call audit, not the bare email.
    expect(notifyAudits[0].actor).toBe('mcp:reuben@contact.xyz');
    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(assignAudits[0].actor).toBe('mcp:reuben@contact.xyz');
  });

  it('two concurrent assign_ops_task calls to the same owner never double-notify or double-audit', async () => {
    // Same target owner for both concurrent calls (not two different
    // owners) so the invariant under test is deterministic regardless of
    // whether the two requests' internal reads actually overlap in time —
    // true overlap makes the CAS reject the loser (surfaced as a tool
    // error); no overlap makes the second call a legitimate idempotent
    // no-op. Either way, exactly one notify/task.assign must land.
    const task = await prisma.companyOpsTask.create({
      data: { title: 'Race target', createdBy: 'reuben@contact.xyz' },
    });

    const [a, b] = await Promise.all([
      callTool('reuben-token', 'assign_ops_task', { taskId: task.id, ownerEmail: 'joe@contact.xyz' }, 10),
      callTool('reuben-token', 'assign_ops_task', { taskId: task.id, ownerEmail: 'joe@contact.xyz' }, 11),
    ]);

    const errors = [a.isError, b.isError].filter(Boolean);
    expect(errors.length).toBeLessThanOrEqual(1);

    const finalTask = await prisma.companyOpsTask.findUnique({ where: { id: task.id } });
    expect(finalTask?.ownerEmail).toBe('joe@contact.xyz');

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(1);

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(assignAudits).toHaveLength(1);
  });

  it('create_ops_task rejects an explicit empty-string board instead of silently orphaning the task', async () => {
    const { isError } = await callTool('reuben-token', 'create_ops_task', { title: 'orphan?', board: '' }, 12);
    expect(isError).toBe(true);
  });

  it('update_ops_task updates status without touching ownerEmail or notifying', async () => {
    const task = await prisma.companyOpsTask.create({
      data: { title: 'Status only', ownerEmail: 'joe@contact.xyz', createdBy: 'reuben@contact.xyz' },
    });

    const { res, result } = await callTool<{ task: { status: string; ownerEmail: string | null } }>(
      'reuben-token',
      'update_ops_task',
      { taskId: task.id, status: 'in_progress' },
      6,
    );
    expect(res.status).toBe(200);
    expect(result?.task.status).toBe('in_progress');
    expect(result?.task.ownerEmail).toBe('joe@contact.xyz');

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(0);
  });

  it('every tool call writes exactly one CompanyOpsAudit row, actor mcp:<email>', async () => {
    const before = await prisma.companyOpsAudit.count({ where: { actor: 'mcp:reuben@contact.xyz' } });
    await callTool('reuben-token', 'list_ops_tasks', {}, 7);
    const after = await prisma.companyOpsAudit.count({ where: { actor: 'mcp:reuben@contact.xyz' } });
    expect(after).toBe(before + 1);
  });
});

describe('POST /api/ops/mcp — rate limit', () => {
  it('returns 429 after 60 calls in the rolling window', async () => {
    const now = new Date();
    await prisma.companyOpsAudit.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        actor: 'mcp:reuben@contact.xyz',
        action: 'mcp.list_ops_tasks',
        detail: '{}',
        createdAt: new Date(now.getTime() - i * 100),
      })),
    });

    const res = await POST(makeRequest('reuben-token', initEnvelope));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
  });
});
