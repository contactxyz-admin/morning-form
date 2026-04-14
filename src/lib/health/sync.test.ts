import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthDataPoint } from '@/types';
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
