import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import { clearMockHandlers, setMockHandlers } from '@/lib/llm/client';
import type { ExtractedLabPanel } from '@/lib/intake/lab-prompts';

const currentUserMock = vi.fn<() => Promise<{ id: string }>>();

// ---- Stubs ----
// The route calls pdf-extract → pdf-parse. We stub pdf-parse with a fake
// PDFParse that returns canned pages. vi.hoisted is required here — without
// it, the vi.mock factory runs before the const declarations and captures
// `undefined`, so `getText` on the instance is not a function.
const { mockGetText, mockDestroy } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('pdf-parse', () => ({
  // Use a regular function so `new PDFParse(...)` works — arrow functions
  // aren't constructors and make vitest's mockImplementation throw
  // `... is not a constructor`.
  PDFParse: vi.fn().mockImplementation(function () {
    return { getText: mockGetText, destroy: mockDestroy };
  }),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

// Mutable flag state so individual tests can flip feature flags (clinician
// review hook); everything else stays the static test baseline.
const { envState } = vi.hoisted(() => ({
  envState: { CLINICIAN_REVIEW_ENABLED: '' },
}));
vi.mock('@/lib/env', () => ({
  get env() {
    return {
      MOCK_LLM: 'true',
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: '',
      DATABASE_URL: 'file:./prisma/.test-graph.db',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      CLINICIAN_REVIEW_ENABLED: envState.CLINICIAN_REVIEW_ENABLED,
    };
  },
}));

// Stub the storage module — we don't care about real blob/filesystem writes
// in route tests, and the @vercel/blob `put` would otherwise require network.
vi.mock('@/lib/intake/storage', () => ({
  storePdf: vi.fn((userId: string, contentHash: string) =>
    Promise.resolve(`uploads/${userId}/${contentHash}.pdf`),
  ),
}));

// PR 3: mock for embeddings pipeline (post-commit hook). Hoisted so vi.mock
// factory sees it. Real pipeline unit-tested separately; here we assert
// fire-and-forget integration + dry-run (flag off) vs enabled paths.
const { mockEmbedAndStoreChunk } = vi.hoisted(() => ({
  mockEmbedAndStoreChunk: vi.fn().mockResolvedValue({
    vector: Array(1536).fill(0.1),
    tokens: 42,
    costUsd: 0.00084,
    model: 'mock-embedding',
    dimensions: 1536,
    sourceChunkId: 'chunk-mock',
  }),
}));
vi.mock('@/lib/embeddings/pipeline', () => ({
  embedAndStoreChunk: mockEmbedAndStoreChunk,
}));

import { POST } from './route';

let prisma: PrismaClient;
const originalHybridFlag = process.env.HYBRID_RETRIEVAL_ENABLED;
const originalEmbeddingProvider = process.env.EMBEDDING_PROVIDER;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalMockLlm = process.env.MOCK_LLM;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  mockGetText.mockReset();
  mockDestroy.mockClear();
  process.env.HYBRID_RETRIEVAL_ENABLED = 'false';
  process.env.EMBEDDING_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = '';
  process.env.MOCK_LLM = '';
});

afterEach(() => {
  clearMockHandlers();
  currentUserMock.mockReset();
  mockEmbedAndStoreChunk.mockClear();
  restoreEnv('HYBRID_RETRIEVAL_ENABLED', originalHybridFlag);
  restoreEnv('EMBEDDING_PROVIDER', originalEmbeddingProvider);
  restoreEnv('OPENAI_API_KEY', originalOpenAiKey);
  restoreEnv('MOCK_LLM', originalMockLlm);
  envState.CLINICIAN_REVIEW_ENABLED = '';
});

// Enough plain text to clear the 200-non-whitespace-char 'no_text_layer' floor.
const LAB_PAGE_TEXT = [
  'MEDICHECKS ADVANCED WELL WOMAN',
  'Patient: JANE DOE  DOB: 1988-05-12',
  'Sample Collected: 2026-04-01',
  '',
  'IRON STATUS',
  'Ferritin 18 ug/L (30-400) LOW',
  'Iron 14 umol/L (10-30)',
  'Transferrin saturation 19 % (20-55) LOW',
  'TIBC 68 umol/L (45-80)',
  '',
  'FULL BLOOD COUNT',
  'Haemoglobin 121 g/L (130-175) LOW',
  'MCV 92 fL (80-100)',
  '',
  'VITAMINS',
  'Vitamin D 42 nmol/L (50-200) LOW',
  'Vitamin B12 320 ng/L (180-914)',
].join('\n');

function makeRequest(fields: { file?: File | null; fileName?: string; contentType?: string }): Request {
  const form = new FormData();
  if (fields.file !== null) {
    const blob = fields.file ?? new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: fields.contentType ?? 'application/pdf',
    });
    form.set('file', blob, fields.fileName ?? 'lab.pdf');
  }
  return new Request('https://app.test/api/intake/documents', {
    method: 'POST',
    body: form,
  });
}

