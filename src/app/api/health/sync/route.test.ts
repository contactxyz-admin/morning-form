import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserMock = vi.fn().mockResolvedValue({ id: 'demo-user-1' });
const findManyConnectionsMock = vi.fn().mockResolvedValue([]);
const findManyDataPointsMock = vi.fn().mockResolvedValue([]);
const syncConnectionMock = vi.fn();
const aggregateToSummaryMock = vi.fn().mockReturnValue({ sleep: {}, activity: {}, heart: {} });

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    healthConnection: {
      findMany: (args: unknown) => findManyConnectionsMock(args),
    },
    healthDataPoint: {
      findMany: (args: unknown) => findManyDataPointsMock(args),
    },
  },
}));

vi.mock('@/lib/health/sync', () => ({
  HealthSyncService: vi.fn().mockImplementation(function HealthSyncServiceMock() {
    return {
      syncConnection: (...args: unknown[]) => syncConnectionMock(...args),
      aggregateToSummary: (...args: unknown[]) => aggregateToSummaryMock(...args),
    };
  }),
}));

import { POST } from './route';

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: 'demo-user-1' });
  findManyConnectionsMock.mockReset().mockResolvedValue([]);
  findManyDataPointsMock.mockReset().mockResolvedValue([]);
  syncConnectionMock.mockReset();
  aggregateToSummaryMock.mockReset().mockReturnValue({ sleep: {}, activity: {}, heart: {} });
});

function syncRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/health/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/health/sync', () => {
  it('returns 401 without loading connections when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(syncRequest({ providers: ['whoop'] }));

    expect(res.status).toBe(401);
    expect(findManyConnectionsMock).not.toHaveBeenCalled();
    expect(syncConnectionMock).not.toHaveBeenCalled();
  });

  it('blocks connected Garmin rows before the Terra-backed sync path', async () => {
    findManyConnectionsMock.mockResolvedValue([
      {
        id: 'conn-garmin',
        userId: 'demo-user-1',
        provider: 'garmin',
        status: 'connected',
        terraUserId: 'terra-user-1',
        metadata: '{"mode":"terra"}',
      },
    ]);

    const res = await POST(syncRequest({ providers: ['garmin'] }));
    const body = await res.json() as {
      dataPoints: number;
      results: Array<{ provider: string; ok: boolean; count: number; error: string | null }>;
    };

    expect(res.status).toBe(200);
    expect(syncConnectionMock).not.toHaveBeenCalled();
    expect(aggregateToSummaryMock).toHaveBeenCalledWith([]);
    expect(body.dataPoints).toBe(0);
    expect(body.results).toEqual([
      {
        provider: 'garmin',
        ok: false,
        count: 0,
        error: 'provider_application_required',
      },
    ]);
  });

  it('continues syncing providers that are available from the web', async () => {
    const whoopConnection = {
      id: 'conn-whoop',
      userId: 'demo-user-1',
      provider: 'whoop',
      status: 'connected',
    };
    const point = {
      category: 'recovery',
      metric: 'score',
      value: 91,
      unit: 'score',
      timestamp: '2026-06-02T08:00:00.000Z',
      provider: 'whoop',
    };
    findManyConnectionsMock.mockResolvedValue([whoopConnection]);
    syncConnectionMock.mockResolvedValue({
      provider: 'whoop',
      ok: true,
      count: 1,
      points: [point],
    });

    const res = await POST(syncRequest({ providers: ['whoop'] }));
    const body = await res.json() as {
      dataPoints: number;
      results: Array<{ provider: string; ok: boolean; count: number; error: string | null }>;
    };

    expect(res.status).toBe(200);
    expect(syncConnectionMock).toHaveBeenCalledTimes(1);
    expect(syncConnectionMock).toHaveBeenCalledWith(
      whoopConnection,
      'demo-user-1',
      expect.any(String),
      expect.any(String),
    );
    expect(aggregateToSummaryMock).toHaveBeenCalledWith([point]);
    expect(body.dataPoints).toBe(1);
    expect(body.results).toEqual([
      {
        provider: 'whoop',
        ok: true,
        count: 1,
        error: null,
      },
    ]);
  });
});
