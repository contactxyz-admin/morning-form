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

import { GET, POST } from './route';

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

function postRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(qs = ''): Request {
  return new Request(`https://app.test/api/check-in${qs}`);
}

const MORNING_BODY = {
  type: 'morning',
  date: '2026-03-20',
  responses: { sleepQuality: 'well', currentFeeling: 'steady' },
};

const EVENING_BODY = {
  type: 'evening',
  date: '2026-03-20',
  responses: { focusQuality: 'good', afternoonEnergy: 'steady', protocolAdherence: 'fully' },
};

describe('POST /api/check-in', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(postRequest(MORNING_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 'type' is missing or invalid", async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'ci-bad-type') });
    const missing = await POST(postRequest({ date: '2026-03-20', responses: {} }));
    expect(missing.status).toBe(400);
    const wrong = await POST(postRequest({ ...MORNING_BODY, type: 'noon' }));
    expect(wrong.status).toBe(400);
  });

  it("returns 400 when 'date' is missing or malformed", async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'ci-bad-date') });
    const missing = await POST(postRequest({ type: 'morning', responses: {} }));
    expect(missing.status).toBe(400);
    const wrong = await POST(postRequest({ ...MORNING_BODY, date: '2026/03/20' }));
    expect(wrong.status).toBe(400);
  });

  it('persists a new row on first submit', async () => {
    const userId = await makeTestUser(prisma, 'ci-new');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(postRequest(MORNING_BODY));
    expect(res.status).toBe(200);
    const rows = await prisma.checkIn.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-03-20');
    expect(rows[0].type).toBe('morning');
    expect(JSON.parse(rows[0].responses)).toEqual(MORNING_BODY.responses);
  });

  it('upserts on second submit for same (user, date, type)', async () => {
    const userId = await makeTestUser(prisma, 'ci-idempotent');
    currentUserMock.mockResolvedValue({ id: userId });
    const first = await POST(postRequest(MORNING_BODY));
    const firstJson = await first.json();
    const second = await POST(
      postRequest({ ...MORNING_BODY, responses: { sleepQuality: 'great', currentFeeling: 'sharp' } }),
    );
    const secondJson = await second.json();
    expect(secondJson.id).toBe(firstJson.id);
    const rows = await prisma.checkIn.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].responses)).toEqual({
      sleepQuality: 'great',
      currentFeeling: 'sharp',
    });
  });

  it('keeps morning and evening distinct on the same date', async () => {
    const userId = await makeTestUser(prisma, 'ci-both');
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(postRequest(MORNING_BODY));
    await POST(postRequest(EVENING_BODY));
    const rows = await prisma.checkIn.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    });
    expect(rows.map((r) => r.type)).toEqual(['evening', 'morning']);
  });
});

describe('GET /api/check-in', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed start or end', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'ci-bad-range') });
    const bad = await GET(getRequest('?start=03-20-2026'));
    expect(bad.status).toBe(400);
  });

  it('returns empty array when user has no check-ins', async () => {
    const userId = await makeTestUser(prisma, 'ci-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(getRequest('?start=2026-03-20&end=2026-03-26'));
    const json = await res.json();
    expect(json.checkIns).toEqual([]);
  });

  it('filters by userId and parses responses', async () => {
    const userId = await makeTestUser(prisma, 'ci-parse');
    const otherId = await makeTestUser(prisma, 'ci-parse-other');
    await prisma.checkIn.create({
      data: {
        userId,
        type: 'morning',
        date: '2026-03-20',
        responses: JSON.stringify(MORNING_BODY.responses),
      },
    });
    await prisma.checkIn.create({
      data: {
        userId: otherId,
        type: 'morning',
        date: '2026-03-20',
        responses: JSON.stringify({ sleepQuality: 'poorly', currentFeeling: 'low' }),
      },
    });
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(getRequest('?start=2026-03-20&end=2026-03-26'));
    const json = await res.json();
    expect(json.checkIns).toHaveLength(1);
    expect(json.checkIns[0].responses).toEqual(MORNING_BODY.responses);
  });

  it('sorts by date ascending', async () => {
    const userId = await makeTestUser(prisma, 'ci-sort');
    for (const date of ['2026-03-23', '2026-03-20', '2026-03-22']) {
      await prisma.checkIn.create({
        data: { userId, type: 'morning', date, responses: '{}' },
      });
    }
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET(getRequest('?start=2026-03-20&end=2026-03-26'));
    const json = await res.json();
    expect(json.checkIns.map((c: { date: string }) => c.date)).toEqual([
      '2026-03-20',
      '2026-03-22',
      '2026-03-23',
    ]);
  });
});
