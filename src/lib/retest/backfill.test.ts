import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { backfillBaselineDrawForUser } from './backfill';
import { computeRetestRetention } from '@/lib/metrics/retest-retention';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function makeLab(userId: string, capturedAt: Date): Promise<string> {
  const doc = await prisma.sourceDocument.create({ data: { userId, kind: 'lab_pdf', capturedAt } });
  return doc.id;
}

describe('backfillBaselineDrawForUser', () => {
  it('creates a backfill baseline draw + schedules the next from the latest panel', async () => {
    const userId = await makeTestUser(prisma, 'bf-create');
    const earlyDoc = await makeLab(userId, new Date('2026-01-01T00:00:00.000Z'));
    await makeLab(userId, new Date('2026-04-01T00:00:00.000Z')); // most recent panel

    const res = await backfillBaselineDrawForUser(prisma, userId, { apply: true });

    expect(res.status).toBe('created');
    expect(res.baselineAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // Next retest scheduled one cadence after the LATEST panel (2026-04-01 + 90d).
    expect(res.nextScheduledFor?.toISOString()).toBe('2026-06-30T00:00:00.000Z');

    const baseline = await prisma.draw.findFirstOrThrow({ where: { userId, status: 'completed' } });
    expect(baseline.sequence).toBe(1);
    expect(baseline.attribution).toBe('backfill');
    expect(baseline.completedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    // Earliest panel is linked to the baseline draw.
    const linked = await prisma.sourceDocument.findUniqueOrThrow({ where: { id: earlyDoc } });
    expect(linked.drawId).toBe(baseline.id);

    // Exactly one scheduled draw exists (the next retest).
    expect(await prisma.draw.count({ where: { userId, status: 'scheduled' } })).toBe(1);
  });

  it('is idempotent — a user who already has draws is skipped', async () => {
    const userId = await makeTestUser(prisma, 'bf-idem');
    await makeLab(userId, new Date('2026-01-01T00:00:00.000Z'));
    await backfillBaselineDrawForUser(prisma, userId, { apply: true });

    const before = await prisma.draw.count({ where: { userId } });
    const res = await backfillBaselineDrawForUser(prisma, userId, { apply: true });

    expect(res.status).toBe('skipped-has-draws');
    expect(await prisma.draw.count({ where: { userId } })).toBe(before);
  });

  it('dry run writes nothing', async () => {
    const userId = await makeTestUser(prisma, 'bf-dry');
    await makeLab(userId, new Date('2026-02-01T00:00:00.000Z'));

    const res = await backfillBaselineDrawForUser(prisma, userId, { apply: false });

    expect(res.status).toBe('would-create');
    expect(res.baselineAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(await prisma.draw.count({ where: { userId } })).toBe(0);
  });

  it('skips a user with no lab panels', async () => {
    const userId = await makeTestUser(prisma, 'bf-nolabs');
    const res = await backfillBaselineDrawForUser(prisma, userId, { apply: true });
    expect(res.status).toBe('skipped-no-labs');
    expect(await prisma.draw.count({ where: { userId } })).toBe(0);
  });

  it('a backfilled user is excluded from the forward-only retention metric', async () => {
    const userId = await makeTestUser(prisma, 'bf-excluded');
    await makeLab(userId, new Date('2026-01-01T00:00:00.000Z'));
    await backfillBaselineDrawForUser(prisma, userId, { apply: true });

    const r = await computeRetestRetention(prisma, {
      now: new Date('2026-09-01T00:00:00.000Z'),
      userIds: [userId],
    });
    // Backfilled baseline → not counted in the population.
    expect(r.baselineUsers).toBe(0);
  });
});
