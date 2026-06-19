import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { completeDrawForSourceDocument } from './draws';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

/** Create a lab-panel SourceDocument and return its id. */
async function makeDoc(userId: string, capturedAt: Date): Promise<string> {
  const doc = await prisma.sourceDocument.create({
    data: { userId, kind: 'lab_pdf', capturedAt },
  });
  return doc.id;
}

describe('completeDrawForSourceDocument', () => {
  it('first panel → baseline draw #1 + a scheduled draw one cadence out', async () => {
    const userId = await makeTestUser(prisma, 'draw-baseline');
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const docId = await makeDoc(userId, d1);

    const res = await completeDrawForSourceDocument(prisma, userId, docId, d1);

    expect(res.deduped).toBe(false);
    expect(res.sequence).toBe(1);
    expect(res.attribution).toBe('baseline');

    // The panel is linked to the completed draw.
    const doc = await prisma.sourceDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(doc.drawId).toBe(res.drawId);

    // Exactly one completed draw and one scheduled draw, dated +90d.
    expect(await prisma.draw.count({ where: { userId, status: 'completed' } })).toBe(1);
    const scheduled = await prisma.draw.findFirstOrThrow({ where: { userId, status: 'scheduled' } });
    expect(scheduled.scheduledFor?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(scheduled.sequence).toBeNull();
  });

  it('retest within the attribution window of a nudge → attribution "nudge"', async () => {
    const userId = await makeTestUser(prisma, 'draw-nudge');
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    await completeDrawForSourceDocument(prisma, userId, await makeDoc(userId, d1), d1);

    // Simulate the cron having nudged the open scheduled draw.
    const scheduled = await prisma.draw.findFirstOrThrow({ where: { userId, status: 'scheduled' } });
    await prisma.draw.update({
      where: { id: scheduled.id },
      data: { nudgeCount: 1, lastNudgedAt: new Date('2026-04-02T00:00:00.000Z') },
    });

    // Re-draw collected 8 days after the nudge (≤ 30-day window), outside the dedup window.
    const d2 = new Date('2026-04-10T00:00:00.000Z');
    const res = await completeDrawForSourceDocument(prisma, userId, await makeDoc(userId, d2), d2);

    expect(res.deduped).toBe(false);
    expect(res.sequence).toBe(2);
    expect(res.attribution).toBe('nudge');
    // The same scheduled row was completed (not a new draw).
    expect(res.drawId).toBe(scheduled.id);
    // A fresh draw #3 is scheduled.
    expect(await prisma.draw.count({ where: { userId, status: 'scheduled' } })).toBe(1);
  });

  it('retest with no preceding nudge → attribution "organic"', async () => {
    const userId = await makeTestUser(prisma, 'draw-organic');
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    await completeDrawForSourceDocument(prisma, userId, await makeDoc(userId, d1), d1);

    const d2 = new Date('2026-04-10T00:00:00.000Z');
    const res = await completeDrawForSourceDocument(prisma, userId, await makeDoc(userId, d2), d2);

    expect(res.sequence).toBe(2);
    expect(res.attribution).toBe('organic');
  });

  it('same-visit dedup: a second panel within the window attaches to the existing draw', async () => {
    const userId = await makeTestUser(prisma, 'draw-dedup');
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const baseline = await completeDrawForSourceDocument(prisma, userId, await makeDoc(userId, d1), d1);

    // 5 days later (≤ 14-day dedup window) — same visit, a second PDF.
    const d2 = new Date('2026-01-06T00:00:00.000Z');
    const docId2 = await makeDoc(userId, d2);
    const res = await completeDrawForSourceDocument(prisma, userId, docId2, d2);

    expect(res.deduped).toBe(true);
    expect(res.drawId).toBe(baseline.drawId);
    expect(res.sequence).toBeUndefined();
    // No new draw event: still exactly one completed draw, sequence still 1.
    expect(await prisma.draw.count({ where: { userId, status: 'completed' } })).toBe(1);
    const doc2 = await prisma.sourceDocument.findUniqueOrThrow({ where: { id: docId2 } });
    expect(doc2.drawId).toBe(baseline.drawId);
  });

  it('concurrent ingests assign distinct sequences (race guard)', async () => {
    const userId = await makeTestUser(prisma, 'draw-race');
    const dA = new Date('2026-01-01T00:00:00.000Z');
    const dB = new Date('2026-06-01T00:00:00.000Z'); // far apart → neither dedups the other
    const [docA, docB] = await Promise.all([makeDoc(userId, dA), makeDoc(userId, dB)]);

    await Promise.all([
      completeDrawForSourceDocument(prisma, userId, docA, dA),
      completeDrawForSourceDocument(prisma, userId, docB, dB),
    ]);

    const completed = await prisma.draw.findMany({
      where: { userId, status: 'completed' },
      orderBy: { sequence: 'asc' },
      select: { sequence: true },
    });
    expect(completed.map((d) => d.sequence)).toEqual([1, 2]);
    // The "exactly one open scheduled draw" invariant survives concurrency.
    expect(await prisma.draw.count({ where: { userId, status: 'scheduled' } })).toBe(1);
  });

  it('concurrent SAME-visit ingests dedup to one draw (advisory lock serializes)', async () => {
    const userId = await makeTestUser(prisma, 'draw-race-samevisit');
    const dA = new Date('2026-01-01T00:00:00.000Z');
    const dB = new Date('2026-01-04T00:00:00.000Z'); // 3 days → within the dedup window
    const [docA, docB] = await Promise.all([makeDoc(userId, dA), makeDoc(userId, dB)]);

    await Promise.all([
      completeDrawForSourceDocument(prisma, userId, docA, dA),
      completeDrawForSourceDocument(prisma, userId, docB, dB),
    ]);

    // Without per-user serialization both would miss dedup and create two draws.
    expect(await prisma.draw.count({ where: { userId, status: 'completed' } })).toBe(1);
    expect(await prisma.draw.count({ where: { userId, status: 'scheduled' } })).toBe(1);
    // Both panels are linked to the single completed draw.
    const baseline = await prisma.draw.findFirstOrThrow({ where: { userId, status: 'completed' } });
    expect(await prisma.sourceDocument.count({ where: { drawId: baseline.id } })).toBe(2);
  });
});
