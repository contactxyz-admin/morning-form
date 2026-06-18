import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addDays } from '@/lib/retest/constants';
import { computeRetestRetention } from './retest-retention';
import { formatRetestRetention } from './activation-funnel-format';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const NOW = new Date('2026-09-01T00:00:00.000Z');
const BASELINE_AT = new Date('2026-01-01T00:00:00.000Z');

interface DrawSpec {
  sequence?: number | null;
  status: string;
  attribution?: string | null;
  completedAt?: Date | null;
  scheduledFor?: Date | null;
  lastNudgedAt?: Date | null;
  lapsedAt?: Date | null;
}

async function seedDraws(label: string, specs: DrawSpec[]): Promise<string> {
  const userId = await makeTestUser(prisma, label);
  for (const s of specs) {
    await prisma.draw.create({
      data: {
        userId,
        sequence: s.sequence ?? null,
        status: s.status,
        attribution: s.attribution ?? null,
        completedAt: s.completedAt ?? null,
        scheduledFor: s.scheduledFor ?? null,
        lastNudgedAt: s.lastNudgedAt ?? null,
        lapsedAt: s.lapsedAt ?? null,
      },
    });
  }
  return userId;
}

describe('computeRetestRetention', () => {
  it('counts a nudge-attributed second draw as loop-caused, with latency', async () => {
    const userId = await seedDraws('rr-nudge', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      {
        sequence: 2,
        status: 'completed',
        attribution: 'nudge',
        completedAt: new Date('2026-04-10T00:00:00.000Z'),
        lastNudgedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.baselineUsers).toBe(1);
    expect(r.returned).toBe(1);
    expect(r.nudgeAttributedReturned).toBe(1);
    expect(r.resolvedDenominator).toBe(1);
    expect(r.nudgeAttributedRetentionPct).toBe(100);
    expect(r.totalRetentionPct).toBe(100);
    expect(r.secondDrawAttributionMix.nudge).toBe(1);
    expect(r.medianNudgeToRebookDays).toBe(8); // 2026-04-10 − 2026-04-02
    expect(r.pending).toBe(0);
  });

  it('counts an organic return in total retention but NOT nudge-attributed', async () => {
    const userId = await seedDraws('rr-organic', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      { sequence: 2, status: 'completed', attribution: 'organic', completedAt: new Date('2026-04-10T00:00:00.000Z') },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.returned).toBe(1);
    expect(r.nudgeAttributedReturned).toBe(0);
    expect(r.nudgeAttributedRetentionPct).toBe(0);
    expect(r.totalRetentionPct).toBe(100);
    expect(r.secondDrawAttributionMix.organic).toBe(1);
    expect(r.medianNudgeToRebookDays).toBeNull();
  });

  it('excludes a backfilled baseline entirely (forward-only)', async () => {
    const userId = await seedDraws('rr-backfill', [
      { sequence: 1, status: 'completed', attribution: 'backfill', completedAt: BASELINE_AT },
      { sequence: 2, status: 'completed', attribution: 'nudge', completedAt: new Date('2026-04-10T00:00:00.000Z'), lastNudgedAt: new Date('2026-04-02T00:00:00.000Z') },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.baselineUsers).toBe(0);
    expect(r.resolvedDenominator).toBe(0);
    expect(r.nudgeAttributedRetentionPct).toBeNull();
    expect(r.totalRetentionPct).toBeNull();
  });

  it('counts a lapsed next-draw as a non-return (resolved, retention 0)', async () => {
    const userId = await seedDraws('rr-lapsed', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      { status: 'lapsed', scheduledFor: new Date('2026-04-01T00:00:00.000Z'), lapsedAt: new Date('2026-05-10T00:00:00.000Z') },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.baselineUsers).toBe(1);
    expect(r.returned).toBe(0);
    expect(r.nonReturned).toBe(1);
    expect(r.pending).toBe(0);
    expect(r.resolvedDenominator).toBe(1);
    expect(r.totalRetentionPct).toBe(0);
  });

  it('counts a long-overdue scheduled draw as a non-return, not pending', async () => {
    const userId = await seedDraws('rr-overdue', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      // scheduledFor 40d before NOW (> the 35d overdue threshold) → non-return.
      { status: 'scheduled', scheduledFor: addDays(NOW, -40) },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.nonReturned).toBe(1);
    expect(r.pending).toBe(0);
    expect(r.resolvedDenominator).toBe(1);
  });

  it('excludes a pending (within-window) draw from the rate', async () => {
    const userId = await seedDraws('rr-pending', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      // scheduledFor only 10d before NOW (< 35d) → still has the chance.
      { status: 'scheduled', scheduledFor: addDays(NOW, -10) },
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r.baselineUsers).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.returned).toBe(0);
    expect(r.nonReturned).toBe(0);
    expect(r.resolvedDenominator).toBe(0);
    expect(r.nudgeAttributedRetentionPct).toBeNull();
  });

  it('computes the median nudge→rebook latency across users', async () => {
    const u1 = await seedDraws('rr-lat-1', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      { sequence: 2, status: 'completed', attribution: 'nudge', completedAt: new Date('2026-04-06T00:00:00.000Z'), lastNudgedAt: new Date('2026-04-02T00:00:00.000Z') }, // 4d
    ]);
    const u2 = await seedDraws('rr-lat-2', [
      { sequence: 1, status: 'completed', attribution: 'baseline', completedAt: BASELINE_AT },
      { sequence: 2, status: 'completed', attribution: 'nudge', completedAt: new Date('2026-04-10T00:00:00.000Z'), lastNudgedAt: new Date('2026-04-02T00:00:00.000Z') }, // 8d
    ]);

    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [u1, u2] });
    expect(r.baselineUsers).toBe(2);
    expect(r.nudgeAttributedReturned).toBe(2);
    expect(r.medianNudgeToRebookDays).toBe(6); // median of [4, 8]
    expect(r.nudgeAttributedRetentionPct).toBe(100);
  });

  it('handles an empty cohort without throwing', async () => {
    const userId = await makeTestUser(prisma, 'rr-empty');
    const r = await computeRetestRetention(prisma, { now: NOW, userIds: [userId] });
    expect(r).toMatchObject({
      baselineUsers: 0,
      returned: 0,
      resolvedDenominator: 0,
      nudgeAttributedRetentionPct: null,
      totalRetentionPct: null,
      medianNudgeToRebookDays: null,
    });
  });
});