function setExtraction(panel: ExtractedLabPanel): void {
  setMockHandlers([{ key: 'Lab report to extract from', handler: () => panel }]);
}

describe('POST /api/intake/documents', () => {
  it('returns 400 when `file` field is missing', async () => {
    const userId = await makeTestUser(prisma, 'docs-no-file');
    currentUserMock.mockResolvedValue({ id: userId });
    const form = new FormData();
    form.set('not_a_file', 'hello');
    const req = new Request('https://app.test/api/intake/documents', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing `file`/);
  });

  it('returns 400 on non-PDF content-type', async () => {
    const userId = await makeTestUser(prisma, 'docs-bad-mime');
    currentUserMock.mockResolvedValue({ id: userId });
    const blob = new Blob(['hello'], { type: 'image/png' });
    const form = new FormData();
    form.set('file', blob, 'lab.png');
    const req = new Request('https://app.test/api/intake/documents', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/PDF only/);
  });

  it('happy path — persists SourceDocument, chunks, biomarker nodes, promotes iron stub→full', async () => {
    const userId = await makeTestUser(prisma, 'docs-happy');
    currentUserMock.mockResolvedValue({ id: userId });

    // Pre-create an iron stub so we can verify promotion.
    await prisma.topicPage.create({
      data: { userId, topicKey: 'iron', status: 'stub', rendered: '' },
    });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });

    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          value: 18,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: true,
          collectionDate: '2026-04-01',
          supportingChunkIndices: [0],
        },
        {
          canonicalKey: 'haemoglobin',
          displayName: 'Haemoglobin',
          value: 121,
          unit: 'g/L',
          referenceRangeLow: 130,
          referenceRangeHigh: 175,
          flaggedOutOfRange: true,
          collectionDate: '2026-04-01',
          supportingChunkIndices: [1],
        },
      ],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(false);
    expect(body.biomarkerCount).toBe(2);
    expect(body.chunkCount).toBeGreaterThan(0);
    expect(body.promotedTopics).toEqual(['iron']);

    // Persistence sanity checks.
    const doc = await prisma.sourceDocument.findUnique({ where: { id: body.documentId } });
    expect(doc?.kind).toBe('lab_pdf');
    expect(doc?.sourceRef).toBe('lab.pdf');

    const conceptNodes = await prisma.graphNode.findMany({
      where: { userId, type: 'biomarker' },
    });
    expect(conceptNodes.map((n) => n.canonicalKey).sort()).toEqual(['ferritin', 'haemoglobin']);

    // Each dated reading also lands as an observation instance (longitudinal U2).
    const instanceNodes = await prisma.graphNode.findMany({
      where: { userId, type: 'observation' },
    });
    expect(instanceNodes.map((n) => n.canonicalKey).sort()).toEqual([
      'obs_ferritin_2026_04_01',
      'obs_haemoglobin_2026_04_01',
    ]);

    const ironPage = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: 'iron' } },
    });
    expect(ironPage?.status).toBe('full');

    const supportsEdges = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS' },
    });
    expect(supportsEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('promotes sleep stub→full when a sleep-linked biomarker (cortisol) lands', async () => {
    const userId = await makeTestUser(prisma, 'docs-sleep-promote');
    currentUserMock.mockResolvedValue({ id: userId });

    await prisma.topicPage.create({
      data: { userId, topicKey: 'sleep', status: 'stub', rendered: '' },
    });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });

    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'cortisol',
          displayName: 'Cortisol',
          value: 520,
          unit: 'nmol/L',
          referenceRangeLow: 150,
          referenceRangeHigh: 500,
          flaggedOutOfRange: true,
          collectionDate: '2026-04-01',
          supportingChunkIndices: [0],
        },
      ],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotedTopics).toEqual(['sleep']);

    const sleepPage = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: 'sleep' } },
    });
    expect(sleepPage?.status).toBe('full');
  });

  it('dedup — second upload of identical bytes returns existing document id', async () => {
    const userId = await makeTestUser(prisma, 'docs-dedup');
    currentUserMock.mockResolvedValue({ id: userId });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });
    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          value: 42,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: false,
          collectionDate: null,
          supportingChunkIndices: [0],
        },
      ],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });

    const bytes = new Uint8Array(Array.from({ length: 8 }, (_, i) => i + 10));
    const blob1 = new Blob([bytes], { type: 'application/pdf' });
    const blob2 = new Blob([bytes], { type: 'application/pdf' });

    const first = await POST(makeRequest({ file: blob1 as unknown as File }));
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.deduped).toBe(false);

    const second = await POST(makeRequest({ file: blob2 as unknown as File }));
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.deduped).toBe(true);
    expect(secondBody.documentId).toBe(firstBody.documentId);

    const docs = await prisma.sourceDocument.findMany({ where: { userId } });
    expect(docs).toHaveLength(1);
  });

  it('returns 422 with kind=no_text_layer on an image-only / empty-text PDF', async () => {
    const userId = await makeTestUser(prisma, 'docs-no-text');
    currentUserMock.mockResolvedValue({ id: userId });
    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: 'short' }],
      text: '',
      total: 1,
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.kind).toBe('no_text_layer');
  });

  it('returns 422 with kind=malformed_pdf when pdf-parse throws', async () => {
    const userId = await makeTestUser(prisma, 'docs-malformed');
    currentUserMock.mockResolvedValue({ id: userId });
    mockGetText.mockRejectedValue(new Error('xref offset invalid'));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.kind).toBe('malformed_pdf');
  });

  it('returns 502 when extraction LLM output is schema-invalid', async () => {
    const userId = await makeTestUser(prisma, 'docs-llm-invalid');
    currentUserMock.mockResolvedValue({ id: userId });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });
    // Missing `biomarkers` — schema violation.
    setMockHandlers([
      {
        key: 'Lab report to extract from',
        handler: () => ({ reportCollectionDate: null, labProvider: null }),
      },
    ]);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(502);
    expect((await res.json()).kind).toBe('LLMValidationError');

    const docs = await prisma.sourceDocument.findMany({ where: { userId } });
    expect(docs).toHaveLength(0);
  });

  it('filters out biomarkers with out-of-range supportingChunkIndices', async () => {
    const userId = await makeTestUser(prisma, 'docs-bad-indices');
    currentUserMock.mockResolvedValue({ id: userId });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });

    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          value: 42,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: false,
          collectionDate: null,
          supportingChunkIndices: [0],
        },
        {
          // Hallucinated chunk index — the model cites a chunk that doesn't exist.
          canonicalKey: 'phantom_marker',
          displayName: 'Phantom',
          value: 1,
          unit: 'x',
          referenceRangeLow: null,
          referenceRangeHigh: null,
          flaggedOutOfRange: false,
          collectionDate: null,
          supportingChunkIndices: [9999],
        },
      ],
      reportCollectionDate: null,
      labProvider: null,
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only ferritin lands — phantom is dropped.
    expect(body.biomarkerCount).toBe(1);
    const nodes = await prisma.graphNode.findMany({ where: { userId } });
    expect(nodes.map((n) => n.canonicalKey)).toEqual(['ferritin']);
  });

  it('PR3/7 integration — embeddings wired into ingestExtraction post-commit (kill-switchable, fire-and-forget, no impact on success path)', async () => {
    const userId = await makeTestUser(prisma, 'docs-pr3-embed-hook');
    currentUserMock.mockResolvedValue({ id: userId });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });

    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          value: 18,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: true,
          collectionDate: '2026-04-01',
          supportingChunkIndices: [0],
        },
      ],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });

    // Kill-switch path: zero calls to hook, behavior identical to pre-PR3.
    mockEmbedAndStoreChunk.mockClear();
    const resDry = await POST(makeRequest({}));
    expect(resDry.status).toBe(200);
    expect(mockEmbedAndStoreChunk).not.toHaveBeenCalled();

    // Enabled path: hook fires non-blocking for the produced chunks; ingest succeeds.
    process.env.HYBRID_RETRIEVAL_ENABLED = 'true';
    process.env.EMBEDDING_PROVIDER = 'mock';
    try {
      // Use fresh bytes to avoid the dedup short-circuit inside route (different contentHash).
      const freshBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x01, 0x02, 0x03, 0x04]);
      mockEmbedAndStoreChunk.mockClear();
      const resEnabled = await POST(
        makeRequest({ file: new Blob([freshBytes], { type: 'application/pdf' }) as unknown as File }),
      );
      expect(resEnabled.status).toBe(200);
      const body = await resEnabled.json();
      expect(body.chunkCount).toBeGreaterThan(0);

      // Hook was invoked (at least once; real count matches chunks produced for this extraction).
      expect(mockEmbedAndStoreChunk).toHaveBeenCalled();
      const firstCall = mockEmbedAndStoreChunk.mock.calls[0]?.[0];
      expect(firstCall?.text).toBeTypeOf('string');
      expect(firstCall?.text.length).toBeGreaterThan(0);
      expect(firstCall?.sourceChunkId).toBeTypeOf('string');
      expect(firstCall?.userId).toBe(userId);
      expect(mockEmbedAndStoreChunk.mock.calls.some(([arg]) => arg.text.includes('Ferritin'))).toBe(true);

      const firstChunk = await prisma.sourceChunk.findFirst({
        where: { sourceDocumentId: body.documentId },
        orderBy: { index: 'asc' },
      });
      expect(firstChunk?.id).toBe(firstCall?.sourceChunkId);

      const stored = await eventuallyVectorEmbedding(firstCall!.sourceChunkId);
      expect(stored?.model).toBe('mock-embedding');
      expect(stored?.dimensions).toBe(1536);
    } finally {
      process.env.HYBRID_RETRIEVAL_ENABLED = 'false';
      process.env.EMBEDDING_PROVIDER = 'openai';
    }
  });

  it('accumulates dated observation instances across two panels and rolls the concept currency (longitudinal U2)', async () => {
    const userId = await makeTestUser(prisma, 'docs-longitudinal');
    currentUserMock.mockResolvedValue({ id: userId });

    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });

    const ferritinReading = (value: number, date: string, flagged: boolean) => ({
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      value,
      unit: 'ug/L',
      referenceRangeLow: 30,
      referenceRangeHigh: 400,
      flaggedOutOfRange: flagged,
      collectionDate: date,
      supportingChunkIndices: [0],
    });

    // Panel 1 — April, ferritin low.
    setExtraction({
      biomarkers: [ferritinReading(18, '2026-04-01', true)],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });
    const res1 = await POST(makeRequest({}));
    expect(res1.status).toBe(200);
    expect((await res1.json()).biomarkerCount).toBe(1);

    // Panel 2 — June, ferritin recovering. Different bytes so contentHash
    // dedup doesn't short-circuit the second ingest.
    setExtraction({
      biomarkers: [ferritinReading(41, '2026-06-01', false)],
      reportCollectionDate: '2026-06-01',
      labProvider: 'Medichecks',
    });
    const res2 = await POST(
      makeRequest({
        file: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x32])], {
          type: 'application/pdf',
        }) as unknown as File,
        fileName: 'lab-june.pdf',
      }),
    );
    expect(res2.status).toBe(200);
    expect((await res2.json()).biomarkerCount).toBe(1);

    // ONE concept node, currency rolled to June, first-seen anchor intact.
    const concepts = await prisma.graphNode.findMany({
      where: { userId, type: 'biomarker' },
    });
    expect(concepts).toHaveLength(1);
    const conceptAttrs = JSON.parse(concepts[0].attributes!);
    expect(conceptAttrs.value).toBe(18);
    expect(conceptAttrs.collectionDate).toBe('2026-04-01');
    expect(conceptAttrs.latestValue).toBe(41);
    expect(conceptAttrs.latestValueAt).toBe(new Date('2026-06-01').toISOString());
    expect(conceptAttrs.flaggedOutOfRange).toBe(false);

    // TWO dated instances, each linked to the concept via INSTANCE_OF.
    const instances = await prisma.graphNode.findMany({
      where: { userId, type: 'observation' },
      orderBy: { canonicalKey: 'asc' },
    });
    expect(instances.map((n) => n.canonicalKey)).toEqual([
      'obs_ferritin_2026_04_01',
      'obs_ferritin_2026_06_01',
    ]);
    expect(instances.every((n) => !n.promoted)).toBe(true);

    const instanceEdges = await prisma.graphEdge.findMany({
      where: { userId, type: 'INSTANCE_OF' },
    });
    expect(instanceEdges).toHaveLength(2);
    expect(instanceEdges.every((e) => e.toNodeId === concepts[0].id)).toBe(true);

    // Instances carry provenance to their own panel's chunks.
    const supports = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS', fromNodeId: { in: instances.map((n) => n.id) } },
    });
    expect(supports.length).toBe(2);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function eventuallyVectorEmbedding(sourceChunkId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const row = await prisma.vectorEmbedding.findUnique({ where: { sourceChunkId } });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return prisma.vectorEmbedding.findUnique({ where: { sourceChunkId } });
}

