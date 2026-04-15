import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode, addSourceChunks, addSourceDocument, ingestExtraction } from './mutations';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('addNode dedup + merge', () => {
  it('inserts a new node when canonicalKey is unseen', async () => {
    const userId = await makeTestUser(prisma, 'addnode-new');
    const result = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 18, unit: 'ug/L' },
    });
    expect(result.created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id: result.id } });
    expect(row?.canonicalKey).toBe('ferritin');
    expect(row?.attributes).toContain('"latestValue":18');
  });

  it('upserts on existing canonicalKey and shallow-merges attributes (first-write-wins per key)', async () => {
    const userId = await makeTestUser(prisma, 'addnode-merge');
    const first = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'haemoglobin',
      displayName: 'Haemoglobin',
      attributes: { latestValue: 12.1, unit: 'g/dL' },
    });
    const second = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'haemoglobin',
      displayName: 'Hb',
      attributes: { latestValue: 99, referenceRangeLow: 11.5 },
    });

    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const row = await prisma.graphNode.findUnique({ where: { id: first.id } });
    const attrs = JSON.parse(row!.attributes!);
    // First-write-wins for `latestValue` (existing 12.1 retained).
    expect(attrs.latestValue).toBe(12.1);
    expect(attrs.unit).toBe('g/dL');
    // New keys merged in.
    expect(attrs.referenceRangeLow).toBe(11.5);
    // displayName is preserved on existing rows.
    expect(row?.displayName).toBe('Haemoglobin');
  });

  it('treats (userId, type, canonicalKey) as the dedup key — same key in different types is allowed', async () => {
    const userId = await makeTestUser(prisma, 'addnode-types');
    const a = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'iron',
      displayName: 'Iron (biomarker)',
    });
    const b = await addNode(prisma, userId, {
      type: 'intervention',
      canonicalKey: 'iron',
      displayName: 'Iron supplementation',
    });
    expect(a.id).not.toBe(b.id);
    expect(a.created && b.created).toBe(true);
  });
});