describe('formatRetestRetention', () => {
  it('renders the headline, pending/non-return split, mix, and latency', () => {
    const text = formatRetestRetention({
      baselineUsers: 5,
      returned: 3,
      nudgeAttributedReturned: 2,
      nonReturned: 1,
      pending: 1,
      resolvedDenominator: 4,
      nudgeAttributedRetentionPct: 50,
      totalRetentionPct: 75,
      secondDrawAttributionMix: { baseline: 0, nudge: 2, organic: 1, ops: 0, clinician: 0, backfill: 0 },
      medianNudgeToRebookDays: 6.5,
    });
    expect(text).toMatch(/Nudge-attributed retention: 50% \(2\/4\)/);
    expect(text).toMatch(/Total retention: 75% \(3\/4\)/);
    expect(text).toMatch(/Pending \(no chance yet, excluded\): 1/);
    expect(text).toMatch(/Non-returned \(lapsed\/overdue\): 1/);
    expect(text).toMatch(/nudge 2, organic 1/);
    expect(text).toMatch(/6\.5d/);
  });

  it('renders em-dashes for null rates (no resolved denominator)', () => {
    const text = formatRetestRetention({
      baselineUsers: 1,
      returned: 0,
      nudgeAttributedReturned: 0,
      nonReturned: 0,
      pending: 1,
      resolvedDenominator: 0,
      nudgeAttributedRetentionPct: null,
      totalRetentionPct: null,
      secondDrawAttributionMix: { baseline: 0, nudge: 0, organic: 0, ops: 0, clinician: 0, backfill: 0 },
      medianNudgeToRebookDays: null,
    });
    expect(text).toMatch(/Nudge-attributed retention: — \(0\/0\)/);
    expect(text).toMatch(/Median nudge→rebook latency: —/);
  });
});
