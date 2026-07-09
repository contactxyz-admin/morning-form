import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import {
  createReviewForDocument,
  decideReview,
  listPendingReviews,
  countRecentDocsWithoutReview,
  UnknownMarkerKeysError,
} from './queue';
import type { ExtractedMarkerInput } from './snapshot';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const FERRITIN: ExtractedMarkerInput = {
  canonicalKey: 'ferritin',
  displayName: 'Ferritin',
  value: 12,
  unit: 'µg/L',
  referenceRangeLow: 30,
  referenceRangeHigh: 400,
  flaggedOutOfRange: true,
  collectionDate: '2026-07-01',
};

const HBA1C: ExtractedMarkerInput = {
  canonicalKey: 'hba1c',
  displayName: 'HbA1c',
  value: 34,
  unit: 'mmol/mol',
  referenceRangeLow: 20,
  referenceRangeHigh: 41,
  flaggedOutOfRange: false,
  collectionDate: '2026-07-01',
};

async function makeDoc(userId: string, suffix: string) {
  return prisma.sourceDocument.create({
    data: {
      userId,
      kind: 'lab_pdf',
      sourceRef: `panel-${suffix}.pdf`,
      contentHash: `hash-${suffix}-${Math.random().toString(36).slice(2)}`,
      capturedAt: new Date('2026-07-01T00:00:00Z'),
    },
  });
}

async function makeReview(userId: string, suffix: string, biomarkers = [FERRITIN, HBA1C]) {
  const doc = await makeDoc(userId, suffix);
  await createReviewForDocument(prisma, {
    userId,
    sourceDocumentId: doc.id,
    documentCapturedAt: doc.capturedAt,
    biomarkers,
    labProvider: 'TDL',
    sourceRef: doc.sourceRef,
  });
  const review = await prisma.resultReview.findUniqueOrThrow({
    where: { sourceDocumentId: doc.id },
  });
  return { doc, review };
}

describe('createReviewForDocument', () => {
  it('creates a pending review with a validated snapshot', async () => {
    const userId = await makeTestUser(prisma, 'rq-create');
    const { review } = await makeReview(userId, 'create');

    expect(review.status).toBe('pending');
    const summary = JSON.parse(review.panelSummary);
    expect(summary.labProvider).toBe('TDL');
    expect(summary.markers).toHaveLength(2);
    expect(summary.markers[0].joinKey).toBe('ferritin');
    expect(summary.markers[0].flaggedOutOfRange).toBe(true);
  });

  it('is idempotent — a retried hook cannot create a second review for the same document', async () => {
    const userId = await makeTestUser(prisma, 'rq-idem');
    const { doc } = await makeReview(userId, 'idem');

    const second = await createReviewForDocument(prisma, {
      userId,
      sourceDocumentId: doc.id,
      documentCapturedAt: doc.capturedAt,
      biomarkers: [FERRITIN],
      labProvider: 'TDL',
      sourceRef: doc.sourceRef,
    });
    expect(second.created).toBe(false);
    const count = await prisma.resultReview.count({ where: { sourceDocumentId: doc.id } });
    expect(count).toBe(1);
  });
});

