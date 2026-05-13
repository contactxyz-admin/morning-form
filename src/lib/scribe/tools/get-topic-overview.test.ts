import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { getTopicOverviewHandler } from './get-topic-overview';
import type { ToolContext } from './types';
import { listTopicConfigs } from '@/lib/topics/registry';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// The handler takes topicKey as an arg (R7) — ctx.topicKey is irrelevant.
function makeCtx(userId: string): ToolContext {
  return { db: prisma, userId, topicKey: '__whole_graph__', requestId: 'test-req' };
}

describe('get_topic_overview handler', () => {
  it('returns { found: true, topic } for a registered topic with seeded nodes', async () => {
    const userId = await makeTestUser(prisma, 'mcp-overview-iron');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    const result = await getTopicOverviewHandler.execute(makeCtx(userId), {
      topicKey: 'iron',
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.topic.topicKey).toBe('iron');
      expect(result.topic.nodeCount).toBeGreaterThanOrEqual(1);
      expect(['stub', 'full', 'error']).toContain(result.topic.status);
    }
  });

  it('returns { found: false, knownTopics } for an unknown topicKey', async () => {
    const userId = await makeTestUser(prisma, 'mcp-overview-unknown');
    const result = await getTopicOverviewHandler.execute(makeCtx(userId), {
      topicKey: 'this_topic_does_not_exist',
    });

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(Array.isArray(result.knownTopics)).toBe(true);
      expect(result.knownTopics.length).toBeGreaterThan(0);
      // The known list should match the registry's known set.
      expect(result.knownTopics.sort()).toEqual(
        listTopicConfigs()
          .map((c) => c.topicKey)
          .sort(),
      );
    }
  });

  it('scopes by userId — another user\'s nodes don\'t inflate the count', async () => {
    const userA = await makeTestUser(prisma, 'mcp-overview-userA');
    const userB = await makeTestUser(prisma, 'mcp-overview-userB');
    await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    const result = await getTopicOverviewHandler.execute(makeCtx(userB), {
      topicKey: 'iron',
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.topic.nodeCount).toBe(0);
      expect(result.topic.sourceCount).toBe(0);
    }
  });

  it('returns the stub state for a registered topic with zero seeded nodes', async () => {
    const userId = await makeTestUser(prisma, 'mcp-overview-empty');
    const result = await getTopicOverviewHandler.execute(makeCtx(userId), {
      topicKey: 'iron',
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.topic.status).toBe('stub');
      expect(result.topic.nodeCount).toBe(0);
      expect(result.topic.updatedAt).toBeNull();
    }
  });
});
