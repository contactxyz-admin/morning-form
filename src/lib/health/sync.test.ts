import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthDataPoint } from '@/types';

// Spy on the raw-payload capture module so we can verify the sync.ts wiring
// without touching Prisma. The real implementation is a no-op in test mode
// anyway, so swapping it out is safe for the characterization tests below.
const captureSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('./raw-payload', () => ({
  captureRawPayload: (...args: unknown[]) => captureSpy(...args),
}));

const healthConnectionUpdateMock = vi.fn().mockResolvedValue({});
const healthDataPointCreateManyMock = vi.fn().mockResolvedValue({ count: 0 });
const healthDataPointDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
const transactionMock = vi.fn(async (callback: (tx: {
  healthConnection: { update: typeof healthConnectionUpdateMock };
  healthDataPoint: {
    createMany: typeof healthDataPointCreateManyMock;
    deleteMany: typeof healthDataPointDeleteManyMock;
  };
}) => unknown) => callback({
  healthConnection: {
    update: healthConnectionUpdateMock,
  },
  healthDataPoint: {
    createMany: healthDataPointCreateManyMock,
    deleteMany: healthDataPointDeleteManyMock,
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => transactionMock(callback),
    healthConnection: {
      update: (args: unknown) => healthConnectionUpdateMock(args),
    },
    healthDataPoint: {
      createMany: (args: unknown) => healthDataPointCreateManyMock(args),
      deleteMany: (args: unknown) => healthDataPointDeleteManyMock(args),
    },
  },
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
  healthConnectionUpdateMock.mockClear();
  healthDataPointCreateManyMock.mockClear();
  healthDataPointDeleteManyMock.mockClear();
  transactionMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function pointBy(points: HealthDataPoint[], metric: string): HealthDataPoint | undefined {
  return points.find((p) => p.metric === metric);
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
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

describe('HealthSyncService.syncProvider — Garmin via Terra real path', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.TERRA_API_KEY;
  const originalDevId = process.env.TERRA_DEV_ID;

  const dailyPayload = {
    data: [{
      date: '2026-06-01',
      steps: 10000,
      calories: 2200,
      active_minutes: 55,
      resting_hr: 51,
      avg_hrv: 70,
      stress_level: 32,
      recovery_score: 80,
    }],
  };
  const sleepPayload = {
    data: [{
      start_time: '2026-06-01T22:30:00Z',
      end_time: '2026-06-02T06:30:00Z',
      duration_seconds: 28800,
      sleep_efficiency: 92,
      deep_sleep_seconds: 5400,
      rem_sleep_seconds: 7200,
      light_sleep_seconds: 14400,
      avg_hr: 54,
      avg_hrv: 65,
      respiratory_rate: 14,
    }],
  };
  const activityPayload = {
    data: [{
      start_time: '2026-06-01T07:00:00Z',
      end_time: '2026-06-01T08:00:00Z',
      steps: 8000,
      calories: 500,
      active_duration_seconds: 3600,
      avg_hr: 140,
      max_hr: 175,
    }],
  };

  beforeEach(() => {
    process.env.TERRA_API_KEY = 'terra-key';
    process.env.TERRA_DEV_ID = 'terra-dev';
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string | URL) => {
      const path = new URL(url.toString()).pathname;
      if (path.endsWith('/daily')) return jsonResponse(dailyPayload);
      if (path.endsWith('/sleep')) return jsonResponse(sleepPayload);
      if (path.endsWith('/activity')) return jsonResponse(activityPayload);
      return new Response('', { status: 404 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TERRA_API_KEY;
    else process.env.TERRA_API_KEY = originalApiKey;
    if (originalDevId === undefined) delete process.env.TERRA_DEV_ID;
    else process.env.TERRA_DEV_ID = originalDevId;
  });

  function garminConnection(overrides: Record<string, unknown> = {}) {
    return {
      id: 'conn-garmin-1',
      userId: 'u1',
      provider: 'garmin',
      status: 'connected',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      terraUserId: 'terra-user-1',
      metadata: null,
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('pulls daily, sleep, and activity data with the stored Terra user id', async () => {
    const sync = new HealthSyncService();
    const points = await sync.syncProvider('garmin', '2026-06-01', '2026-06-02', {
      userId: 'u1',
      connection: garminConnection() as never,
      traceId: 'trace-garmin',
    });

    const urls = fetchMock.mock.calls.map((call) => new URL(call[0].toString()));
    expect(urls.map((url) => url.pathname).sort()).toEqual([
      '/v2/activity',
      '/v2/daily',
      '/v2/sleep',
    ]);
    for (const url of urls) {
      expect(url.searchParams.get('user_id')).toBe('terra-user-1');
      expect(url.searchParams.get('start_date')).toBe('2026-06-01');
      expect(url.searchParams.get('end_date')).toBe('2026-06-02');
      expect(url.searchParams.get('to_webhook')).toBe('false');
    }

    const metrics = points.map((point) => point.metric).sort();
    expect(metrics).toEqual([
      'active_minutes',
      'avg_hr',
      'calories',
      'deep_sleep',
      'duration',
      'efficiency',
      'hrv',
      'light_sleep',
      'max_hr',
      'recovery_score',
      'rem_sleep',
      'respiratory_rate',
      'resting_hr',
      'steps',
      'steps',
    ].sort());
    expect(pointBy(points, 'duration')).toMatchObject({ value: 8, unit: 'hours', provider: 'garmin' });
    expect(pointBy(points, 'deep_sleep')).toMatchObject({ value: 1.5, unit: 'hours' });
    expect(pointBy(points, 'rem_sleep')).toMatchObject({ value: 2, unit: 'hours' });
    expect(pointBy(points, 'avg_hr')).toMatchObject({ value: 140, unit: 'bpm' });
    expect(pointBy(points, 'max_hr')).toMatchObject({ value: 175, unit: 'bpm' });
  });

  it('captures every Terra pull response with raw payload context', async () => {
    const sync = new HealthSyncService();
    await sync.syncProvider('garmin', '2026-06-01', '2026-06-02', {
      userId: 'u1',
      connection: garminConnection() as never,
      traceId: 'trace-garmin',
    });

    expect(captureSpy).toHaveBeenCalledTimes(3);
    const dailyCapture = captureSpy.mock.calls.find((call) =>
      (call[0] as { payload: { method: string } }).payload.method === 'getDaily',
    )?.[0] as { provider: string; source: string; traceId: string; payload: { data: Array<{ raw?: unknown }> } };
    expect(dailyCapture).toMatchObject({
      provider: 'garmin',
      source: 'pull',
      traceId: 'trace-garmin',
    });
    expect(dailyCapture.payload.data[0].raw).toEqual(dailyPayload.data[0]);
  });

  it('marks Garmin sync as error instead of falling back to mock when terraUserId is missing', async () => {
    const sync = new HealthSyncService();
    const result = await sync.syncConnection(
      garminConnection({ terraUserId: null }) as never,
      'u1',
      '2026-06-01',
      '2026-06-02',
    );

    expect(result).toMatchObject({ provider: 'garmin', ok: false, count: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(healthDataPointCreateManyMock).not.toHaveBeenCalled();
    const failedUpdate = healthConnectionUpdateMock.mock.calls.at(-1)?.[0] as {
      data: { status: string; metadata: string };
    };
    expect(failedUpdate.data.status).toBe('error');
    expect(JSON.parse(failedUpdate.data.metadata)).toMatchObject({
      syncError: 'garmin_terra_user_missing',
    });
  });

  it('replaces the Garmin sync window before inserting points', async () => {
    healthDataPointCreateManyMock.mockResolvedValueOnce({ count: 15 });
    const sync = new HealthSyncService();
    const result = await sync.syncConnection(
      garminConnection() as never,
      'u1',
      '2026-06-01',
      '2026-06-02',
    );

    expect(result).toMatchObject({ provider: 'garmin', ok: true, count: 15 });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(healthDataPointDeleteManyMock).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        provider: 'garmin',
        timestamp: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lt: new Date('2026-06-03T00:00:00.000Z'),
        },
      },
    });
    expect(healthDataPointDeleteManyMock.mock.invocationCallOrder[0])
      .toBeLessThan(healthDataPointCreateManyMock.mock.invocationCallOrder[0]);
  });

  it('keeps Garmin window replacement inside a transaction when point insert fails', async () => {
    healthDataPointCreateManyMock.mockRejectedValueOnce(new Error('insert failed'));
    const sync = new HealthSyncService();
    const result = await sync.syncConnection(
      garminConnection() as never,
      'u1',
      '2026-06-01',
      '2026-06-02',
    );

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      provider: 'garmin',
      ok: false,
      count: 0,
      error: 'insert failed',
    });
    expect(healthConnectionUpdateMock).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'conn-garmin-1' },
      data: expect.objectContaining({ status: 'error' }),
    }));
  });
});

