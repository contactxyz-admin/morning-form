import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { mockEmbedAndStoreChunk } = vi.hoisted(() => ({
  mockEmbedAndStoreChunk: vi.fn().mockResolvedValue({
    vector: Array.from({ length: 1536 }, (_, i) => i / 1536),
    tokens: 12,
    costUsd: 0.00000024,
    model: 'mock-embedding',
    dimensions: 1536,
  }),
}));

vi.mock('@/lib/embeddings/pipeline', () => ({
  embedAndStoreChunk: mockEmbedAndStoreChunk,
}));

import { addEdge, addNode, addSourceChunks, addSourceDocument, ingestExtraction } from './mutations';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;
const originalHybridFlag = process.env.HYBRID_RETRIEVAL_ENABLED;
const originalEmbeddingProvider = process.env.EMBEDDING_PROVIDER;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  process.env.HYBRID_RETRIEVAL_ENABLED = 'false';
  process.env.EMBEDDING_PROVIDER = 'openai';
});

afterEach(() => {
  mockEmbedAndStoreChunk.mockClear();
  if (originalHybridFlag === undefined) {
    delete process.env.HYBRID_RETRIEVAL_ENABLED;
  } else {
    process.env.HYBRID_RETRIEVAL_ENABLED = originalHybridFlag;
  }
  if (originalEmbeddingProvider === undefined) {
    delete process.env.EMBEDDING_PROVIDER;
  } else {
    process.env.EMBEDDING_PROVIDER = originalEmbeddingProvider;
  }
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

  it('rolls biomarker currency forward when the incoming reading is dated and newer', async () => {
    const userId = await makeTestUser(prisma, 'addnode-roll-fwd');
    const first = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: {
        value: 18,
        collectionDate: '2026-04-01',
        latestValue: 18,
        latestValueAt: '2026-04-01',
        flaggedOutOfRange: true,
        unit: 'ug/L',
      },
    });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: {
        value: 41,
        collectionDate: '2026-06-01',
        latestValue: 41,
        latestValueAt: '2026-06-01',
        flaggedOutOfRange: false,
      },
    });
    const attrs = JSON.parse(
      (await prisma.graphNode.findUnique({ where: { id: first.id } }))!.attributes!,
    );
    // Rolling currency moved to the newer reading…
    expect(attrs.latestValue).toBe(41);
    expect(attrs.latestValueAt).toBe('2026-06-01');
    expect(attrs.flaggedOutOfRange).toBe(false);
    // …while the first-seen anchor stays first-write-wins.
    expect(attrs.value).toBe(18);
    expect(attrs.collectionDate).toBe('2026-04-01');
  });

  it('does not let an OLDER dated reading clobber a newer biomarker currency (out-of-order upload)', async () => {
    const userId = await makeTestUser(prisma, 'addnode-roll-guard');
    const first = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
      attributes: { latestValue: 5.7, latestValueAt: '2026-02-10', flaggedOutOfRange: false },
    });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
      attributes: { latestValue: 6.1, latestValueAt: '2025-09-15', flaggedOutOfRange: true },
    });
    const attrs = JSON.parse(
      (await prisma.graphNode.findUnique({ where: { id: first.id } }))!.attributes!,
    );
    expect(attrs.latestValue).toBe(5.7);
    expect(attrs.latestValueAt).toBe('2026-02-10');
    expect(attrs.flaggedOutOfRange).toBe(false);
  });

  it('keeps first-write-wins for UNDATED latestValue writes (intake narrative path unchanged)', async () => {
    const userId = await makeTestUser(prisma, 'addnode-roll-undated');
    const first = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'vitamin_d',
      displayName: 'Vitamin D',
      attributes: { latestValue: 42, latestValueAt: '2026-04-01' },
    });
    // An undated re-extraction (e.g. narrative recall) must not clobber a
    // dated current value — shouldApplyRollingFields requires a dated reading.
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'vitamin_d',
      displayName: 'Vitamin D',
      attributes: { latestValue: 99 },
    });
    const attrs = JSON.parse(
      (await prisma.graphNode.findUnique({ where: { id: first.id } }))!.attributes!,
    );
    expect(attrs.latestValue).toBe(42);
    expect(attrs.latestValueAt).toBe('2026-04-01');
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

  it('embeds and persists SourceChunk vectors after commit when hybrid retrieval is enabled', async () => {
    process.env.HYBRID_RETRIEVAL_ENABLED = 'true';
    process.env.EMBEDDING_PROVIDER = 'mock';
    const userId = await makeTestUser(prisma, 'ingest-embed-store');

    const result = await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        capturedAt: new Date('2026-04-10T00:00:00Z'),
        contentHash: 'hash-embed-store',
        sourceRef: 'medichecks-embed.pdf',
      },
      chunks: [
        { index: 0, text: 'Ferritin 18 ug/L (low)', offsetStart: 0, offsetEnd: 22, pageNumber: 1 },
      ],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          attributes: { latestValue: 18, unit: 'ug/L', flaggedOutOfRange: true },
          supportingChunkIndices: [0],
        },
      ],
      edges: [],
    });

    expect(mockEmbedAndStoreChunk).toHaveBeenCalledWith({
      text: 'Ferritin 18 ug/L (low)',
      sourceChunkId: result.chunkIds[0],
      userId,
    });

    const row = await eventuallyVectorEmbedding(result.chunkIds[0]);
    expect(row?.model).toBe('mock-embedding');
    expect(row?.dimensions).toBe(1536);
    expect(row?.vector).toHaveLength(1536);
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

async function eventuallyVectorEmbedding(sourceChunkId: string) {
  // The embedding write is a post-commit fire-and-forget hook, so it can
  // legitimately lag under CI contention (159 test files sharing one
  // Postgres). The original 200ms budget flaked on the hosted runner
  // (PR #160 run 27275420889) — give it ~2s.
  for (let attempt = 0; attempt < 40; attempt++) {
    const row = await prisma.vectorEmbedding.findUnique({ where: { sourceChunkId } });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return prisma.vectorEmbedding.findUnique({ where: { sourceChunkId } });
}
