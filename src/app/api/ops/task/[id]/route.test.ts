import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz,joe@contact.xyz',
  COMPANY_OPS_MEMBERS: JSON.stringify([
    { email: 'reuben@contact.xyz', name: 'Reuben' },
    { email: 'joe@contact.xyz', name: 'Joe' },
  ]),
  COMPANY_OPS_SLACK_WEBHOOK: '',
  COMPANY_OPS_MCP_TOKENS: '[]',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
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

import { PATCH, DELETE } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  envMock.COMPANY_OPS_ENABLED = 'true';
});

async function makeTask(overrides: Partial<{ ownerEmail: string | null; title: string }> = {}) {
  return prisma.companyOpsTask.create({
    data: {
      title: overrides.title ?? 'Secure venue',
      detail: 'Find a gym with a private room',
      phase: '0 · Decide',
      ownerEmail: overrides.ownerEmail ?? null,
      createdBy: 'reuben@contact.xyz',
    },
  });
}

function patchReq(id: string, body: unknown): { req: NextRequest; ctx: { params: { id: string } } } {
  const req = new NextRequest(`http://localhost/api/ops/task/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: { id } } };
}

function deleteReq(id: string): { req: NextRequest; ctx: { params: { id: string } } } {
  const req = new NextRequest(`http://localhost/api/ops/task/${id}`, { method: 'DELETE' });
  return { req, ctx: { params: { id } } };
}

describe('PATCH /api/ops/task/[id]', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();

    const { req, ctx } = patchReq(task.id, { title: 'new' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const { req, ctx } = patchReq('any-id', { title: 'new' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 when authenticated but not staff', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'random@example.com' });
    const task = await makeTask();
    const { req, ctx } = patchReq(task.id, { title: 'new' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it('404 when the task does not exist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const { req, ctx } = patchReq('does-not-exist', { title: 'new' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('400 when status is invalid', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();
    const { req, ctx } = patchReq(task.id, { status: 'nope' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('400 when ownerEmail is not on the staff allowlist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();
    const { req, ctx } = patchReq(task.id, { ownerEmail: 'not-staff@example.com' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('editing an unrelated field on an already-owned task fires no notify', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });

    const { req, ctx } = patchReq(task.id, { title: 'Renamed' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);

    const updateAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.update' },
    });
    expect(updateAudits).toHaveLength(1);

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: { in: ['task.assign', 'notify.sent', 'notify.failed'] } },
    });
    expect(assignAudits).toHaveLength(0);
  });

  it('reassigning owner null -> email fires exactly one task.assign + notify.sent', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: null });

    const { req, ctx } = patchReq(task.id, { ownerEmail: 'joe@contact.xyz' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { ownerEmail: string | null } };
    expect(body.task.ownerEmail).toBe('joe@contact.xyz');

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(assignAudits).toHaveLength(1);

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(1);
  });

  it('two concurrent PATCH requests reassigning the same task never produce a false-success audit for a request whose edits did not apply', async () => {
    // Same target ownerEmail for both concurrent requests (not two
    // different owners) so the assertions are deterministic regardless of
    // whether the two requests' internal reads truly overlap in time: a
    // real overlap makes the CAS reject the loser (409, no audit); no
    // overlap makes both legitimately succeed sequentially (200, 200, two
    // real audits) — either way, the count of task.update audit rows must
    // exactly match the count of 200 responses, never more.
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: null });

    const a = patchReq(task.id, { ownerEmail: 'joe@contact.xyz', title: 'Renamed by A' });
    const b = patchReq(task.id, { ownerEmail: 'joe@contact.xyz', title: 'Renamed by B' });
    const [resA, resB] = await Promise.all([PATCH(a.req, a.ctx), PATCH(b.req, b.ctx)]);
    const statuses = [resA.status, resB.status];

    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    const successCount = statuses.filter((s) => s === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    const updateAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.update' },
    });
    expect(updateAudits).toHaveLength(successCount);

    const final = await prisma.companyOpsTask.findUnique({ where: { id: task.id } });
    expect(['Renamed by A', 'Renamed by B']).toContain(final?.title);
    expect(final?.ownerEmail).toBe('joe@contact.xyz');
  });

  it('reassigning to the same owner does not notify again', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });

    const { req, ctx } = patchReq(task.id, { ownerEmail: 'joe@contact.xyz' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(assignAudits).toHaveLength(0);
  });

  it('reassigning to the same owner with different casing does not notify', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });

    const { req, ctx } = patchReq(task.id, { ownerEmail: 'JOE@CONTACT.XYZ' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { ownerEmail: string | null } };
    expect(body.task.ownerEmail).toBe('joe@contact.xyz');

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(assignAudits).toHaveLength(0);
  });

  it('unassigning (ownerEmail: null) does not notify', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });

    const { req, ctx } = patchReq(task.id, { ownerEmail: null });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { ownerEmail: string | null } };
    expect(body.task.ownerEmail).toBeNull();

    const assignAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: { in: ['task.assign', 'notify.sent'] } },
    });
    expect(assignAudits).toHaveLength(0);
  });
});

describe('DELETE /api/ops/task/[id]', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();
    const { req, ctx } = deleteReq(task.id);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('403 when not staff', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'random@example.com' });
    const task = await makeTask();
    const { req, ctx } = deleteReq(task.id);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it('404 when the task does not exist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const { req, ctx } = deleteReq('does-not-exist');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('200 deletes the task and writes a task.delete audit row', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();

    const { req, ctx } = deleteReq(task.id);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);

    const stillThere = await prisma.companyOpsTask.findUnique({ where: { id: task.id } });
    expect(stillThere).toBeNull();

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.delete' },
    });
    expect(audits).toHaveLength(1);
  });

  it('two concurrent deletes of the same task: one 200, one 404 — never a raw 500', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const task = await makeTask();

    const a = deleteReq(task.id);
    const b = deleteReq(task.id);
    const [resA, resB] = await Promise.all([DELETE(a.req, a.ctx), DELETE(b.req, b.ctx)]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 404]);
  });
});
