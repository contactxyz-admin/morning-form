import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { listGraphIndexHandler } from './list-graph-index';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// Whole-graph tool: ctx.topicKey is ignored. The sentinel value here mirrors
// what the Phase-2 MCP adapter will pass when invoking whole-graph tools.
function makeCtx(userId: string): ToolContext {
  return { db: prisma, userId, topicKey: '__whole_graph__', requestId: 'test-req' };
}

describe('list_graph_index handler', () => {
  it('returns the whole-graph RecordIndex shape with topics, recentActivity, and graph fields', async () => {
    const userId = await makeTestUser(prisma, 'mcp-list-happy');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });

    const result = await listGraphIndexHandler.execute(makeCtx(userId), {});

    expect(Array.isArray(result.topics)).toBe(true);
    expect(result.totalNodes).toBe(2);
    expect(result.nodes).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.nodes.map((n) => n.canonicalKey).sort()).toEqual(['fatigue', 'ferritin']);
    // Wire shape — timestamps are ISO strings.
    expect(typeof result.nodes[0].createdAt).toBe('string');
  });

  it('returns an empty graph cleanly (totalNodes=0, nodes=[], truncated=false)', async () => {
    const userId = await makeTestUser(prisma, 'mcp-list-empty');
    const result = await listGraphIndexHandler.execute(makeCtx(userId), {});

    expect(result.totalNodes).toBe(0);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.truncated).toBe(false);
    // Topic stubs are present even for empty graphs (matches `aggregateRecord`).
    expect(result.topics.length).toBeGreaterThan(0);
  });

  it('exposes source documents on the wire (the agent-facing parity surface)', async () => {
    // External MCP clients call list_graph_index and consume `result.sources`
    // — this is the agent equivalent of the canvas hub-and-spoke. Pin the
    // shape so a regression that drops the field is caught at the external
    // wire contract layer, not just at the internal aggregator layer.
    const userId = await makeTestUser(prisma, 'mcp-list-sources');
    const doc = await prisma.sourceDocument.create({
      data: {
        userId,
        kind: 'lab_pdf',
        sourceRef: 'panel.pdf',
        capturedAt: new Date('2026-05-01T00:00:00Z'),
        contentHash: 'hash-mcp-list-sources',
        storagePath: 'fixtures/mcp-list-sources.pdf',
      },
    });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    const result = await listGraphIndexHandler.execute(makeCtx(userId), {});

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      id: doc.id,
      kind: 'lab_pdf',
      capturedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(typeof result.sources[0].createdAt).toBe('string');
  });

  it('scopes by userId — never returns another user\'s nodes', async () => {
    const userA = await makeTestUser(prisma, 'mcp-list-userA');
    const userB = await makeTestUser(prisma, 'mcp-list-userB');
    await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'private_marker_for_A',
      displayName: "A's private marker",
    });

    const result = await listGraphIndexHandler.execute(makeCtx(userB), {});

    expect(result.totalNodes).toBe(0);
    expect(result.nodes).toEqual([]);
  });

  it('ignores ctx.topicKey (whole-graph contract)', async () => {
    const userId = await makeTestUser(prisma, 'mcp-list-topic-ignored');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'cholesterol_apob',
      displayName: 'ApoB',
    });

    const resultGeneral = await listGraphIndexHandler.execute(
      { db: prisma, userId, topicKey: 'general', requestId: 'r1' },
      {},
    );
    const resultIron = await listGraphIndexHandler.execute(
      { db: prisma, userId, topicKey: 'iron', requestId: 'r2' },
      {},
    );

    // Same shape regardless of topicKey.
    expect(resultGeneral.totalNodes).toBe(resultIron.totalNodes);
    expect(resultGeneral.nodes.map((n) => n.id).sort()).toEqual(
      resultIron.nodes.map((n) => n.id).sort(),
    );
  });
});
