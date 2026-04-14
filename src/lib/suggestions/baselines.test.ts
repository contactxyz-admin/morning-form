import { describe, expect, it } from 'vitest';
import { computeBaselines, type BaselineInputPoint } from './baselines';

function point(metric: string, value: number, daysAgo: number): BaselineInputPoint {
  const ts = new Date();
  ts.setUTCDate(ts.getUTCDate() - daysAgo);
  return { metric, value, timestamp: ts.toISOString() };
}

describe('computeBaselines', () => {
  it('returns null for metrics with fewer than 7 days of data', () => {
    const points = [
      point('hrv', 60, 0),
      point('hrv', 65, 1),
      point('hrv', 70, 2),
    ];
    const baselines = computeBaselines(points);
    expect(baselines.hrv?.median7).toBeNull();
    expect(baselines.hrv?.median30).toBeNull();
  });

  it('computes the 7-day median over the last 7 days only', () => {
    const points = [
      point('hrv', 100, 0),
      point('hrv', 90, 1),
      point('hrv', 80, 2),
      point('hrv', 70, 3),
      point('hrv', 60, 4),
      point('hrv', 50, 5),
      point('hrv', 40, 6),
      point('hrv', 1, 20), // outside 7-day window, inside 30-day
    ];
    const baselines = computeBaselines(points);
    // sorted last-7: [40,50,60,70,80,90,100], median = 70
    expect(baselines.hrv?.median7).toBe(70);
  });

  it('computes 30-day median once 30 days of data are present', () => {
    const points: BaselineInputPoint[] = [];
    for (let i = 0; i < 30; i++) points.push(point('hrv', i + 1, i));
    const baselines = computeBaselines(points);
    // values 1..30, median = 15.5
    expect(baselines.hrv?.median30).toBe(15.5);
  });

  it('uses one reading per UTC day (most recent)', () => {
    // Two same-day readings: only the latest counts toward the daily series.
    const ts1 = new Date();
    ts1.setUTCHours(2, 0, 0, 0);
    const ts2 = new Date();
    ts2.setUTCHours(20, 0, 0, 0);
    const points: BaselineInputPoint[] = [
      { metric: 'hrv', value: 10, timestamp: ts1.toISOString() },
      { metric: 'hrv', value: 99, timestamp: ts2.toISOString() },
    ];
    for (let i = 1; i < 7; i++) points.push(point('hrv', 50, i));
    const baselines = computeBaselines(points);
    // Last-7 sorted: [50,50,50,50,50,50,99], median = 50
    expect(baselines.hrv?.median7).toBe(50);
  });

  it('partitions baselines per metric independently', () => {
    const points: BaselineInputPoint[] = [];
    for (let i = 0; i < 7; i++) {
      points.push(point('hrv', 70, i));
      points.push(point('resting_hr', 60, i));
    }
    const baselines = computeBaselines(points);
    expect(baselines.hrv?.median7).toBe(70);
    expect(baselines.resting_hr?.median7).toBe(60);
  });
});
