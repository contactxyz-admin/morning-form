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

vi.mock('@/lib/env', () => ({
  env: {
    MOCK_LLM: 'true',
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: '',
    DATABASE_URL: 'file:./prisma/.test-graph.db',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

// Stub filesystem writes from storePdf — we don't care about real files on disk.
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  mockGetText.mockReset();
  mockDestroy.mockClear();
});

afterEach(() => {
  clearMockHandlers();
  currentUserMock.mockReset();
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

    const nodes = await prisma.graphNode.findMany({ where: { userId } });
    expect(nodes.map((n) => n.canonicalKey).sort()).toEqual(['ferritin', 'haemoglobin']);

    const ironPage = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: 'iron' } },
    });
    expect(ironPage?.status).toBe('full');

    const supportsEdges = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS' },
    });
    expect(supportsEdges.length).toBeGreaterThanOrEqual(2);
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
});
