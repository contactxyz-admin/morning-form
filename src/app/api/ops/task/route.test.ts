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

import { POST } from './route';

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

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ops/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ops/task', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });

    const res = await POST(postReq({ title: 'x' }));
    expect(res.status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ title: 'x' }));
    expect(res.status).toBe(401);
  });

  it('403 when authenticated but not staff', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'random@example.com' });
    const res = await POST(postReq({ title: 'x' }));
    expect(res.status).toBe(403);
  });

  it('400 when title is missing', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ detail: 'no title here' }));
    expect(res.status).toBe(400);
  });

  it('400 when status is not one of the allowed values', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ title: 'x', status: 'in-flight' }));
    expect(res.status).toBe(400);
  });

  it('400 when ownerEmail is not on the staff allowlist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ title: 'x', ownerEmail: 'not-staff@example.com' }));
    expect(res.status).toBe(400);
  });

  it('201 happy path creates the task and writes a task.create audit row', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ title: 'Secure venue', phase: '0 · Decide' }));
    expect(res.status).toBe(201);

    const body = (await res.json()) as { task: { id: string; title: string; createdBy: string } };
    expect(body.task.title).toBe('Secure venue');
    expect(body.task.createdBy).toBe('reuben@contact.xyz');

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: body.task.id, action: 'task.create' },
    });
    expect(audits).toHaveLength(1);
  });

  it('creating with ownerEmail set fires exactly one notify.sent audit row', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ title: 'Assigned on create', ownerEmail: 'joe@contact.xyz' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: { id: string } };

    const notifyAudits = await prisma.companyOpsAudit.findMany({
      where: { taskId: body.task.id, action: 'notify.sent' },
    });
    expect(notifyAudits).toHaveLength(1);
  });

  it('creating without ownerEmail fires no notify audit', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ title: 'Unassigned task' }));
    const body = (await res.json()) as { task: { id: string } };

    const notifyAudits = await prisma.companyOpsAudit.findMany({ where: { taskId: body.task.id } });
    expect(notifyAudits.filter((a) => a.action.startsWith('notify.'))).toHaveLength(0);
  });
});
