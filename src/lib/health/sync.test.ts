import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthDataPoint } from '@/types';

// Spy on the raw-payload capture module so we can verify the sync.ts wiring
// without touching Prisma. The real implementation is a no-op in test mode
// anyway, so swapping it out is safe for the characterization tests below.
const captureSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('./raw-payload', () => ({
  captureRawPayload: (...args: unknown[]) => captureSpy(...args),
}));

import { HealthSyncService } from './sync';

/**
 * Characterization test for HealthSyncService.syncProvider.
 *
 * Locks the canonical metric names + units + categories the suggestions engine
 * reads (see src/lib/suggestions/rules.ts). The Unit 1 refactor moves the
 * inline {category, metric, unit} literals into a canonical registry +
 * pointFromCanonical helper. These assertions must keep passing through that
 * refactor — if a metric gets renamed (`duration` → `sleep_duration`) the
 * rule engine silently stops firing, so we lock the contract here.
 *
 * Provider clients (Whoop, Oura) are in mock mode (no env vars), so
 * getRecovery/getSleep/getReadiness return deterministic payloads.
 */

const FROZEN_NOW = '2026-04-14T12:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FROZEN_NOW));
  captureSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function pointBy(points: HealthDataPoint[], metric: string): HealthDataPoint | undefined {
  return points.find((p) => p.metric === metric);
}

describe('HealthSyncService.syncProvider — Whoop characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('whoop', '2026-04-13', '2026-04-14');
  });

  it('emits exactly the canonical Whoop metric set', () => {
    const metrics = points.map((p) => p.metric).sort();
    expect(metrics).toEqual(
      ['deep_sleep', 'duration', 'efficiency', 'hrv', 'recovery_score', 'rem_sleep', 'resting_hr'].sort()
    );
  });

  it('every point carries provider=whoop', () => {
    expect(points.every((p) => p.provider === 'whoop')).toBe(true);
  });

  it('hrv is in ms under recovery (rule contract)', () => {
    const hrv = pointBy(points, 'hrv');
    expect(hrv).toMatchObject({ category: 'recovery', metric: 'hrv', unit: 'ms', value: 68 });
  });

  it('resting_hr is in bpm under heart (rule contract)', () => {
    expect(pointBy(points, 'resting_hr')).toMatchObject({
      category: 'heart',
      metric: 'resting_hr',
      unit: 'bpm',
      value: 52,
    });
  });

  it('duration is in hours under sleep (Whoop returns ms — contract converts)', () => {
    // Whoop mock total_in_bed_time_milli = 27_000_000 → 7.5h
    expect(pointBy(points, 'duration')).toMatchObject({
      category: 'sleep',
      metric: 'duration',
      unit: 'hours',
      value: 7.5,
    });
  });

  it('deep_sleep is in hours under sleep (rule contract)', () => {
    // Whoop mock total_slow_wave_sleep_time_milli = 5_400_000 → 1.5h
    expect(pointBy(points, 'deep_sleep')).toMatchObject({
      category: 'sleep',
      metric: 'deep_sleep',
      unit: 'hours',
      value: 1.5,
    });
  });

  it('rem_sleep, efficiency, recovery_score keep their existing units', () => {
    expect(pointBy(points, 'rem_sleep')).toMatchObject({ category: 'sleep', unit: 'hours' });
    expect(pointBy(points, 'efficiency')).toMatchObject({ category: 'sleep', unit: '%' });
    expect(pointBy(points, 'recovery_score')).toMatchObject({ category: 'recovery', unit: '%' });
  });
});