describe('addEdge dedup', () => {
  it('does not insert a duplicate edge with the same (type, from, to, chunk)', async () => {
    const userId = await makeTestUser(prisma, 'addedge-dedup');
    const from = await addNode(prisma, userId, { type: 'symptom', canonicalKey: 'fatigue', displayName: 'Fatigue' });
    const to = await addNode(prisma, userId, { type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin' });
    const e1 = await addEdge(prisma, userId, { type: 'ASSOCIATED_WITH', fromNodeId: from.id, toNodeId: to.id });
    const e2 = await addEdge(prisma, userId, { type: 'ASSOCIATED_WITH', fromNodeId: from.id, toNodeId: to.id });
    expect(e1).toBe(e2);
  });
});

describe('ingestExtraction transactional write', () => {
  it('persists document + chunks + nodes + SUPPORTS edges + associative edges atomically', async () => {
    const userId = await makeTestUser(prisma, 'ingest-happy');
    const result = await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        capturedAt: new Date('2026-04-10T00:00:00Z'),
        contentHash: 'hash-abc',
        sourceRef: 'medichecks-2026-04-10.pdf',
      },
      chunks: [
        { index: 0, text: 'Ferritin 18 ug/L (low)', offsetStart: 0, offsetEnd: 22, pageNumber: 1 },
        { index: 1, text: 'Haemoglobin 12.1 g/dL', offsetStart: 23, offsetEnd: 44, pageNumber: 1 },
      ],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          attributes: { latestValue: 18, unit: 'ug/L', flaggedOutOfRange: true },
          supportingChunkIndices: [0],
        },
        {
          type: 'biomarker',
          canonicalKey: 'haemoglobin',
          displayName: 'Haemoglobin',
          attributes: { latestValue: 12.1, unit: 'g/dL' },
          supportingChunkIndices: [1],
        },
      ],
      edges: [
        {
          type: 'ASSOCIATED_WITH',
          fromType: 'biomarker',
          fromCanonicalKey: 'ferritin',
          toType: 'biomarker',
          toCanonicalKey: 'haemoglobin',
        },
      ],
    });

    expect(result.chunkIds).toHaveLength(2);
    expect(result.nodeIds).toHaveLength(2);
    // 2 SUPPORTS + 1 associative = 3 edges
    expect(result.edgeIds).toHaveLength(3);

    const supportsEdges = await prisma.graphEdge.findMany({ where: { userId, type: 'SUPPORTS' } });
    expect(supportsEdges).toHaveLength(2);
    expect(supportsEdges.every((e) => e.fromChunkId !== null)).toBe(true);
  });

  it('dedupes documents by contentHash on re-ingest and reuses existing chunks', async () => {
    const userId = await makeTestUser(prisma, 'ingest-dedup');
    const payload = {
      document: { kind: 'lab_pdf' as const, capturedAt: new Date(), contentHash: 'hash-xyz' },
      chunks: [{ index: 0, text: 'Ferritin 22', offsetStart: 0, offsetEnd: 11, pageNumber: 1 }],
      nodes: [
        {
          type: 'biomarker' as const,
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          supportingChunkIndices: [0],
        },
      ],
      edges: [],
    };
    const first = await ingestExtraction(prisma, userId, payload);
    const second = await ingestExtraction(prisma, userId, payload);
    expect(second.documentId).toBe(first.documentId);
    const allDocs = await prisma.sourceDocument.findMany({ where: { userId, contentHash: 'hash-xyz' } });
    expect(allDocs).toHaveLength(1);
    const allFerritinNodes = await prisma.graphNode.findMany({
      where: { userId, type: 'biomarker', canonicalKey: 'ferritin' },
    });
    expect(allFerritinNodes).toHaveLength(1);
  });

  it('skips edges with unresolvable canonicalKey references rather than failing the ingest', async () => {
    const userId = await makeTestUser(prisma, 'ingest-skip-bad-edge');
    const result = await ingestExtraction(prisma, userId, {
      document: { kind: 'intake_text', capturedAt: new Date() },
      chunks: [{ index: 0, text: 'I feel tired', offsetStart: 0, offsetEnd: 12 }],
      nodes: [
        { type: 'symptom', canonicalKey: 'fatigue', displayName: 'Fatigue', supportingChunkIndices: [0] },
      ],
      edges: [
        // References a node that doesn't exist anywhere.
        {
          type: 'ASSOCIATED_WITH',
          fromType: 'symptom',
          fromCanonicalKey: 'fatigue',
          toType: 'biomarker',
          toCanonicalKey: 'doesnotexist',
        },
      ],
    });
    // Symptom node + 1 SUPPORTS edge — bad associative edge dropped.
    expect(result.nodeIds).toHaveLength(1);
    expect(result.edgeIds).toHaveLength(1);
    const associativeCount = await prisma.graphEdge.count({
      where: { userId, type: 'ASSOCIATED_WITH' },
    });
    expect(associativeCount).toBe(0);
  });
});

describe('addSourceDocument dedup', () => {
  it('returns the existing document when contentHash matches and skips chunk insert', async () => {
    const userId = await makeTestUser(prisma, 'doc-dedup');
    const first = await addSourceDocument(prisma, userId, {
      kind: 'gp_record',
      capturedAt: new Date(),
      contentHash: 'gp-hash-1',
    });
    await addSourceChunks(prisma, first.id, [
      { index: 0, text: 'Diagnosis: anaemia', offsetStart: 0, offsetEnd: 18 },
    ]);

    const second = await addSourceDocument(prisma, userId, {
      kind: 'gp_record',
      capturedAt: new Date(),
      contentHash: 'gp-hash-1',
    });
    expect(second.deduped).toBe(true);
    expect(second.id).toBe(first.id);
  });
});
