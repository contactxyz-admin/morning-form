import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

// ---- Mocks ----
// The assembler fetches uploaded PDFs from private Blob via get(). We mock it
// so tests run without network/credentials. By default get() returns a tiny
// PDF-ish body; individual tests override per-call.
const blobGetMock = vi.fn();
vi.mock('@vercel/blob', () => ({
  get: (...args: unknown[]) => blobGetMock(...args),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

import {
  EXCLUSIONS,
  EXPORT_DOMAIN_MODELS,
  assembleExportArchive,
  buildStoreZip,
} from './export';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

/** Build a fake private-blob get() success result with the given bytes. */
function blobOk(bytes: Buffer) {
  return {
    statusCode: 200 as const,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
    headers: new Headers(),
    blob: {} as never,
  };
}

/** Parse a store-only zip buffer into a name -> Buffer map (no decompression). */
function readStoreZip(zip: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let i = 0;
  while (i + 4 <= zip.length && zip.readUInt32LE(i) === 0x04034b50) {
    const compSize = zip.readUInt32LE(i + 18);
    const nameLen = zip.readUInt16LE(i + 26);
    const extraLen = zip.readUInt16LE(i + 28);
    const nameStart = i + 30;
    const name = zip.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    out[name] = zip.subarray(dataStart, dataStart + compSize);
    i = dataStart + compSize;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structural completeness guard (the legal requirement)
// ---------------------------------------------------------------------------

describe('export completeness guard', () => {
  it('covers every user-owned model in EXPORT_DOMAIN_MODELS or EXCLUSIONS', () => {
    const excluded = new Set(EXCLUSIONS.map((e) => e.model));
    const uncovered: string[] = [];

    for (const model of Prisma.dmmf.datamodel.models) {
      const hasUserId = model.fields.some((f) => f.name === 'userId');
      const hasEmail = model.fields.some((f) => f.name === 'email');
      // Documented user-data models that link to the user via an intermediate
      // (no direct userId column) and must still be classified.
      const indirectUserData = [
        'User',
        'PriorityMarker',
        'PrioritiesAdjustment',
        'SourceChunk',
        'SourceDocumentAlias',
        'ScribeTool',
        'VectorEmbedding',
      ].includes(model.name);

      if (!hasUserId && !hasEmail && !indirectUserData) continue;

      const covered = EXPORT_DOMAIN_MODELS.has(model.name) || excluded.has(model.name);
      if (!covered) uncovered.push(model.name);
    }

    expect(uncovered).toEqual([]);
  });

  it('keeps EXPORT_DOMAIN_MODELS and EXCLUSIONS disjoint', () => {
    const excluded = new Set(EXCLUSIONS.map((e) => e.model));
    const both = Array.from(EXPORT_DOMAIN_MODELS).filter((m) => excluded.has(m));
    expect(both).toEqual([]);
  });

  it('every exclusion carries a non-empty reason', () => {
    for (const e of EXCLUSIONS) {
      expect(e.reason.length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// store-only zip writer
// ---------------------------------------------------------------------------

describe('buildStoreZip', () => {
  it('produces a parseable archive with the right contents', () => {
    const zip = buildStoreZip([
      { name: 'a.json', data: Buffer.from('{"x":1}', 'utf8') },
      { name: 'files/doc.pdf', data: Buffer.from('%PDF-fake', 'utf8') },
    ]);
    const entries = readStoreZip(zip);
    expect(Object.keys(entries).sort()).toEqual(['a.json', 'files/doc.pdf']);
    expect(entries['a.json'].toString('utf8')).toBe('{"x":1}');
    expect(entries['files/doc.pdf'].toString('utf8')).toBe('%PDF-fake');
    // End-of-central-directory signature present.
    expect(zip.subarray(zip.length - 22).readUInt32LE(0)).toBe(0x06054b50);
  });
});

// ---------------------------------------------------------------------------
// Full multi-domain assembly
// ---------------------------------------------------------------------------

async function seedMultiDomainUser(p: PrismaClient): Promise<string> {
  const userId = await makeTestUser(p, 'export-full');

  await p.userPreferences.create({ data: { userId, wakeTime: '06:30' } });
  await p.assessmentResponse.create({ data: { userId, responses: '{"q1":"a"}' } });
  await p.stateProfile.create({
    data: {
      userId,
      archetype: 'depleted-achiever',
      primaryPattern: 'p',
      patternDescription: 'd',
      observations: 'o',
      constraints: 'c',
      sensitivities: 's',
    },
  });
  const priorities = await p.priorities.create({
    data: { userId, rationale: 'because' },
  });
  await p.priorityMarker.create({
    data: { prioritiesId: priorities.id, markerName: 'Ferritin', rationale: 'iron', category: 'iron' },
  });
  await p.prioritiesAdjustment.create({
    data: { prioritiesId: priorities.id, description: 'adj', rationale: 'r' },
  });
  await p.checkIn.create({ data: { userId, type: 'morning', date: '2026-03-20', responses: '{}' } });
  await p.checkIn.create({ data: { userId, type: 'evening', date: '2026-03-20', responses: '{}' } });
  await p.chatMessage.create({ data: { userId, role: 'user', content: 'hi' } });
  const scribe = await p.scribe.create({
    data: { userId, topicKey: 'iron', modelVersion: 'v1' },
  });
  await p.scribeTool.create({ data: { scribeId: scribe.id, toolName: 'search' } });
  await p.scribeTopicLink.create({ data: { userId, topicKey: 'iron', scribeId: scribe.id } });
  await p.healthConnection.create({
    data: { userId, provider: 'whoop', accessToken: 'SECRET', refreshToken: 'SECRET2' },
  });
  await p.healthDataPoint.create({
    data: {
      userId,
      provider: 'whoop',
      category: 'sleep',
      metric: 'duration',
      value: 7.5,
      unit: 'h',
      timestamp: new Date(),
    },
  });
  await p.sharedView.create({ data: { userId, tokenHash: `h-${userId}`, scope: '{}' } });
  await p.suggestion.create({
    data: {
      userId,
      date: new Date(),
      kind: 'hydration',
      title: 'Drink water',
      tier: 'foundational',
      triggeringMetricIds: '[]',
    },
  });

  // Record domain: a source document with chunks + an uploaded PDF blob.
  const doc = await p.sourceDocument.create({
    data: {
      userId,
      kind: 'lab_pdf',
      capturedAt: new Date(),
      storagePath: `uploads/${userId}/abc.pdf`,
    },
  });
  await p.sourceChunk.create({
    data: { sourceDocumentId: doc.id, index: 0, text: 'ferritin 30 ng/mL', offsetStart: 0, offsetEnd: 16 },
  });
  const node = await p.graphNode.create({
    data: { userId, type: 'marker', canonicalKey: 'ferritin', displayName: 'Ferritin' },
  });
  const node2 = await p.graphNode.create({
    data: { userId, type: 'marker', canonicalKey: 'iron', displayName: 'Iron' },
  });
  await p.graphEdge.create({
    data: { userId, type: 'relates', fromNodeId: node.id, toNodeId: node2.id },
  });
  await p.graphNodeLayout.create({ data: { userId, nodeId: node.id, x: 1, y: 2 } });
  await p.topicPage.create({ data: { userId, topicKey: 'iron', rendered: '# Iron' } });

  return userId;
}

describe('assembleExportArchive — seeded multi-domain user', () => {
  it('produces every domain file with correct counts and a manifest', async () => {
    const userId = await seedMultiDomainUser(prisma);
    blobGetMock.mockReset();
    blobGetMock.mockResolvedValue(blobOk(Buffer.from('%PDF-original', 'utf8')));

    const { zip, manifest } = await assembleExportArchive(prisma, userId);
    const entries = readStoreZip(zip);

    // Every domain JSON present, plus manifest, plus the PDF in files/.
    const expectedDomainFiles = [
      'account.json',
      'preferences.json',
      'assessment.json',
      'stateProfile.json',
      'priorities.json',
      'checkIns.json',
      'chatMessages.json',
      'scribes.json',
      'healthConnections.json',
      'healthDataPoints.json',
      'sharedViews.json',
      'suggestions.json',
      'record.json',
      'manifest.json',
    ];
    for (const f of expectedDomainFiles) {
      expect(entries[f], `missing ${f}`).toBeDefined();
    }

    const checkIns = JSON.parse(entries['checkIns.json'].toString('utf8'));
    expect(checkIns).toHaveLength(2);

    const priorities = JSON.parse(entries['priorities.json'].toString('utf8'));
    expect(priorities[0].items).toHaveLength(1);
    expect(priorities[0].adjustments).toHaveLength(1);

    // Health connection tokens must be stripped.
    const conns = JSON.parse(entries['healthConnections.json'].toString('utf8'));
    expect(conns[0].accessToken).toBeUndefined();
    expect(conns[0].refreshToken).toBeUndefined();
    expect(conns[0].provider).toBe('whoop');

    // Record domain carries graph + source chunk TEXT (the intelligible
    // substitute for excluded embeddings).
    const record = JSON.parse(entries['record.json'].toString('utf8'));
    expect(record.graphNodes).toHaveLength(2);
    expect(record.graphEdges).toHaveLength(1);
    expect(record.sourceDocuments[0].chunks[0].text).toBe('ferritin 30 ng/mL');

    // Original PDF lands under files/.
    const pdfKey = Object.keys(entries).find((k) => k.startsWith('files/'));
    expect(pdfKey).toBeDefined();
    expect(entries[pdfKey!].toString('utf8')).toBe('%PDF-original');

    // Manifest: counts + explicit empties + exclusions with reasoning.
    const checkInDomain = manifest.domains.find((d) => d.key === 'checkIns');
    expect(checkInDomain?.count).toBe(2);
    expect(checkInDomain?.empty).toBe(false);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.exclusions.some((e) => e.model === 'VectorEmbedding')).toBe(true);

    // Manifest is also embedded in the zip and matches.
    const manifestInZip = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifestInZip.userId).toBe(userId);
  });
});

describe('assembleExportArchive — brand-new user', () => {
  it('emits explicitly-empty domain files (present, not missing)', async () => {
    const userId = await makeTestUser(prisma, 'export-empty');
    blobGetMock.mockReset();

    const { zip, manifest } = await assembleExportArchive(prisma, userId);
    const entries = readStoreZip(zip);

    // checkIns/suggestions/etc present as empty arrays.
    expect(entries['checkIns.json']).toBeDefined();
    expect(JSON.parse(entries['checkIns.json'].toString('utf8'))).toEqual([]);
    expect(JSON.parse(entries['suggestions.json'].toString('utf8'))).toEqual([]);

    // account present (the User row exists).
    const account = JSON.parse(entries['account.json'].toString('utf8'));
    expect(account).toHaveLength(1);

    // No PDFs → no files/ entries, manifest.files empty, but record present.
    expect(Object.keys(entries).some((k) => k.startsWith('files/'))).toBe(false);
    expect(manifest.files).toEqual([]);
    const checkInDomain = manifest.domains.find((d) => d.key === 'checkIns');
    expect(checkInDomain?.empty).toBe(true);

    // get() was never called — no documents to fetch.
    expect(blobGetMock).not.toHaveBeenCalled();
  });
});

describe('assembleExportArchive — failure posture', () => {
  it('throws (no partial archive) when a blob fetch returns null', async () => {
    const userId = await makeTestUser(prisma, 'export-blobfail');
    await prisma.sourceDocument.create({
      data: { userId, kind: 'lab_pdf', capturedAt: new Date(), storagePath: `uploads/${userId}/x.pdf` },
    });
    blobGetMock.mockReset();
    blobGetMock.mockResolvedValue(null);

    await expect(assembleExportArchive(prisma, userId)).rejects.toThrow();
  });
});
