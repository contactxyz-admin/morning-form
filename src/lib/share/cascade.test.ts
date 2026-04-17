/**
 * Regression test for the UK-GDPR right-to-erasure contract:
 * deleting a User must cascade to SharedView and GraphNodeLayout rows.
 *
 * Covered separately from tokens.test.ts because the cascade is a
 * schema-level guarantee, not a behaviour of the share helpers — and
 * regressing it (dropping `onDelete: Cascade` from either relation) would
 * orphan rows that the owner believes they erased.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createShare } from './tokens';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('User deletion cascade', () => {
  it('removes SharedView rows owned by the deleted user', async () => {
    const userId = await makeTestUser(prisma, 'cascade-share');

    await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
      label: 'For Dr. Smith',
    });
    await createShare(prisma, {
      userId,
      scope: { kind: 'node', nodeId: 'n-ferritin' },
    });

    expect(await prisma.sharedView.count({ where: { userId } })).toBe(2);

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.sharedView.count({ where: { userId } })).toBe(0);
  });

  it('removes GraphNodeLayout rows owned by the deleted user', async () => {
    const userId = await makeTestUser(prisma, 'cascade-layout');

    await prisma.graphNodeLayout.createMany({
      data: [
        { userId, nodeId: 'n-a', x: 0, y: 0, pinned: false },
        { userId, nodeId: 'n-b', x: 10, y: 20, pinned: true },
      ],
    });

    expect(await prisma.graphNodeLayout.count({ where: { userId } })).toBe(2);

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.graphNodeLayout.count({ where: { userId } })).toBe(0);
  });

  it('leaves other users untouched when one user is deleted', async () => {
    const victimId = await makeTestUser(prisma, 'cascade-victim');
    const bystanderId = await makeTestUser(prisma, 'cascade-bystander');

    await createShare(prisma, {
      userId: victimId,
      scope: { kind: 'topic', topicKey: 'iron' },
    });
    await createShare(prisma, {
      userId: bystanderId,
      scope: { kind: 'topic', topicKey: 'sleep-recovery' },
    });
    await prisma.graphNodeLayout.create({
      data: { userId: bystanderId, nodeId: 'n-x', x: 1, y: 2 },
    });

    await prisma.user.delete({ where: { id: victimId } });

    expect(await prisma.sharedView.count({ where: { userId: victimId } })).toBe(0);
    expect(await prisma.sharedView.count({ where: { userId: bystanderId } })).toBe(1);
    expect(await prisma.graphNodeLayout.count({ where: { userId: bystanderId } })).toBe(1);
  });
});