describe('HealthSyncService.syncProvider — Dexcom characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('dexcom', '2026-04-13', '2026-04-14');
  });

  it('emits 96 glucose points (15-min cadence × 24h)', () => {
    expect(points.length).toBe(96);
    expect(points.every((p) => p.metric === 'glucose')).toBe(true);
  });

  it('every point carries provider=dexcom', () => {
    expect(points.every((p) => p.provider === 'dexcom')).toBe(true);
  });

  it('glucose points are metabolic/mg/dL (canonical contract)', () => {
    expect(points[0]).toMatchObject({
      category: 'metabolic',
      metric: 'glucose',
      unit: 'mg/dL',
    });
    expect(points.every((p) => p.value >= 40 && p.value <= 250)).toBe(true);
  });

  it('timestamps are ISO strings derived from systemTime', () => {
    expect(points.every((p) => new Date(p.timestamp).toISOString() === p.timestamp)).toBe(true);
  });
});

describe('HealthSyncService.syncProvider — Libre characterization', () => {
  let points: HealthDataPoint[];

  beforeEach(async () => {
    const sync = new HealthSyncService();
    points = await sync.syncProvider('libre', '2026-04-13', '2026-04-14');
  });

  it('emits 96 glucose points (15-min cadence × 24h)', () => {
    expect(points.length).toBe(96);
    expect(points.every((p) => p.metric === 'glucose')).toBe(true);
  });

  it('every point carries provider=libre and the metabolic/mg/dL contract', () => {
    expect(points.every((p) => p.provider === 'libre')).toBe(true);
    expect(points[0]).toMatchObject({ category: 'metabolic', metric: 'glucose', unit: 'mg/dL' });
  });
});

