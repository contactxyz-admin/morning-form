import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz',
  COMPANY_OPS_MEMBERS: '[]',
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

import { DELETE, PATCH } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
});

const BOARD = 'test-decision-id';

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ops/decision/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function makeDecision(status: 'open' | 'decided' = 'open') {
  return prisma.companyOpsDecision.create({
    data: {
      board: BOARD,
      name: `Decision ${Math.random()}`,
      status,
      decidedAt: status === 'decided' ? new Date('2026-07-01T00:00:00Z') : null,
      createdBy: 'reuben@contact.xyz',
    },
  });
}

describe('PATCH /api/ops/decision/[id]', () => {
  it('stamps decidedAt when flipping open -> decided', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const row = await makeDecision('open');
    const res = await PATCH(patchReq({ status: 'decided' }), { params: { id: row.id } });
    expect(res.status).toBe(200);
    const { decision } = (await res.json()) as { decision: { status: string; decidedAt: string | null } };
    expect(decision.status).toBe('decided');
    expect(decision.decidedAt).not.toBeNull();
  });

  it('clears decidedAt when reopening', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const row = await makeDecision('decided');
    const res = await PATCH(patchReq({ status: 'open' }), { params: { id: row.id } });
    const { decision } = (await res.json()) as { decision: { decidedAt: string | null } };
    expect(decision.decidedAt).toBeNull();
  });

  it('leaves decidedAt untouched on an unrelated edit or same-status write', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const row = await makeDecision('decided');
    const res = await PATCH(patchReq({ rationale: 'because', status: 'decided' }), { params: { id: row.id } });
    const { decision } = (await res.json()) as { decision: { decidedAt: string | null; rationale: string } };
    expect(decision.rationale).toBe('because');
    expect(decision.decidedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('404 for an unknown id', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await PATCH(patchReq({ status: 'decided' }), { params: { id: 'nope' } });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/ops/decision/[id]', () => {
  it('deletes and audits; a second delete 404s', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const row = await makeDecision('open');
    const req = new NextRequest('http://localhost/api/ops/decision/x', { method: 'DELETE' });
    expect((await DELETE(req, { params: { id: row.id } })).status).toBe(200);
    expect((await DELETE(req, { params: { id: row.id } })).status).toBe(404);
  });
});
