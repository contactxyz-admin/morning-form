import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { loadEscalatedMarkerKeys } from './overrides';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

function summaryFor(joinKeys: string[]): string {
  return JSON.stringify({
    labProvider: 'TDL',
    sourceRef: 'panel.pdf',
    markers: joinKeys.map((key) => ({
      displayName: key,
      canonicalKey: key,
      joinKey: key,
      value: 1,
      unit: null,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      flaggedOutOfRange: false,
      collectionDate: null,
    })),
  });
}

async function makeDecidedReview(
  userId: string,
  input: {
    capturedAt: string;
    panelKeys: string[];
    status: 'pending' | 'approved' | 'escalated';
    escalatedKeys?: string[];
  },
) {
  return prisma.resultReview.create({
    data: {
      userId,
      // sourceDocumentId deliberately null — the fold must work on orphaned
      // decided reviews (audit records whose document was later deleted).
      panelSummary: summaryFor(input.panelKeys),
      documentCapturedAt: new Date(input.capturedAt),
      status: input.status,
      clinicianEmail: input.status === 'pending' ? null : 'dr@clinic.org',
      decidedAt: input.status === 'pending' ? null : new Date(),
      escalatedMarkerKeys: input.escalatedKeys ? JSON.stringify(input.escalatedKeys) : null,
    },
  });
}

describe('loadEscalatedMarkerKeys — latest-decision-per-marker fold', () => {
  it('a lone escalation flags its marker keys', async () => {
    const userId = await makeTestUser(prisma, 'ov-lone');
    await makeDecidedReview(userId, {
      capturedAt: '2026-07-01',
      panelKeys: ['ferritin', 'hba1c'],
      status: 'escalated',
      escalatedKeys: ['ferritin'],
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    expect(keys).toEqual(new Set(['ferritin']));
  });

  it('a LATER approved re-test of the same marker clears the flag', async () => {
    const userId = await makeTestUser(prisma, 'ov-clear');
    await makeDecidedReview(userId, {
      capturedAt: '2026-07-01',
      panelKeys: ['ferritin'],
      status: 'escalated',
      escalatedKeys: ['ferritin'],
    });
    await makeDecidedReview(userId, {
      capturedAt: '2026-08-01',
      panelKeys: ['ferritin'],
      status: 'approved',
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    expect(keys.size).toBe(0);
  });

  it('a later approved panel NOT containing the marker does not clear it', async () => {
    const userId = await makeTestUser(prisma, 'ov-other-panel');
    await makeDecidedReview(userId, {
      capturedAt: '2026-07-01',
      panelKeys: ['ferritin'],
      status: 'escalated',
      escalatedKeys: ['ferritin'],
    });
    await makeDecidedReview(userId, {
      capturedAt: '2026-08-01',
      panelKeys: ['hba1c'], // different marker entirely
      status: 'approved',
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    expect(keys).toEqual(new Set(['ferritin']));
  });

  it('a newer PENDING review clears nothing (no human has decided yet)', async () => {
    const userId = await makeTestUser(prisma, 'ov-pending');
    await makeDecidedReview(userId, {
      capturedAt: '2026-07-01',
      panelKeys: ['ferritin'],
      status: 'escalated',
      escalatedKeys: ['ferritin'],
    });
    await makeDecidedReview(userId, {
      capturedAt: '2026-08-01',
      panelKeys: ['ferritin'],
      status: 'pending',
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    expect(keys).toEqual(new Set(['ferritin']));
  });

  it('clinical recency (documentCapturedAt) outranks decision time: deciding an OLD panel late cannot re-flag a marker a newer panel cleared', async () => {
    const userId = await makeTestUser(prisma, 'ov-recency');
    // Newer panel approved first (clears/covers ferritin as of Aug).
    await makeDecidedReview(userId, {
      capturedAt: '2026-08-01',
      panelKeys: ['ferritin'],
      status: 'approved',
    });
    // OLD July panel escalated afterwards (decidedAt later, capturedAt earlier).
    await makeDecidedReview(userId, {
      capturedAt: '2026-07-01',
      panelKeys: ['ferritin'],
      status: 'escalated',
      escalatedKeys: ['ferritin'],
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    expect(keys.size).toBe(0);
  });

  it('malformed panelSummary rows are skipped, not fatal', async () => {
    const userId = await makeTestUser(prisma, 'ov-malformed');
    await prisma.resultReview.create({
      data: {
        userId,
        panelSummary: '{not json',
        documentCapturedAt: new Date('2026-07-01'),
        status: 'escalated',
        clinicianEmail: 'dr@clinic.org',
        decidedAt: new Date(),
        escalatedMarkerKeys: JSON.stringify(['ferritin']),
      },
    });
    await makeDecidedReview(userId, {
      capturedAt: '2026-08-01',
      panelKeys: ['hba1c'],
      status: 'escalated',
      escalatedKeys: ['hba1c'],
    });

    const keys = await loadEscalatedMarkerKeys(prisma, userId);
    // The malformed row contributes nothing; the good row still folds.
    expect(keys).toEqual(new Set(['hba1c']));
  });
});
