import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: '',
    DATABASE_URL: 'file:./prisma/.test-graph.db',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

import { GET } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
});

function request(qs = ''): Request {
  return new Request(`https://app.test/api/insights/health-history${qs}`);
}

async function seedPoint(
  userId: string,
  metric: string,
  value: number,
  dayOffsetFromToday: number,
  provider = 'whoop',
) {
  const timestamp = new Date();
  timestamp.setUTCDate(timestamp.getUTCDate() - dayOffsetFromToday);
  timestamp.setUTCHours(12, 0, 0, 0);
  await prisma.healthDataPoint.create({
    data: {
      userId,
      provider,
      category: 'recovery',
      metric,
      value,
      unit: '',
      timestamp,
    },
  });
}

describe('GET /api/insights/health-history', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it('returns 400 when days is out of range', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'hh-bad') });
    const tooFew = await GET(request('?days=0'));
    expect(tooFew.status).toBe(400);
    const tooMany = await GET(request('?days=100'));
    expect(tooMany.status).toBe(400);
    const notNumber = await GET(request('?days=seven'));
    expect(notNumber.status).toBe(400);
  });

  it('returns an empty 7-entry grid when user has no data', async () => {
    const userId = await makeTestUser(prisma, 'hh-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request());
    const json = await res.json();
    expect(json.history).toHaveLength(7);
    expect(json.history.every((d: { hrv: number | null }) => d.hrv === null)).toBe(true);
  });

  it('returns correct length when days is specified', async () => {
    const userId = await makeTestUser(prisma, 'hh-days');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?days=14'));
    const json = await res.json();
    expect(json.history).toHaveLength(14);
  });

  it('computes the mean when multiple samples exist on the same day', async () => {
    const userId = await makeTestUser(prisma, 'hh-mean');
    await seedPoint(userId, 'hrv', 50, 1, 'whoop');
    await seedPoint(userId, 'hrv', 70, 1, 'oura');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?days=7'));
    const json = await res.json();
    const day = json.history[json.history.length - 2];
    expect(day.hrv).toBe(60);
  });

  it('pads missing days with null', async () => {
    const userId = await makeTestUser(prisma, 'hh-pad');
    await seedPoint(userId, 'hrv', 65, 2);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?days=7'));
    const json = await res.json();
    const withValue = json.history.filter((d: { hrv: number | null }) => d.hrv !== null);
    expect(withValue).toHaveLength(1);
    expect(withValue[0].hrv).toBe(65);
  });

  it('maps metric names HealthDataPoint stores to the UI field names', async () => {
    const userId = await makeTestUser(prisma, 'hh-metrics');
    await seedPoint(userId, 'recovery_score', 82, 1);
    await seedPoint(userId, 'resting_hr', 52, 1);
    await seedPoint(userId, 'duration', 7.5, 1);
    await seedPoint(userId, 'steps', 9500, 1);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?days=7'));
    const json = await res.json();
    const day = json.history[json.history.length - 2];
    expect(day.recoveryScore).toBe(82);
    expect(day.restingHR).toBe(52);
    expect(day.sleepDuration).toBe(7.5);
    expect(day.steps).toBe(9500);
  });

  it('only returns data for the current user', async () => {
    const userId = await makeTestUser(prisma, 'hh-me');
    const otherId = await makeTestUser(prisma, 'hh-other');
    await seedPoint(userId, 'hrv', 65, 1);
    await seedPoint(otherId, 'hrv', 80, 1);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?days=7'));
    const json = await res.json();
    const day = json.history[json.history.length - 2];
    expect(day.hrv).toBe(65);
  });
});
