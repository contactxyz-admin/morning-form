import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const sendEmailMock = vi.fn<(input: { to: string; subject: string }) => Promise<{ sent: boolean }>>();

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
  CRON_SECRET: 'test-cron-secret',
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

vi.mock('@/lib/auth/email', () => ({
  sendEmail: (input: { to: string; subject: string }) => sendEmailMock(input),
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { GET } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  sendEmailMock.mockReset();
  envMock.COMPANY_OPS_ENABLED = 'true';
  envMock.CRON_SECRET = 'test-cron-secret';
});

function req(auth?: string): Request {
  return new Request('http://localhost/api/cron/ops-digest', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('GET /api/cron/ops-digest', () => {
  it('404 when the ops board is disabled', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    expect((await GET(req('Bearer test-cron-secret'))).status).toBe(404);
  });

  it('401 on a wrong or missing bearer, and when CRON_SECRET is unset', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer nope'))).status).toBe(401);
    envMock.CRON_SECRET = '';
    expect((await GET(req('Bearer '))).status).toBe(401);
  });

  it('sends the digest to every member and writes a digest.sent audit row', async () => {
    sendEmailMock.mockResolvedValue({ sent: true });
    const res = await GET(req('Bearer test-cron-secret'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sent: string[]; slack: boolean };
    expect(body.ok).toBe(true);
    expect(body.sent.sort()).toEqual(['joe@contact.xyz', 'reuben@contact.xyz']);
    expect(body.slack).toBe(false); // no webhook configured in this env
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock.mock.calls[0][0].subject).toContain('Ops digest');

    const audit = await prisma.companyOpsAudit.findFirst({
      where: { action: 'digest.sent' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actor).toBe('cron:ops-digest');
  });

  it('reports digest.failed when every channel fails', async () => {
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const res = await GET(req('Bearer test-cron-secret'));
    const body = (await res.json()) as { ok: boolean; failed: number };
    expect(body.ok).toBe(false);
    expect(body.failed).toBe(2);
    const audit = await prisma.companyOpsAudit.findFirst({
      where: { action: 'digest.failed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});