describe('HealthSyncService.syncProvider — Oura characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('oura', '2026-04-13', '2026-04-14');
  });

  it('emits exactly the canonical Oura metric set', () => {
    const metrics = points.map((p) => p.metric).sort();
    expect(metrics).toEqual(
      ['duration', 'efficiency', 'hrv', 'readiness_score', 'temperature_delta'].sort()
    );
  });

  it('every point carries provider=oura', () => {
    expect(points.every((p) => p.provider === 'oura')).toBe(true);
  });

  it('hrv is in ms under recovery (Oura → same canonical name as Whoop)', () => {
    expect(pointBy(points, 'hrv')).toMatchObject({
      category: 'recovery',
      metric: 'hrv',
      unit: 'ms',
      value: 72,
    });
  });

  it('duration is in hours under sleep (Oura returns seconds — contract converts)', () => {
    // Oura mock total_sleep_duration = 25200s → 7h
    expect(pointBy(points, 'duration')).toMatchObject({
      category: 'sleep',
      metric: 'duration',
      unit: 'hours',
      value: 7,
    });
  });

  it('temperature_delta is body category in °C', () => {
    expect(pointBy(points, 'temperature_delta')).toMatchObject({
      category: 'body',
      metric: 'temperature_delta',
      unit: '°C',
      value: -0.1,
    });
  });

  it('readiness_score uses the frozen "now" timestamp', () => {
    const r = pointBy(points, 'readiness_score');
    expect(r).toMatchObject({
      category: 'recovery',
      metric: 'readiness_score',
      unit: 'score',
      value: 82,
      timestamp: FROZEN_NOW,
    });
  });
});

