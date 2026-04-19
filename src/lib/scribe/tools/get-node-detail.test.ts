import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { getNodeDetailHandler } from './get-node-detail';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('get_node_detail handler', () => {
  it('returns the node when owned by the current user', async () => {
    const userId = await makeTestUser(prisma, 'node-detail-happy');
    const { id: nodeId } = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 18, referenceRangeLow: 15, referenceRangeHigh: 150 },
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await getNodeDetailHandler.execute(ctx, { nodeId });

    expect(result.found).toBe(true);
    expect(result.node?.id).toBe(nodeId);
    expect(result.node?.canonicalKey).toBe('ferritin');
    expect(result.node?.attributes.latestValue).toBe(18);
    expect(result.node?.attributes.referenceRangeLow).toBe(15);
  });

  it('returns found=false for a node owned by a different user', async () => {
    const userA = await makeTestUser(prisma, 'node-detail-userA');
    const userB = await makeTestUser(prisma, 'node-detail-userB');
    const { id: nodeId } = await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    const ctx: ToolContext = { db: prisma, userId: userB, topicKey: 'iron' };
    const result = await getNodeDetailHandler.execute(ctx, { nodeId });

    expect(result.found).toBe(false);
    expect(result.node).toBeNull();
  });

  it('returns found=false for a nonexistent nodeId', async () => {
    const userId = await makeTestUser(prisma, 'node-detail-missing');
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await getNodeDetailHandler.execute(ctx, { nodeId: 'nope-not-a-real-id' });
    expect(result.found).toBe(false);
    expect(result.node).toBeNull();
  });
});
