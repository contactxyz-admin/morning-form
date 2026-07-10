import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { createReviewForDocument } from '@/lib/review/queue';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  CLINICIAN_REVIEW_ENABLED: 'true',
  CLINICIAN_ALLOWLIST: 'dr@clinic.org',
  OPS_EMAIL: 'ops@morningform.com',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { GET } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
  await rm(path.join(process.cwd(), 'uploads', 'src-test-user'), { recursive: true, force: true });
});

afterEach(() => {
  currentUserMock.mockReset();
  envMock.CLINICIAN_REVIEW_ENABLED = 'true';
});

async function makeReviewWithDoc(suffix: string, storagePath: string | null) {
  const userId = await makeTestUser(prisma, `src-${suffix}`);
  const doc = await prisma.sourceDocument.create({
    data: {
      userId,
      kind: 'lab_pdf',
      sourceRef: `panel-${suffix}.pdf`,
      contentHash: `hash-src-${suffix}-${Math.random().toString(36).slice(2)}`,
      capturedAt: new Date('2026-07-01T00:00:00Z'),
      storagePath,
    },
  });
  await createReviewForDocument(prisma, {
    userId,
    sourceDocumentId: doc.id,
    documentCapturedAt: doc.capturedAt,
    biomarkers: [
      {
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        value: 12,
        unit: 'µg/L',
        referenceRangeLow: 30,
        referenceRangeHigh: 400,
        flaggedOutOfRange: true,
        collectionDate: '2026-07-01',
      },
    ],
    labProvider: 'TDL',
    sourceRef: doc.sourceRef,
  });
  return prisma.resultReview.findUniqueOrThrow({ where: { sourceDocumentId: doc.id } });
}

function getFor(id: string) {
  return GET(new NextRequest(`http://localhost/api/clinic/reviews/${id}/source`), {
    params: { id },
  });
}

function signInClinician() {
  currentUserMock.mockResolvedValue({ id: 'clin-user', email: 'dr@clinic.org' });
}

describe('GET /api/clinic/reviews/[id]/source', () => {
  it('404 flag off; 401 unauthenticated; 403 non-clinician', async () => {
    envMock.CLINICIAN_REVIEW_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'x', email: 'dr@clinic.org' });
    expect((await getFor('any')).status).toBe(404);

    envMock.CLINICIAN_REVIEW_ENABLED = 'true';
    currentUserMock.mockResolvedValue(null);
    expect((await getFor('any')).status).toBe(401);

    currentUserMock.mockResolvedValue({ id: 'x', email: 'member@example.com' });
    expect((await getFor('any')).status).toBe(403);
  });

  it('404 for an unknown review and for a review with no stored document', async () => {
    signInClinician();
    expect((await getFor('does-not-exist')).status).toBe(404);
    const review = await makeReviewWithDoc('nodoc', null);
    expect((await getFor(review.id)).status).toBe(404);
  });

  it('streams a dev-filesystem document with the right content type', async () => {
    signInClinician();
    const dir = path.join(process.cwd(), 'uploads', 'src-test-user');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'panel.pdf'), '%PDF-1.4 test');
    const review = await makeReviewWithDoc('fs', 'uploads/src-test-user/panel.pdf');

    const res = await getFor(review.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('%PDF-1.4 test');
  });

  it('refuses a storagePath that escapes uploads/', async () => {
    signInClinician();
    const review = await makeReviewWithDoc('traversal', '../.env');
    expect((await getFor(review.id)).status).toBe(404);
  });
});