describe('HealthSyncService.syncProvider — Libre real path', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.LIBRE_ENABLED;

  beforeEach(() => {
    process.env.LIBRE_ENABLED = 'true';
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.LIBRE_ENABLED;
    else process.env.LIBRE_ENABLED = originalEnv;
  });

  async function encryptedToken(plain: string): Promise<string> {
    const { encryptToken } = await import('./crypto');
    return encryptToken(plain);
  }

  async function realConnection(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
      id: 'conn-1',
      userId: 'u1',
      provider: 'libre',
      status: 'connected',
      accessToken: await encryptedToken('real-session-token'),
      refreshToken: null,
      expiresAt: new Date(now + 3600_000),
      terraUserId: null,
      metadata: JSON.stringify({ patientId: 'patient-42' }),
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('uses stored patientId + decrypted token when a real session is present', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            graphData: [
              { Timestamp: '2026-04-13T07:00:00.000Z', Value: 145 },
              { Timestamp: '2026-04-13T07:15:00.000Z', Value: 138 },
            ],
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const sync = new HealthSyncService();
    const connection = await realConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('libre', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ provider: 'libre', metric: 'glucose', value: 145 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/llu/connections/patient-42/graph');
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: 'Bearer real-session-token',
    });
  });

  it('falls back to mock when the connection has a mock patientId', async () => {
    const sync = new HealthSyncService();
    const connection = await realConnection({
      metadata: JSON.stringify({ patientId: 'mock_patient_abc' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('libre', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points.length).toBe(96);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to mock when the stored session is expired (no silent revive)', async () => {
    const sync = new HealthSyncService();
    const connection = await realConnection({
      expiresAt: new Date(Date.now() - 60_000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('libre', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points.length).toBe(96);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates LibreAuthError from the real path up to the caller', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    const sync = new HealthSyncService();
    const connection = await realConnection();
    const { LibreAuthError } = await import('./libre');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sync.syncProvider('libre', '2026-04-13', '2026-04-14', { connection: connection as any }),
    ).rejects.toBeInstanceOf(LibreAuthError);
  });
});

describe('HealthSyncService.syncProvider — Dexcom real path', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;
  const originalId = process.env.DEXCOM_CLIENT_ID;
  const originalSecret = process.env.DEXCOM_CLIENT_SECRET;

  beforeEach(() => {
    process.env.DEXCOM_CLIENT_ID = 'test-client-id';
    process.env.DEXCOM_CLIENT_SECRET = 'test-client-secret';
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.DEXCOM_CLIENT_ID;
    else process.env.DEXCOM_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.DEXCOM_CLIENT_SECRET;
    else process.env.DEXCOM_CLIENT_SECRET = originalSecret;
  });

  async function encryptedToken(plain: string): Promise<string> {
    const { encryptToken } = await import('./crypto');
    return encryptToken(plain);
  }

  async function realConnection(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
      id: 'conn-dex-1',
      userId: 'u1',
      provider: 'dexcom',
      status: 'connected',
      accessToken: await encryptedToken('real-dexcom-token'),
      refreshToken: 'real-refresh',
      expiresAt: new Date(now + 3600_000),
      terraUserId: null,
      metadata: null,
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('uses the stored decrypted token when a real session is present', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          egvs: [
            { systemTime: '2026-04-13T07:00:00.000Z', displayTime: '2026-04-13T07:00:00.000Z', value: 101, unit: 'mg/dL' },
            { systemTime: '2026-04-13T07:15:00.000Z', displayTime: '2026-04-13T07:15:00.000Z', value: 108, unit: 'mg/dL' },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const sync = new HealthSyncService();
    const connection = await realConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('dexcom', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ provider: 'dexcom', metric: 'glucose', value: 101 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/users/self/egvs');
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: 'Bearer real-dexcom-token',
    });
  });

  it('falls back to mock when the stored token has the mock_ prefix', async () => {
    const sync = new HealthSyncService();
    const connection = await realConnection({
      accessToken: await encryptedToken('mock_dexcom_xyz'),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('dexcom', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points.length).toBe(96);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to mock when the stored session is expired (no silent revive)', async () => {
    const sync = new HealthSyncService();
    const connection = await realConnection({
      expiresAt: new Date(Date.now() - 60_000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = await sync.syncProvider('dexcom', '2026-04-13', '2026-04-14', { connection: connection as any });

    expect(points.length).toBe(96);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates DexcomAuthError from the real path up to the caller', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    const sync = new HealthSyncService();
    const connection = await realConnection();
    const { DexcomAuthError } = await import('./dexcom');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sync.syncProvider('dexcom', '2026-04-13', '2026-04-14', { connection: connection as any }),
    ).rejects.toBeInstanceOf(DexcomAuthError);
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
      ['dexcom', 1], // getEgvs
      ['libre', 1], // getGlucoseGraph
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
