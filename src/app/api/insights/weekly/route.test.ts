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
  return new Request(`https://app.test/api/insights/weekly${qs}`);
}

describe('GET /api/insights/weekly', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it('returns 400 when weekStart is not a Monday', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'wk-bad') });
    const res = await GET(request('?weekStart=2026-03-24'));
    expect(res.status).toBe(400);
  });

  it('returns zeroed review when user has no check-ins', async () => {
    const userId = await makeTestUser(prisma, 'wk-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?weekStart=2026-03-23'));
    const json = await res.json();
    expect(json.review.weekStart).toBe('2026-03-23');
    expect(json.review.weekEnd).toBe('2026-03-29');
    expect(json.review.sleepQuality.filled).toBe(0);
    expect(json.review.focusConsistency.filled).toBe(0);
    expect(json.review.protocolAdherence.filled).toBe(0);
    expect(json.review.patternInsight).toBeNull();
  });

  it('counts filled metrics correctly from seeded check-ins', async () => {
    const userId = await makeTestUser(prisma, 'wk-seeded');
    const days = [
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ];
    for (let i = 0; i < 5; i++) {
      await prisma.checkIn.create({
        data: {
          userId,
          type: 'morning',
          date: days[i],
          responses: JSON.stringify({ sleepQuality: 'well', currentFeeling: 'steady' }),
        },
      });
      await prisma.checkIn.create({
        data: {
          userId,
          type: 'evening',
          date: days[i],
          responses: JSON.stringify({
            focusQuality: 'good',
            afternoonEnergy: 'steady',
            protocolAdherence: 'fully',
          }),
        },
      });
    }
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(request('?weekStart=2026-03-23'));
    const json = await res.json();
    expect(json.review.sleepQuality.filled).toBe(5);
    expect(json.review.focusConsistency.filled).toBe(5);
    expect(json.review.protocolAdherence.filled).toBe(5);
  });
});
