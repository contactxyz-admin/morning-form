import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { searchGraphNodesHandler } from './search-graph-nodes';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function seedIronSubgraph(userId: string) {
  await addNode(prisma, userId, {
    type: 'biomarker',
    canonicalKey: 'ferritin',
    displayName: 'Ferritin',
    attributes: { latestValue: 18, unit: 'ug/L' },
  });
  await addNode(prisma, userId, {
    type: 'biomarker',
    canonicalKey: 'haemoglobin',
    displayName: 'Haemoglobin',
    attributes: { latestValue: 132, unit: 'g/L' },
  });
  await addNode(prisma, userId, {
    type: 'symptom',
    canonicalKey: 'fatigue',
    displayName: 'Fatigue',
  });
}

describe('search_graph_nodes handler', () => {
  it('returns iron-subgraph nodes matching the query (happy path)', async () => {
    const userId = await makeTestUser(prisma, 'search-happy');
    await seedIronSubgraph(userId);

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await searchGraphNodesHandler.execute(ctx, { query: 'ferritin' });

    expect(result.topicKey).toBe('iron');
    expect(result.truncated).toBe(false);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].canonicalKey).toBe('ferritin');
    expect(result.matches[0].type).toBe('biomarker');
  });

  it('scopes to the topic subgraph — a node outside the topic never appears', async () => {
    // The iron topic's canonicalKeyPatterns do not include 'cholesterol', so
    // seeding a cholesterol biomarker should not surface for an iron query.
    const userId = await makeTestUser(prisma, 'search-topic-scope');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'cholesterol_ldl',
      displayName: 'LDL cholesterol',
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    // Broad query that could match either name — topic scope must exclude the
    // non-iron biomarker.
    const result = await searchGraphNodesHandler.execute(ctx, { query: 'cholesterol' });
    expect(result.matches).toHaveLength(0);
  });

  it('cannot see another user\'s data (user-scoping invariant)', async () => {
    const userA = await makeTestUser(prisma, 'search-userA');
    const userB = await makeTestUser(prisma, 'search-userB');
    await seedIronSubgraph(userA);

    const ctx: ToolContext = { db: prisma, userId: userB, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await searchGraphNodesHandler.execute(ctx, { query: 'ferritin' });
    expect(result.matches).toHaveLength(0);
  });

  it('truncates to `limit` and sets truncated=true when more matches exist', async () => {
    const userId = await makeTestUser(prisma, 'search-truncate');
    // Iron subgraph allows biomarker and related types; seed a few matching
    // the patterns so the filter finds multiple.
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin',
    });
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'transferrin_saturation', displayName: 'Transferrin saturation',
    });
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'haemoglobin', displayName: 'Haemoglobin',
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    // Query matches all three on canonicalKey via substring 'r' — keep it
    // narrow enough to land >1 but controllable.
    const result = await searchGraphNodesHandler.execute(ctx, { query: 'r', limit: 1 });
    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('returns empty matches for an unknown topicKey', async () => {
    const userId = await makeTestUser(prisma, 'search-unknown-topic');
    await seedIronSubgraph(userId);
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'nonsense', requestId: 'test-req-id' };
    const result = await searchGraphNodesHandler.execute(ctx, { query: 'ferritin' });
    expect(result.matches).toHaveLength(0);
  });
});
