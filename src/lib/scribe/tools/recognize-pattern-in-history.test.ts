import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import {
  PATTERN_ROW_SAFETY_THRESHOLD,
  recognizePatternInHistoryHandler,
} from './recognize-pattern-in-history';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function seedHrv(userId: string, values: number[], offsetDays: number[]) {
  const now = Date.now();
  for (let i = 0; i < values.length; i++) {
    await prisma.healthDataPoint.create({
      data: {
        userId,
        provider: 'terra',
        category: 'recovery',
        metric: 'hrv',
        value: values[i],
        unit: 'ms',
        timestamp: new Date(now - offsetDays[i] * 24 * 60 * 60 * 1000),
      },
    });
  }
}

describe('recognize_pattern_in_history handler', () => {
  it('summarises a multi-metric series for the owner', async () => {
    const userId = await makeTestUser(prisma, 'pattern-happy');
    await seedHrv(userId, [40, 42, 38, 44, 36, 39], [29, 25, 20, 15, 7, 1]);

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 30,
    });

    expect(result.status).toBe('ok');
    expect(result.windowDays).toBe(30);
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].count).toBe(6);
    expect(result.metrics[0].first?.value).toBe(40);
    expect(result.metrics[0].last?.value).toBe(39);
    expect(result.metrics[0].average).toBeCloseTo(39.83, 1);
  });

  it('returns too-little-data when fewer than 3 matching data points', async () => {
    const userId = await makeTestUser(prisma, 'pattern-too-little');
    await seedHrv(userId, [40, 42], [10, 5]);

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 30,
    });
    expect(result.status).toBe('too-little-data');
    expect(result.metrics).toEqual([]);
  });

  it('bails with too-much-data when combined row count exceeds the safety threshold', async () => {
    const userId = await makeTestUser(prisma, 'pattern-too-much');
    // Create synthetic data points crossing the threshold — use small batches
    // so prisma doesn't choke, but we only need *count* to exceed threshold.
    const batch = PATTERN_ROW_SAFETY_THRESHOLD + 5;
    const now = Date.now();
    const rows = Array.from({ length: batch }, (_, i) => ({
      userId,
      provider: 'terra',
      category: 'recovery',
      metric: 'hrv',
      value: 40 + (i % 10),
      unit: 'ms',
      timestamp: new Date(now - (i % 30) * 24 * 60 * 60 * 1000),
    }));
    await prisma.healthDataPoint.createMany({ data: rows });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 90,
    });
    expect(result.status).toBe('too-much-data');
    expect(result.metrics).toEqual([]);
  }, 30_000);

  it('topic-scope gate: returns too-little-data when no metric matches the topic\'s patterns', async () => {
    // Regression (D10): the Sleep/Recovery scribe must not probe ferritin
    // data even if it exists on the graph. The topic scope filters out
    // off-topic metrics BEFORE any DB query runs — we seed a ferritin
    // healthDataPoint and assert the handler reports too-little-data.
    const userId = await makeTestUser(prisma, 'pattern-topic-scope');
    const now = Date.now();
    await prisma.healthDataPoint.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        userId,
        provider: 'manual',
        category: 'bloodwork',
        metric: 'ferritin',
        value: 12 + i,
        unit: 'ug/L',
        timestamp: new Date(now - i * 24 * 60 * 60 * 1000),
      })),
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['ferritin'],
      windowDays: 30,
    });
    expect(result.status).toBe('too-little-data');
    expect(result.metrics).toEqual([]);
    expect(result.checkInCount).toBe(0);
  });

  it('topic-scope gate: filters mixed on/off-topic metrics down to the on-topic ones', async () => {
    // Mixed request: 'hrv' is on-topic for sleep-recovery, 'ferritin' is not.
    // The handler should query only 'hrv' data. We seed both, and assert the
    // result contains only 'hrv' series.
    const userId = await makeTestUser(prisma, 'pattern-mixed-metrics');
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await prisma.healthDataPoint.create({
        data: {
          userId,
          provider: 'terra',
          category: 'recovery',
          metric: 'hrv',
          value: 40 + i,
          unit: 'ms',
          timestamp: new Date(now - i * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.healthDataPoint.create({
        data: {
          userId,
          provider: 'manual',
          category: 'bloodwork',
          metric: 'ferritin',
          value: 12 + i,
          unit: 'ug/L',
          timestamp: new Date(now - i * 24 * 60 * 60 * 1000),
        },
      });
    }

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv', 'ferritin'],
      windowDays: 30,
    });
    expect(result.status).toBe('ok');
    expect(result.metrics.map((m) => m.metric)).toEqual(['hrv']);
    expect(result.metrics[0].count).toBe(5);
  });

  it('topic-scope gate: returns too-little-data when topicKey is unknown', async () => {
    const userId = await makeTestUser(prisma, 'pattern-unknown-topic');
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'nonsense-topic', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 30,
    });
    expect(result.status).toBe('too-little-data');
  });

  it('cannot see another user\'s data points', async () => {
    const userA = await makeTestUser(prisma, 'pattern-userA');
    const userB = await makeTestUser(prisma, 'pattern-userB');
    await seedHrv(userA, [40, 42, 38, 44], [10, 7, 5, 1]);

    const ctx: ToolContext = { db: prisma, userId: userB, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 30,
    });
    expect(result.status).toBe('too-little-data');
  });
});