describe('POST /api/intake/documents — clinician review hook (pilot MVP plan 2026-07-04)', () => {
  function primeUpload(): void {
    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: LAB_PAGE_TEXT }],
      text: '',
      total: 1,
    });
    setExtraction({
      biomarkers: [
        {
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          value: 18,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: true,
          collectionDate: '2026-04-01',
          supportingChunkIndices: [0],
        },
      ],
      reportCollectionDate: '2026-04-01',
      labProvider: 'Medichecks',
    });
  }

  it('flag on — upload creates exactly one pending review with the panel snapshot', async () => {
    envState.CLINICIAN_REVIEW_ENABLED = 'true';
    const userId = await makeTestUser(prisma, 'docs-review-on');
    currentUserMock.mockResolvedValue({ id: userId });
    primeUpload();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();

    const review = await prisma.resultReview.findUnique({
      where: { sourceDocumentId: body.documentId },
    });
    expect(review?.status).toBe('pending');
    expect(review?.userId).toBe(userId);
    const summary = JSON.parse(review?.panelSummary ?? '{}');
    expect(summary.labProvider).toBe('Medichecks');
    expect(summary.markers).toHaveLength(1);
    expect(summary.markers[0].joinKey).toBe('ferritin');
    expect(summary.markers[0].flaggedOutOfRange).toBe(true);
  });

  it('flag off (default) — upload creates no review row', async () => {
    const userId = await makeTestUser(prisma, 'docs-review-off');
    currentUserMock.mockResolvedValue({ id: userId });
    primeUpload();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    const review = await prisma.resultReview.findUnique({
      where: { sourceDocumentId: body.documentId },
    });
    expect(review).toBeNull();
  });

  it('flag on — deduped re-upload does not create a second review', async () => {
    envState.CLINICIAN_REVIEW_ENABLED = 'true';
    const userId = await makeTestUser(prisma, 'docs-review-dedup');
    currentUserMock.mockResolvedValue({ id: userId });
    primeUpload();

    const bytes = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x99])], {
      type: 'application/pdf',
    });
    const first = await POST(makeRequest({ file: new File([bytes], 'same.pdf', { type: 'application/pdf' }) }));
    const firstBody = await first.json();

    primeUpload();
    const second = await POST(makeRequest({ file: new File([bytes], 'same.pdf', { type: 'application/pdf' }) }));
    const secondBody = await second.json();
    expect(secondBody.deduped).toBe(true);

    const count = await prisma.resultReview.count({
      where: { sourceDocumentId: firstBody.documentId },
    });
    expect(count).toBe(1);
  });
});
