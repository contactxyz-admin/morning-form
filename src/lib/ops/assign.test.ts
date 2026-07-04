import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

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

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

const notifyMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/ops/notify', () => ({
  notifyDelegation: (...args: unknown[]) => notifyMock(...args),
}));

import { assignTask, maybeNotifyAssignment } from './assign';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  notifyMock.mockClear();
});

async function makeTask(overrides: Partial<{ ownerEmail: string | null }> = {}) {
  return prisma.companyOpsTask.create({
    data: {
      title: 'Secure venue',
      createdBy: 'reuben@contact.xyz',
      ownerEmail: overrides.ownerEmail ?? null,
    },
  });
}

describe('assignTask', () => {
  it('null -> email: updates ownerEmail, writes task.assign, notifies exactly once', async () => {
    const task = await makeTask();
    const result = await assignTask(prisma, {
      taskId: task.id,
      newOwnerEmail: 'joe@contact.xyz',
      actorEmail: 'reuben@contact.xyz',
    });

    expect(result?.notified).toBe(true);
    expect(result?.task.ownerEmail).toBe('joe@contact.xyz');
    expect(notifyMock).toHaveBeenCalledTimes(1);

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(audits).toHaveLength(1);
  });

  it('reassigning to the same owner does not notify or write task.assign', async () => {
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });
    const result = await assignTask(prisma, {
      taskId: task.id,
      newOwnerEmail: 'joe@contact.xyz',
      actorEmail: 'reuben@contact.xyz',
    });

    expect(result?.notified).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(audits).toHaveLength(0);
  });

  it('assigning to null (unassign) does not notify', async () => {
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });
    const result = await assignTask(prisma, {
      taskId: task.id,
      newOwnerEmail: null,
      actorEmail: 'reuben@contact.xyz',
    });

    expect(result?.notified).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    const updated = await prisma.companyOpsTask.findUnique({ where: { id: task.id } });
    expect(updated?.ownerEmail).toBeNull();
  });

  it('returns null for a task that does not exist', async () => {
    const result = await assignTask(prisma, {
      taskId: 'does-not-exist',
      newOwnerEmail: 'joe@contact.xyz',
      actorEmail: 'reuben@contact.xyz',
    });
    expect(result).toBeNull();
  });

  it('two concurrent assignments of the same null -> email transition notify exactly once (race safety)', async () => {
    const task = await makeTask({ ownerEmail: null });

    const [a, b] = await Promise.all([
      assignTask(prisma, { taskId: task.id, newOwnerEmail: 'joe@contact.xyz', actorEmail: 'reuben@contact.xyz' }),
      assignTask(prisma, { taskId: task.id, newOwnerEmail: 'joe@contact.xyz', actorEmail: 'reuben@contact.xyz' }),
    ]);

    // Exactly one of the two racing requests won the compare-and-swap.
    const notifiedCount = [a?.notified, b?.notified].filter(Boolean).length;
    expect(notifiedCount).toBe(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);

    const audits = await prisma.companyOpsAudit.findMany({
      where: { taskId: task.id, action: 'task.assign' },
    });
    expect(audits).toHaveLength(1);

    const finalTask = await prisma.companyOpsTask.findUnique({ where: { id: task.id } });
    expect(finalTask?.ownerEmail).toBe('joe@contact.xyz');
  });
});

describe('maybeNotifyAssignment', () => {
  it('does nothing when newOwnerEmail is null', async () => {
    const task = await makeTask({ ownerEmail: null });
    const fired = await maybeNotifyAssignment(prisma, {
      previousOwnerEmail: 'joe@contact.xyz',
      updatedTask: task,
      actorEmail: 'reuben@contact.xyz',
    });
    expect(fired).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('does nothing when previous and new owner are the same', async () => {
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });
    const fired = await maybeNotifyAssignment(prisma, {
      previousOwnerEmail: 'joe@contact.xyz',
      updatedTask: task,
      actorEmail: 'reuben@contact.xyz',
    });
    expect(fired).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('fires when the owner genuinely changes to a non-null value', async () => {
    const task = await makeTask({ ownerEmail: 'joe@contact.xyz' });
    const fired = await maybeNotifyAssignment(prisma, {
      previousOwnerEmail: null,
      updatedTask: task,
      actorEmail: 'reuben@contact.xyz',
    });
    expect(fired).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
