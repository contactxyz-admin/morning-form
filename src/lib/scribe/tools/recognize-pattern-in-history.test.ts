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

/**
 * Seed a real lab trajectory as graph nodes (a biomarker concept + dated
 * `observation` instances linked via INSTANCE_OF) — the shape a real lab upload
 * produces. Deliberately NO HealthDataPoint rows, so this history is invisible
 * to the wearable-only path.
 */
async function seedLabTrajectory(
  userId: string,
  displayName: string,
  points: { value: number; unit: string; daysAgo: number }[],
) {
  const concept = await prisma.graphNode.create({
    data: {
      userId,
      type: 'biomarker',
      canonicalKey: displayName.toLowerCase(),
      displayName,
      attributes: JSON.stringify({ unit: points[0]?.unit ?? '' }),
    },
  });
  const now = Date.now();
  for (const p of points) {
    const obs = await prisma.graphNode.create({
      data: {
        userId,
        type: 'observation',
        canonicalKey: `obs_${displayName.toLowerCase()}_${p.daysAgo}`,
        displayName,
        attributes: JSON.stringify({
          value: p.value,
          unit: p.unit,
          measuredAt: new Date(now - p.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        }),
      },
    });
    await prisma.graphEdge.create({
      data: { userId, type: 'INSTANCE_OF', fromNodeId: obs.id, toNodeId: concept.id },
    });
  }
}

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

  it('caps the series at 24 most-recent points (most-recent-first) given 30 points', async () => {
    const userId = await makeTestUser(prisma, 'pattern-series-cap');
    // 30 points, one per day; value === day-offset so we can identify them.
    const values = Array.from({ length: 30 }, (_, i) => 100 + i);
    const offsets = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30 days ago
    await seedHrv(userId, values, offsets);

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['hrv'],
      windowDays: 60,
    });

    expect(result.status).toBe('ok');
    expect(result.series).toHaveLength(24);
    // Most-recent-first: index 0 was seeded at offset 1 day ago with value 100,
    // the freshest point.
    expect(result.series[0].value).toBe(100);
    // Strictly descending timestamps confirm most-recent-first ordering.
    for (let i = 1; i < result.series.length; i++) {
      expect(
        new Date(result.series[i - 1].timestamp).getTime(),
      ).toBeGreaterThanOrEqual(new Date(result.series[i].timestamp).getTime());
    }
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
    // Non-ok status → empty series.
    expect(result.series).toEqual([]);
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
    // Cross-domain grant (Plan 2026-06-05-001 U6a): ferritin is now reachable
    // from sleep-recovery topics so the scribe can correlate sleep with iron.
    expect(result.status).toBe('ok');
    expect(result.metrics.length).toBe(1);
    expect(result.metrics[0].metric).toBe('ferritin');
  });

  it('topic-scope gate: cross-domain grants allow ferritin from sleep-recovery topic', async () => {
    // Both 'hrv' and 'ferritin' are now on-topic for sleep-recovery via
    // the cross-domain grants. The handler should query both and return
    // both metric series.
    const userId = await makeTestUser(prisma, 'pattern-cross-domain');
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
    // Both metrics pass the cross-domain grant.
    const metricNames = result.metrics.map((m) => m.metric).sort();
    expect(metricNames).toEqual(['ferritin', 'hrv']);
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

  it('LONGITUDINAL ON: surfaces a real lab trajectory from graph nodes (P1 — scribe sees bloods)', async () => {
    const prev = process.env.LONGITUDINAL_GRAPH_ENABLED;
    process.env.LONGITUDINAL_GRAPH_ENABLED = 'true';
    try {
      const userId = await makeTestUser(prisma, 'pattern-lab-traj');
      // Three quarterly draws as graph observation nodes — NO HealthDataPoint rows.
      await seedLabTrajectory(userId, 'Ferritin', [
        { value: 25, unit: 'ug/L', daysAgo: 200 },
        { value: 41, unit: 'ug/L', daysAgo: 120 },
        { value: 62, unit: 'ug/L', daysAgo: 20 },
      ]);

      const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
      const result = await recognizePatternInHistoryHandler.execute(ctx, {
        metrics: ['ferritin'],
        windowDays: 30, // labs are not time-windowed — all 3 draws still surface
      });

      expect(result.status).toBe('ok');
      const ferritin = result.metrics.find((m) => m.metric === 'ferritin');
      expect(ferritin?.count).toBe(3);
      expect(ferritin?.first?.value).toBe(25); // oldest
      expect(ferritin?.last?.value).toBe(62); // newest
      expect(result.series).toHaveLength(3);
    } finally {
      if (prev === undefined) delete process.env.LONGITUDINAL_GRAPH_ENABLED;
      else process.env.LONGITUDINAL_GRAPH_ENABLED = prev;
    }
  });

  it('LONGITUDINAL OFF: graph-only lab history stays invisible (wearable-only path unchanged)', async () => {
    const userId = await makeTestUser(prisma, 'pattern-lab-off');
    await seedLabTrajectory(userId, 'Ferritin', [
      { value: 25, unit: 'ug/L', daysAgo: 20 },
      { value: 41, unit: 'ug/L', daysAgo: 10 },
      { value: 62, unit: 'ug/L', daysAgo: 2 },
    ]);

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'sleep-recovery', requestId: 'test-req-id' };
    const result = await recognizePatternInHistoryHandler.execute(ctx, {
      metrics: ['ferritin'],
      windowDays: 30,
    });
    // Flag off → reads HealthDataPoint only → graph labs invisible (the pre-P1 gap).
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
