import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode, ingestExtraction } from '@/lib/graph/mutations';
import { getNodeProvenanceHandler } from './get-node-provenance';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('get_node_provenance handler', () => {
  it('returns citations for the owner with excerpts, kind, and capturedAt', async () => {
    const userId = await makeTestUser(prisma, 'provenance-happy');
    const out = await ingestExtraction(prisma, userId, {
      document: { kind: 'lab_pdf', capturedAt: new Date('2026-03-14'), contentHash: 'c-happy' },
      chunks: [
        { index: 0, text: 'Ferritin 12 ug/L', offsetStart: 0, offsetEnd: 16, pageNumber: 2 },
      ],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          supportingChunkIndices: [0],
        },
      ],
      edges: [],
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await getNodeProvenanceHandler.execute(ctx, { nodeId: out.nodeIds[0] });

    expect(result.found).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].excerpt).toBe('Ferritin 12 ug/L');
    expect(result.citations[0].documentKind).toBe('lab_pdf');
    expect(result.citations[0].pageNumber).toBe(2);
    expect(result.citations[0].capturedAt).toBe(new Date('2026-03-14').toISOString());
    expect(result.truncated).toBe(false);
  });

  it('returns found=false when the node belongs to a different user (no leak)', async () => {
    const owner = await makeTestUser(prisma, 'provenance-leak-owner');
    const attacker = await makeTestUser(prisma, 'provenance-leak-atk');
    const out = await ingestExtraction(prisma, owner, {
      document: { kind: 'lab_pdf', capturedAt: new Date(), contentHash: 'c-leak' },
      chunks: [{ index: 0, text: 'Ferritin 18', offsetStart: 0, offsetEnd: 11, pageNumber: 1 }],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          supportingChunkIndices: [0],
        },
      ],
      edges: [],
    });

    const ctx: ToolContext = { db: prisma, userId: attacker, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await getNodeProvenanceHandler.execute(ctx, { nodeId: out.nodeIds[0] });
    expect(result.found).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it('returns found=true with empty citations for a node with no SUPPORTS edges', async () => {
    const userId = await makeTestUser(prisma, 'provenance-empty-citations');
    const node = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await getNodeProvenanceHandler.execute(ctx, { nodeId: node.id });
    expect(result.found).toBe(true);
    expect(result.citations).toEqual([]);
  });

  it('truncates when citations exceed the limit', async () => {
    const userId = await makeTestUser(prisma, 'provenance-truncate');
    const out = await ingestExtraction(prisma, userId, {
      document: { kind: 'lab_pdf', capturedAt: new Date(), contentHash: 'c-trunc' },
      chunks: [
        { index: 0, text: 'Ferritin 18', offsetStart: 0, offsetEnd: 11, pageNumber: 1 },
        { index: 1, text: 'Ferritin 12', offsetStart: 12, offsetEnd: 23, pageNumber: 1 },
        { index: 2, text: 'Ferritin 9', offsetStart: 24, offsetEnd: 34, pageNumber: 1 },
      ],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          supportingChunkIndices: [0, 1, 2],
        },
      ],
      edges: [],
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron', requestId: 'test-req-id' };
    const result = await getNodeProvenanceHandler.execute(ctx, {
      nodeId: out.nodeIds[0],
      limit: 2,
    });
    expect(result.citations).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
