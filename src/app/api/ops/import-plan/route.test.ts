import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';

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

import { POST } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
});

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ops/import-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// NOTE: this file owns the 'pilot' board for contacts/decisions — other test
// files use their own board names so these emptiness checks stay reliable.
describe('POST /api/ops/import-plan', () => {
  it('imports every plan contact once, then 409s', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ kind: 'contacts' }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { imported: number }).imported).toBe(PILOT_PLAN.contacts.length);

    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await POST(postReq({ kind: 'contacts' }))).status).toBe(409);
  });

  it('imports decisions with mapped statuses and no fabricated decidedAt', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ kind: 'decisions' }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { imported: number }).imported).toBe(PILOT_PLAN.decisions.length);

    const rows = await prisma.companyOpsDecision.findMany({ where: { board: 'pilot' } });
    const decided = rows.filter((r) => r.status === 'decided');
    expect(decided.length).toBe(PILOT_PLAN.decisions.filter((d) => d[3] === 'Decided').length);
    expect(decided.every((r) => r.decidedAt === null)).toBe(true);
    expect(rows.every((r) => r.status === 'decided' || r.status === 'open')).toBe(true);
  });

  it('400 for an unknown kind', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await POST(postReq({ kind: 'tasks' }))).status).toBe(400);
  });
});
