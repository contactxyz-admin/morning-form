import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode, ingestExtraction } from './mutations';
import {
  getGraphRevision,
  getNode,
  getNodesByType,
  getProvenanceForNode,
  getSubgraphForTopic,
} from './queries';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('getNode + getNodesByType', () => {
  it('returns a parsed node record with attributes deserialised', async () => {
    const userId = await makeTestUser(prisma, 'getnode-1');
    const created = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 18 },
    });
    const node = await getNode(prisma, created.id);
    expect(node?.canonicalKey).toBe('ferritin');
    expect(node?.attributes).toEqual({ latestValue: 18 });
  });

  it('getNodesByType filters and orders by displayName', async () => {
    const userId = await makeTestUser(prisma, 'getnodes-by-type');
    await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'b', displayName: 'Bbb' });
    await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'a', displayName: 'Aaa' });
    await addNode(prisma, userId, { type: 'symptom', canonicalKey: 's', displayName: 'Sss' });
    const biomarkers = await getNodesByType(prisma, userId, 'biomarker');
    expect(biomarkers.map((n) => n.displayName)).toEqual(['Aaa', 'Bbb']);
  });
});

describe('getSubgraphForTopic', () => {
  async function seedIronSubgraph(userId: string) {
    const ferritin = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    const fatigue = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    const ironSupp = await addNode(prisma, userId, {
      type: 'intervention',
      canonicalKey: 'iron_supplementation',
      displayName: 'Iron supplementation',
    });
    // Unrelated node that should not surface.
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
    });

    await addEdge(prisma, userId, {
      type: 'ASSOCIATED_WITH',
      fromNodeId: fatigue.id,
      toNodeId: ferritin.id,
    });
    await addEdge(prisma, userId, {
      type: 'CAUSES',
      fromNodeId: ironSupp.id,
      toNodeId: ferritin.id,
    });
    return { ferritin: ferritin.id, fatigue: fatigue.id, ironSupp: ironSupp.id };
  }

  it('returns the seed plus 1-hop neighbours via associative edges (depth 2)', async () => {
    const userId = await makeTestUser(prisma, 'subgraph-iron');
    const ids = await seedIronSubgraph(userId);

    const result = await getSubgraphForTopic(prisma, userId, {
      types: ['biomarker'],
      canonicalKeyPatterns: ['ferritin'],
      depth: 2,
    });
    const nodeIds = result.nodes.map((n) => n.id);
    expect(nodeIds).toContain(ids.ferritin);
    expect(nodeIds).toContain(ids.fatigue); // 1-hop via ASSOCIATED_WITH
    expect(nodeIds).toContain(ids.ironSupp); // 1-hop via CAUSES
    expect(nodeIds.find((id) => id === ids.ferritin)).toBeDefined();
  });

  it('respects depth=0 (only seed)', async () => {
    const userId = await makeTestUser(prisma, 'subgraph-depth0');
    const ids = await seedIronSubgraph(userId);
    const result = await getSubgraphForTopic(prisma, userId, {
      types: ['biomarker'],
      canonicalKeyPatterns: ['ferritin'],
      depth: 0,
    });
    expect(result.nodes.map((n) => n.id)).toEqual([ids.ferritin]);
  });

  it('returns empty when no seed node matches the pattern', async () => {
    const userId = await makeTestUser(prisma, 'subgraph-empty');
    await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'hba1c', displayName: 'HbA1c' });
    const result = await getSubgraphForTopic(prisma, userId, {
      types: ['biomarker'],
      canonicalKeyPatterns: ['ferritin'],
      depth: 2,
    });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('includes SUPPORTS edges for visited nodes so callers see provenance pointers', async () => {
    const userId = await makeTestUser(prisma, 'subgraph-with-supports');
    await ingestExtraction(prisma, userId, {
      document: { kind: 'lab_pdf', capturedAt: new Date(), contentHash: 'h1' },
      chunks: [{ index: 0, text: 'Ferritin 18', offsetStart: 0, offsetEnd: 11, pageNumber: 1 }],
      nodes: [
        { type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin', supportingChunkIndices: [0] },
      ],
      edges: [],
    });
    const result = await getSubgraphForTopic(prisma, userId, {
      types: ['biomarker'],
      canonicalKeyPatterns: ['ferritin'],
      depth: 2,
    });
    const supportsEdges = result.edges.filter((e) => e.type === 'SUPPORTS');
    expect(supportsEdges).toHaveLength(1);
    expect(supportsEdges[0].fromChunkId).toBeTruthy();
  });
});

describe('getProvenanceForNode', () => {
  it('returns chunks ordered by document then index, with kind + capturedAt', async () => {
    const userId = await makeTestUser(prisma, 'provenance');
    const out = await ingestExtraction(prisma, userId, {
      document: { kind: 'lab_pdf', capturedAt: new Date('2026-04-01'), contentHash: 'p1' },
      chunks: [
        { index: 0, text: 'Ferritin 18', offsetStart: 0, offsetEnd: 11, pageNumber: 1 },
        { index: 1, text: 'Hb 12.1', offsetStart: 12, offsetEnd: 19, pageNumber: 1 },
      ],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          supportingChunkIndices: [0, 1],
        },
      ],
      edges: [],
    });
    const provenance = await getProvenanceForNode(prisma, out.nodeIds[0]);
    expect(provenance).toHaveLength(2);
    expect(provenance.map((p) => p.text)).toEqual(['Ferritin 18', 'Hb 12.1']);
    expect(provenance[0].documentKind).toBe('lab_pdf');
    expect(provenance[0].capturedAt).toEqual(new Date('2026-04-01'));
  });

  it('returns empty for a node with no SUPPORTS edges', async () => {
    const userId = await makeTestUser(prisma, 'provenance-empty');
    const node = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    expect(await getProvenanceForNode(prisma, node.id)).toEqual([]);
  });
});

describe('getGraphRevision', () => {
  it('hash is stable across reads with no mutations and changes when nodes are added', async () => {
    const userId = await makeTestUser(prisma, 'revision-stability');
    const empty = await getGraphRevision(prisma, userId);
    const empty2 = await getGraphRevision(prisma, userId);
    expect(empty.hash).toBe(empty2.hash);
    expect(empty.nodeCount).toBe(0);

    await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'k', displayName: 'K' });
    const after = await getGraphRevision(prisma, userId);
    expect(after.hash).not.toBe(empty.hash);
    expect(after.nodeCount).toBe(1);
  });

  it('hash changes when an edge is added (no new nodes)', async () => {
    const userId = await makeTestUser(prisma, 'revision-edges');
    const a = await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'a', displayName: 'A' });
    const b = await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'b', displayName: 'B' });
    const beforeEdge = await getGraphRevision(prisma, userId);
    await addEdge(prisma, userId, { type: 'ASSOCIATED_WITH', fromNodeId: a.id, toNodeId: b.id });
    const afterEdge = await getGraphRevision(prisma, userId);
    expect(afterEdge.hash).not.toBe(beforeEdge.hash);
  });
});
