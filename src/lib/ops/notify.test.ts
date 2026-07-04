import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz,joe@contact.xyz',
  COMPANY_OPS_MEMBERS: JSON.stringify([
    { email: 'reuben@contact.xyz', name: 'Reuben' },
    { email: 'joe@contact.xyz', name: 'Joe', slackId: 'U123' },
  ]),
  COMPANY_OPS_SLACK_WEBHOOK: '',
  COMPANY_OPS_MCP_TOKENS: '[]',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
};

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

const sendEmailMock = vi.fn();
vi.mock('@/lib/auth/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { notifyDelegation } from './notify';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  sendEmailMock.mockReset();
  envMock.COMPANY_OPS_SLACK_WEBHOOK = '';
  vi.unstubAllGlobals();
});

async function makeTask() {
  return prisma.companyOpsTask.create({
    data: {
      title: 'Secure venue',
      detail: 'Find a gym with a private room',
      phase: '0 · Decide',
      createdBy: 'reuben@contact.xyz',
    },
  });
}

describe('notifyDelegation', () => {
  it('emails the new owner and writes exactly one notify.sent row', async () => {
    sendEmailMock.mockResolvedValue({ sent: true });
    const task = await makeTask();

    await notifyDelegation(prisma, {
      task,
      newOwnerEmail: 'joe@contact.xyz',
      actorEmail: 'reuben@contact.xyz',
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0] as { to: string; subject: string };
    expect(args.to).toBe('joe@contact.xyz');
    expect(args.subject).toContain('Secure venue');

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(audits).toHaveLength(1);
  });

  it('posts to Slack when a webhook is configured, mentioning the slackId', async () => {
    envMock.COMPANY_OPS_SLACK_WEBHOOK = 'https://hooks.slack.example/T/B/X';
    sendEmailMock.mockResolvedValue({ sent: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const task = await makeTask();
    await notifyDelegation(prisma, {
      task,
      newOwnerEmail: 'joe@contact.xyz',
      actorEmail: 'reuben@contact.xyz',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://hooks.slack.example/T/B/X');
    const body = JSON.parse(init.body) as { text: string };
    expect(body.text).toContain('<@U123>');
  });

  it('a Slack failure is swallowed — still resolves, still writes notify.sent from the email channel', async () => {
    envMock.COMPANY_OPS_SLACK_WEBHOOK = 'https://hooks.slack.example/T/B/X';
    sendEmailMock.mockResolvedValue({ sent: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('slack down')));

    const task = await makeTask();
    await expect(
      notifyDelegation(prisma, { task, newOwnerEmail: 'joe@contact.xyz', actorEmail: 'reuben@contact.xyz' }),
    ).resolves.toBeUndefined();

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.sent' },
    });
    expect(audits).toHaveLength(1);
  });

  it('writes notify.failed (and never throws) when email itself fails and no Slack is configured', async () => {
    sendEmailMock.mockRejectedValue(new Error('resend down'));
    const task = await makeTask();

    await expect(
      notifyDelegation(prisma, { task, newOwnerEmail: 'joe@contact.xyz', actorEmail: 'reuben@contact.xyz' }),
    ).resolves.toBeUndefined();

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'notify.failed' },
    });
    expect(audits).toHaveLength(1);
  });
});
