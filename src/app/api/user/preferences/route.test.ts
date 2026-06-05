import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

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

import { GET, PUT } from './route';

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

function putRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DEFAULTS = {
  wakeTime: '07:00',
  windDownTime: '22:00',
  timezone: 'UTC',
  notifyMorning: true,
  notifyProtocol: true,
  notifyEvening: true,
  notifyWeekly: true,
};

describe('PUT /api/user/preferences', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await PUT(putRequest({ wakeTime: '06:30' }));
    expect(res.status).toBe(401);
  });

  it('persists allowlisted fields and GET returns them', async () => {
    const userId = await makeTestUser(prisma, 'prefs-persist');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });

    const putRes = await PUT(
      putRequest({
        wakeTime: '06:15',
        windDownTime: '21:45',
        timezone: 'Europe/London',
        notifyMorning: false,
        notifyWeekly: false,
      }),
    );
    expect(putRes.status).toBe(200);
    const putJson = await putRes.json();
    expect(putJson.preferences.wakeTime).toBe('06:15');
    expect(putJson.preferences.windDownTime).toBe('21:45');
    expect(putJson.preferences.timezone).toBe('Europe/London');
    expect(putJson.preferences.notifyMorning).toBe(false);
    // Unset boolean fields fall back to the model default on create.
    expect(putJson.preferences.notifyProtocol).toBe(true);
    expect(putJson.preferences.notifyWeekly).toBe(false);

    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.preferences).toEqual({
      wakeTime: '06:15',
      windDownTime: '21:45',
      timezone: 'Europe/London',
      notifyMorning: false,
      notifyProtocol: true,
      notifyEvening: true,
      notifyWeekly: false,
    });

    const rows = await prisma.userPreferences.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
  });

  it('upserts on a second PUT (no duplicate row)', async () => {
    const userId = await makeTestUser(prisma, 'prefs-upsert');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    await PUT(putRequest({ wakeTime: '06:00' }));
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    await PUT(putRequest({ wakeTime: '08:30', notifyEvening: false }));

    const rows = await prisma.userPreferences.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].wakeTime).toBe('08:30');
    expect(rows[0].notifyEvening).toBe(false);
  });

  it('returns 400 on invalid time format', async () => {
    const userId = await makeTestUser(prisma, 'prefs-bad-time');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const res = await PUT(putRequest({ wakeTime: '25:00' }));
    expect(res.status).toBe(400);
    const res2 = await PUT(putRequest({ windDownTime: '7:5' }));
    expect(res2.status).toBe(400);
    const res3 = await PUT(putRequest({ wakeTime: 'morning' }));
    expect(res3.status).toBe(400);
    // No row should have been created on validation failure.
    const rows = await prisma.userPreferences.findMany({ where: { userId } });
    expect(rows).toHaveLength(0);
  });

  it('ignores unknown fields (allowlist holds)', async () => {
    const userId = await makeTestUser(prisma, 'prefs-unknown');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const res = await PUT(
      putRequest({
        wakeTime: '05:00',
        // Fields not in the model allowlist — must not be written or error.
        isAdmin: true,
        id: 'spoofed',
        userId: 'someone-else',
        createdAt: '2000-01-01',
      }),
    );
    expect(res.status).toBe(200);
    const row = await prisma.userPreferences.findUnique({ where: { userId } });
    expect(row?.wakeTime).toBe('05:00');
    // userId must be the authenticated user, not the spoofed body value.
    expect(row?.userId).toBe(userId);
  });

  it('returns 400 on a wrong-typed boolean field', async () => {
    const userId = await makeTestUser(prisma, 'prefs-bad-bool');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const res = await PUT(putRequest({ notifyMorning: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on an empty / no-valid-field body', async () => {
    const userId = await makeTestUser(prisma, 'prefs-empty');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    // Empty object → nothing to write.
    const empty = await PUT(putRequest({}));
    expect(empty.status).toBe(400);
    // Only unknown keys → still nothing writable.
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const unknownOnly = await PUT(putRequest({ isAdmin: true, nope: 1 }));
    expect(unknownOnly.status).toBe(400);
    // No row created on a rejected no-op PUT.
    expect(await prisma.userPreferences.count({ where: { userId } })).toBe(0);
  });

  it('returns 400 on an invalid IANA timezone', async () => {
    const userId = await makeTestUser(prisma, 'prefs-bad-tz');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const res = await PUT(putRequest({ timezone: 'Mars/Phobos' }));
    expect(res.status).toBe(400);
    // A valid one passes.
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const ok = await PUT(putRequest({ timezone: 'America/New_York' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).preferences.timezone).toBe('America/New_York');
  });
});

describe('GET /api/user/preferences', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns defaults when the user has no row', async () => {
    const userId = await makeTestUser(prisma, 'prefs-defaults');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferences).toEqual(DEFAULTS);
    // GET surfaces the authenticated user's email as a sibling field.
    expect(json.email).toBe(`prefs-${userId}@example.com`);
    // No row exists yet → hasRow false (the client uses this to decide the
    // one-time localStorage→server migration).
    expect(json.hasRow).toBe(false);
  });

  it('reports hasRow false with no row and true after a PUT creates one', async () => {
    const userId = await makeTestUser(prisma, 'prefs-hasrow');
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const before = await GET();
    expect((await before.json()).hasRow).toBe(false);

    // Write a row whose values equal the defaults — hasRow must STILL be true
    // (the old defaults-heuristic could not distinguish this case).
    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    await PUT(putRequest({ wakeTime: DEFAULTS.wakeTime }));

    currentUserMock.mockResolvedValue({ id: userId, email: `prefs-${userId}@example.com` });
    const after = await GET();
    const json = await after.json();
    expect(json.hasRow).toBe(true);
    expect(json.preferences).toEqual(DEFAULTS);
  });
});