describe('HealthSyncService.syncProvider — Fitbit characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('fitbit', '2026-04-13', '2026-04-14');
  });

  it('emits exactly the canonical Fitbit metric set', () => {
    const metrics = points.map((p) => p.metric).sort();
    expect(metrics).toEqual(
      [
        'active_minutes',
        'avg_hr',
        'calories',
        'deep_sleep',
        'duration',
        'efficiency',
        'max_hr',
        'rem_sleep',
        'resting_hr',
        'steps',
      ].sort(),
    );
  });

  it('every point carries provider=fitbit', () => {
    expect(points.every((p) => p.provider === 'fitbit')).toBe(true);
  });

  it('duration is in hours under sleep (Fitbit returns minutes — contract converts)', () => {
    // Fitbit mock minutesAsleep = 420 → 7h
    expect(pointBy(points, 'duration')).toMatchObject({
      category: 'sleep',
      metric: 'duration',
      unit: 'hours',
      value: 7,
    });
  });

  it('deep_sleep is in hours under sleep', () => {
    // 90min → 1.5h
    expect(pointBy(points, 'deep_sleep')).toMatchObject({
      category: 'sleep',
      unit: 'hours',
      value: 1.5,
    });
  });

  it('rem_sleep is in hours under sleep', () => {
    // 105min → 1.75h
    expect(pointBy(points, 'rem_sleep')).toMatchObject({
      category: 'sleep',
      unit: 'hours',
      value: 1.75,
    });
  });

  it('activity metrics keep their canonical units', () => {
    expect(pointBy(points, 'steps')).toMatchObject({ category: 'activity', unit: 'steps', value: 8430 });
    expect(pointBy(points, 'calories')).toMatchObject({
      category: 'activity',
      unit: 'kcal',
      value: 2180,
    });
    expect(pointBy(points, 'active_minutes')).toMatchObject({
      category: 'activity',
      unit: 'minutes',
      value: 47,
    });
  });

  it('heart-rate metrics are bpm under heart', () => {
    expect(pointBy(points, 'resting_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 53 });
    expect(pointBy(points, 'avg_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 74 });
    expect(pointBy(points, 'max_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 166 });
  });
});

describe('HealthSyncService.syncProvider — google_fit characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('google_fit', '2026-04-13', '2026-04-14');
  });

  it('emits exactly the canonical google_fit metric set', () => {
    const metrics = points.map((p) => p.metric).sort();
    expect(metrics).toEqual(['avg_hr', 'duration', 'max_hr', 'resting_hr', 'steps'].sort());
  });

  it('every point carries provider=google_fit', () => {
    expect(points.every((p) => p.provider === 'google_fit')).toBe(true);
  });

  it('steps is a single point with the mock total', () => {
    expect(pointBy(points, 'steps')).toMatchObject({
      category: 'activity',
      unit: 'steps',
      value: 8430,
      timestamp: FROZEN_NOW,
    });
  });

  it('duration is in hours under sleep (mock minutes → hours)', () => {
    // 435min → 7.25h
    expect(pointBy(points, 'duration')).toMatchObject({
      category: 'sleep',
      unit: 'hours',
      value: 7.25,
    });
  });

  it('heart-rate min maps to resting_hr (canonical contract)', () => {
    expect(pointBy(points, 'resting_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 48 });
    expect(pointBy(points, 'avg_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 72 });
    expect(pointBy(points, 'max_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 168 });
  });
});

describe('HealthSyncService.syncProvider — apple_health (via Terra) characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('apple_health', '2026-04-13', '2026-04-14');
  });

  it('emits exactly the canonical Terra-daily metric set', () => {
    const metrics = points.map((p) => p.metric).sort();
    expect(metrics).toEqual(['hrv', 'recovery_score', 'resting_hr', 'steps'].sort());
  });

  it('every point carries provider=apple_health (Terra fan-out preserves caller provider)', () => {
    expect(points.every((p) => p.provider === 'apple_health')).toBe(true);
  });

  it('timestamp is noon on the daily date', () => {
    expect(points.every((p) => p.timestamp === '2026-04-13T12:00:00Z')).toBe(true);
  });

  it('canonical units survive the Terra → canonical mapping', () => {
    expect(pointBy(points, 'steps')).toMatchObject({ category: 'activity', unit: 'steps', value: 8430 });
    expect(pointBy(points, 'resting_hr')).toMatchObject({ category: 'heart', unit: 'bpm', value: 52 });
    expect(pointBy(points, 'hrv')).toMatchObject({ category: 'recovery', unit: 'ms', value: 68 });
    expect(pointBy(points, 'recovery_score')).toMatchObject({
      category: 'recovery',
      unit: '%',
      value: 74,
    });
  });
});

describe('HealthSyncService.syncProvider — raw-payload capture wiring', () => {
  it('skips capture when no userId is provided (anonymous/bare sync)', async () => {
    const sync = new HealthSyncService();
    await sync.syncProvider('whoop', '2026-04-13', '2026-04-14');
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('captures once per provider.getX() call when userId is plumbed through', async () => {
    const sync = new HealthSyncService();
    // Whoop has two provider calls: getRecovery + getSleep.
    await sync.syncProvider('whoop', '2026-04-13', '2026-04-14', {
      userId: 'u1',
      traceId: 'trace-xyz',
    });
    expect(captureSpy).toHaveBeenCalledTimes(2);

    const methods = captureSpy.mock.calls.map((c) => (c[0] as { payload: { method: string } }).payload.method);
    expect(methods.sort()).toEqual(['getRecovery', 'getSleep']);

    // Shape check: userId, provider, source, traceId, and payload envelope all wired.
    const first = captureSpy.mock.calls[0][0] as {
      userId: string;
      provider: string;
      source: string;
      traceId?: string;
      payload: { method: string; startDate: string; endDate: string; data: unknown };
    };
    expect(first).toMatchObject({
      userId: 'u1',
      provider: 'whoop',
      source: 'pull',
      traceId: 'trace-xyz',
    });
    expect(first.payload).toMatchObject({ startDate: '2026-04-13', endDate: '2026-04-14' });
    expect(first.payload.data).toBeDefined();
  });

  it('captures once per provider call across all provider branches', async () => {
    const sync = new HealthSyncService();
    const cases: Array<[Parameters<HealthSyncService['syncProvider']>[0], number]> = [
      ['whoop', 2], // getRecovery + getSleep
      ['oura', 2], // getSleep + getReadiness
      ['fitbit', 3], // getSleep + getActivity + getHeartRate
      ['google_fit', 3], // getSteps + getSleep + getHeartRate
      ['apple_health', 1], // Terra getDaily
    ];
    for (const [provider, expectedCalls] of cases) {
      captureSpy.mockClear();
      await sync.syncProvider(provider, '2026-04-13', '2026-04-14', { userId: 'u1' });
      expect(captureSpy, `${provider} capture count`).toHaveBeenCalledTimes(expectedCalls);
      for (const call of captureSpy.mock.calls) {
        expect((call[0] as { provider: string }).provider).toBe(provider);
      }
    }
  });
});
