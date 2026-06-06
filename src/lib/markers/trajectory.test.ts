/**
 * Trajectory reader tests (Plan 2026-06-06-002 Phase B U3).
 *
 * Test-first on the data-merge correctness. Pins: biomarker-only merge,
 * wearable merge, mixed merge, date-ordering, same-day dedupe, cap.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { buildMarkerTrajectory, MAX_TRAJECTORY_POINTS } from './trajectory';

let prisma: PrismaClient;

beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

describe('buildMarkerTrajectory', () => {
  it('returns empty array for a user with no data', async () => {
    const userId = await makeTestUser(prisma, 'traj-empty');
    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts).toEqual([]);
  });

  it('returns biomarker points only (no wearable data)', async () => {
    const userId = await makeTestUser(prisma, 'traj-bio-only');
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin',
      attributes: { latestValue: 25, unit: 'μg/L', collectionDate: '2026-03-01' },
    });
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin_2', displayName: 'Ferritin',
      attributes: { value: 41, unit: 'μg/L', collectionDate: '2026-05-15' },
    });

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts).toHaveLength(2);
    expect(pts[0].value).toBe(41); // newest first
    expect(pts[1].value).toBe(25);
    expect(pts[0].timestamp).toContain('2026-05');
  });

  it('merges biomarker + wearable data, date-ordered newest first', async () => {
    const userId = await makeTestUser(prisma, 'traj-mixed');
    // Biomarker
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin',
      attributes: { latestValue: 35, unit: 'μg/L', collectionDate: '2026-04-01' },
    });
    // Wearable (same metric name)
    const dates = ['2026-05-01', '2026-05-15', '2026-06-01'];
    for (const d of dates) {
      await prisma.healthDataPoint.create({
        data: {
          userId, provider: 'manual', category: 'bloodwork',
          metric: 'ferritin', value: 40 + dates.indexOf(d) * 5, unit: 'μg/L',
          timestamp: new Date(d),
        },
      });
    }

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts.length).toBeGreaterThanOrEqual(3);
    // Newest first
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i - 1].timestamp.localeCompare(pts[i].timestamp)).toBeGreaterThanOrEqual(0);
    }
  });

  it('dedupes same-day points by (metric, date)', async () => {
    const userId = await makeTestUser(prisma, 'traj-dedupe');
    const sameDay = new Date('2026-06-01');
    // Two wearable points same day
    await prisma.healthDataPoint.createMany({
      data: [
        { userId, provider: 'manual', category: 'bloodwork', metric: 'ferritin', value: 40, unit: 'μg/L', timestamp: sameDay },
        { userId, provider: 'oura', category: 'recovery', metric: 'ferritin', value: 41, unit: 'μg/L', timestamp: sameDay },
      ],
    });

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    // Two same-day rows → one kept.
    expect(pts.length).toBeLessThanOrEqual(2);
  });

  it('respects the point cap', async () => {
    const userId = await makeTestUser(prisma, 'traj-cap');
    const points = [];
    for (let i = 0; i < MAX_TRAJECTORY_POINTS + 10; i++) {
      points.push({
        userId, provider: 'manual', category: 'bloodwork',
        metric: 'ferritin', value: 30 + i, unit: 'μg/L',
        timestamp: new Date(2026, 0, 1 + i),
      });
    }
    await prisma.healthDataPoint.createMany({ data: points });

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts.length).toBeLessThanOrEqual(MAX_TRAJECTORY_POINTS);
    // Should keep the most-recent ones.
    expect(pts[0].timestamp).toContain('2026');
  });

  it('does NOT co-plot a wearable point whose unit conflicts with the lab unit (#4)', async () => {
    const userId = await makeTestUser(prisma, 'traj-unitmismatch');
    // Lab marker in μg/L.
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin',
      attributes: { latestValue: 25, unit: 'μg/L', collectionDate: '2026-03-01' },
    });
    // Wearable row, same metric name, INCOMPATIBLE unit (ng/dL) — must be dropped.
    await prisma.healthDataPoint.create({
      data: {
        userId, provider: 'manual', category: 'bloodwork',
        metric: 'ferritin', value: 9999, unit: 'ng/dL', timestamp: new Date('2026-05-01'),
      },
    });

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    // Only the lab point survives; the mismatched-unit wearable point is dropped.
    expect(pts.map((p) => p.value)).not.toContain(9999);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBe(25);
  });

  it('excludes recovery-category wearable points from a lab marker merge (#4)', async () => {
    const userId = await makeTestUser(prisma, 'traj-recovery');
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'hrv', displayName: 'HRV',
      attributes: { latestValue: 45, unit: 'ms', collectionDate: '2026-03-01' },
    });
    // recovery-category composite score — never lab-equivalent, must be excluded.
    await prisma.healthDataPoint.create({
      data: {
        userId, provider: 'whoop', category: 'recovery',
        metric: 'HRV', value: 88, unit: '', timestamp: new Date('2026-05-01'),
      },
    });

    const pts = await buildMarkerTrajectory(prisma, userId, 'HRV');
    expect(pts.map((p) => p.value)).not.toContain(88);
    expect(pts).toHaveLength(1);
  });

  it('returns 1 point when only 1 biomarker node exists', async () => {
    const userId = await makeTestUser(prisma, 'traj-one');
    await addNode(prisma, userId, {
      type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin',
      attributes: { latestValue: 12, unit: 'μg/L', collectionDate: '2026-02-01' },
    });

    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBe(12);
  });
});
