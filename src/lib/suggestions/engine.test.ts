import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ensureTodaysSuggestions } from './engine';

const TEST_EMAIL = 'engine-test@morningform.test';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(daysAgo: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

async function cleanup(userId: string) {
  await prisma.dailySuggestion.deleteMany({ where: { userId } });
  await prisma.healthDataPoint.deleteMany({ where: { userId } });
  const protocol = await prisma.protocol.findUnique({ where: { userId } });
  if (protocol) {
    await prisma.protocolAdjustment.deleteMany({ where: { protocolId: protocol.id } });
    await prisma.protocolItem.deleteMany({ where: { protocolId: protocol.id } });
    await prisma.protocol.delete({ where: { id: protocol.id } });
  }
}

async function makeUser() {
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL },
  });
  await cleanup(user.id);
  return user;
}

async function seedHrvDecline(userId: string) {
  // 7 prior days at HRV ~75, today at 55 (~27% drop)
  const points = [];
  for (let i = 1; i <= 7; i++) {
    points.push({
      userId,
      provider: 'whoop',
      category: 'recovery',
      metric: 'hrv',
      value: 75,
      unit: 'ms',
      timestamp: dayOffset(i),
    });
  }
  points.push({
    userId,
    provider: 'whoop',
    category: 'recovery',
    metric: 'hrv',
    value: 55,
    unit: 'ms',
    timestamp: dayOffset(0),
  });
  await prisma.healthDataPoint.createMany({ data: points });
}

describe('ensureTodaysSuggestions', () => {
  let userId: string;

  beforeEach(async () => {
    const user = await makeUser();
    userId = user.id;
  });

  afterEach(async () => {
    await cleanup(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it('generates suggestions for declining HRV and is idempotent on re-run', async () => {
    await seedHrvDecline(userId);
    const today = todayUtc();

    const first = await ensureTodaysSuggestions(userId, today);
    expect(first.find((s) => s.kind === 'hrv_deload')).toBeDefined();

    const second = await ensureTodaysSuggestions(userId, today);
    expect(second.length).toBe(first.length);

    const dbCount = await prisma.dailySuggestion.count({
      where: { userId, date: today, kind: 'hrv_deload' },
    });
    expect(dbCount).toBe(1);
  });

  it('does not regenerate a suggestion the user already dismissed today', async () => {
    await seedHrvDecline(userId);
    const today = todayUtc();

    await ensureTodaysSuggestions(userId, today);
    await prisma.dailySuggestion.updateMany({
      where: { userId, date: today, kind: 'hrv_deload' },
      data: { status: 'dismissed' },
    });

    await ensureTodaysSuggestions(userId, today);
    const rows = await prisma.dailySuggestion.findMany({
      where: { userId, date: today, kind: 'hrv_deload' },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('dismissed');
  });

  it('skips baseline-dependent rules when there is insufficient history but still fires absolute rules', async () => {
    // Only today's data; no baseline can be computed.
    await prisma.healthDataPoint.create({
      data: {
        userId,
        provider: 'whoop',
        category: 'sleep',
        metric: 'duration',
        value: 4.5,
        unit: 'hours',
        timestamp: dayOffset(0),
      },
    });
    const today = todayUtc();
    const results = await ensureTodaysSuggestions(userId, today);
    expect(results.find((s) => s.kind === 'short_sleep')).toBeDefined();
    expect(results.find((s) => s.kind === 'hrv_deload')).toBeUndefined();
  });

  it('suppresses magnesium_pm when the user already has magnesium in their protocol', async () => {
    // Three nights of low deep sleep
    await prisma.healthDataPoint.createMany({
      data: [0, 1, 2].map((daysAgo) => ({
        userId,
        provider: 'whoop',
        category: 'sleep',
        metric: 'deep_sleep',
        value: 0.6,
        unit: 'hours',
        timestamp: dayOffset(daysAgo),
      })),
    });
    const protocol = await prisma.protocol.create({
      data: {
        userId,
        rationale: 'test',
        items: {
          create: {
            timeSlot: 'evening',
            timeLabel: 'PM',
            compounds: 'Magnesium glycinate 200mg',
            dosage: '200mg',
            timingCue: 'before bed',
            mechanism: 'sleep support',
          },
        },
      },
    });
    expect(protocol).toBeDefined();

    const today = todayUtc();
    const results = await ensureTodaysSuggestions(userId, today);
    expect(results.find((s) => s.kind === 'magnesium_pm')).toBeUndefined();
  });
});