describe('decideReview', () => {
  it('approve: records clinician + decidedAt, no escalation fields', async () => {
    const userId = await makeTestUser(prisma, 'rq-approve');
    const { review } = await makeReview(userId, 'approve');

    const result = await decideReview(prisma, {
      reviewId: review.id,
      clinicianEmail: 'dr@clinic.org',
      action: 'approve',
    });
    expect(result.decided).toBe(true);
    if (result.decided) {
      expect(result.review.status).toBe('approved');
      expect(result.review.clinicianEmail).toBe('dr@clinic.org');
      expect(result.review.decidedAt).toBeInstanceOf(Date);
      expect(result.review.escalationReason).toBeNull();
      expect(result.review.escalatedMarkerKeys).toBeNull();
    }
  });

  it('escalate without markerKeys defaults to the lab-flagged subset', async () => {
    const userId = await makeTestUser(prisma, 'rq-esc-default');
    const { review } = await makeReview(userId, 'esc-default');

    const result = await decideReview(prisma, {
      reviewId: review.id,
      clinicianEmail: 'dr@clinic.org',
      action: 'escalate',
      reason: 'Ferritin well below range; recommend GP follow-up.',
    });
    expect(result.decided).toBe(true);
    if (result.decided) {
      expect(result.escalatedMarkerKeys).toEqual(['ferritin']);
      expect(JSON.parse(result.review.escalatedMarkerKeys ?? '[]')).toEqual(['ferritin']);
    }
  });

  it('escalate with nothing lab-flagged falls back to ALL panel markers', async () => {
    const userId = await makeTestUser(prisma, 'rq-esc-all');
    const { review } = await makeReview(userId, 'esc-all', [
      { ...FERRITIN, flaggedOutOfRange: false },
      HBA1C,
    ]);

    const result = await decideReview(prisma, {
      reviewId: review.id,
      clinicianEmail: 'dr@clinic.org',
      action: 'escalate',
      reason: 'Pattern across the panel warrants a GP conversation.',
    });
    expect(result.decided).toBe(true);
    if (result.decided) {
      expect(new Set(result.escalatedMarkerKeys)).toEqual(new Set(['ferritin', 'hba1c']));
    }
  });

  it('escalate rejects markerKeys not present in the panel (never silently shrinks)', async () => {
    const userId = await makeTestUser(prisma, 'rq-esc-unknown');
    const { review } = await makeReview(userId, 'esc-unknown');

    await expect(
      decideReview(prisma, {
        reviewId: review.id,
        clinicianEmail: 'dr@clinic.org',
        action: 'escalate',
        reason: 'Escalating a marker that is not in this panel.',
        markerKeys: ['ferritin', 'not_in_panel'],
      }),
    ).rejects.toBeInstanceOf(UnknownMarkerKeysError);

    const unchanged = await prisma.resultReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(unchanged.status).toBe('pending');
  });

  it('two concurrent decisions: exactly one wins, the loser sees the current status', async () => {
    const userId = await makeTestUser(prisma, 'rq-cas');
    const { review } = await makeReview(userId, 'cas');

    const [a, b] = await Promise.all([
      decideReview(prisma, { reviewId: review.id, clinicianEmail: 'a@clinic.org', action: 'approve' }),
      decideReview(prisma, {
        reviewId: review.id,
        clinicianEmail: 'b@clinic.org',
        action: 'escalate',
        reason: 'Concurrent escalate attempt for the CAS test.',
      }),
    ]);

    const winners = [a, b].filter((r) => r.decided);
    expect(winners).toHaveLength(1);
    const loser = [a, b].find((r) => !r.decided);
    expect(loser && !loser.decided ? loser.currentStatus : null).toMatch(/approved|escalated/);
  });

  it('unknown review id → decided:false with null status', async () => {
    const result = await decideReview(prisma, {
      reviewId: 'does-not-exist',
      clinicianEmail: 'dr@clinic.org',
      action: 'approve',
    });
    expect(result).toEqual({ decided: false, currentStatus: null });
  });
});

describe('queue reads', () => {
  it('listPendingReviews returns only pending reviews with live documents, oldest first', async () => {
    const userId = await makeTestUser(prisma, 'rq-list');
    const { review: first } = await makeReview(userId, 'list-1');
    const { review: second } = await makeReview(userId, 'list-2');
    await decideReview(prisma, { reviewId: second.id, clinicianEmail: 'dr@c.org', action: 'approve' });

    const pending = await listPendingReviews(prisma);
    const mine = pending.filter((r) => r.userId === userId);
    expect(mine.map((r) => r.id)).toEqual([first.id]);
    expect(mine[0].user.email).toContain('@example.com');
  });

  it('countRecentDocsWithoutReview counts lab docs missing a review row', async () => {
    const userId = await makeTestUser(prisma, 'rq-recon');
    const before = await countRecentDocsWithoutReview(prisma, new Date(Date.now() - 86400000));
    await makeDoc(userId, 'recon-orphan'); // doc with NO review
    const after = await countRecentDocsWithoutReview(prisma, new Date(Date.now() - 86400000));
    expect(after).toBe(before + 1);
  });
});
