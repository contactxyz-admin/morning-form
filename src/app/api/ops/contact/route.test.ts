import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz,joe@contact.xyz',
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
  envMock.COMPANY_OPS_ENABLED = 'true';
});

// Non-'pilot' board so parallel-running test files (and the import-plan
// tests, which key off the pilot board being empty) never collide.
const BOARD = 'test-contact-create';

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ops/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ops/contact', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ board: BOARD, org: 'Acme' }));
    expect(res.status).toBe(404);
  });

  it('403 for a signed-in non-staff user', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'stranger@example.com' });
    const res = await POST(postReq({ board: BOARD, org: 'Acme' }));
    expect(res.status).toBe(403);
  });

  it('400 for a missing org or unknown status', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await POST(postReq({ board: BOARD }))).status).toBe(400);
    expect((await POST(postReq({ board: BOARD, org: 'Acme', status: 'Vibing' }))).status).toBe(400);
  });

  it('201 creates the contact with defaults and writes an audit row', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await POST(postReq({ board: BOARD, org: 'Acme Labs', type: 'Partner' }));
    expect(res.status).toBe(201);
    const { contact } = (await res.json()) as { contact: { id: string; status: string; createdBy: string } };
    expect(contact.status).toBe('Not started');
    expect(contact.createdBy).toBe('reuben@contact.xyz');

    const audit = await prisma.companyOpsAudit.findFirst({
      where: { action: 'contact.create' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.detail).toContain('Acme Labs');
  });
});
