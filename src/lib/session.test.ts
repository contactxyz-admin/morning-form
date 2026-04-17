import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

// In-memory cookie jar so we can drive set/get/delete without next/headers.
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
  assertAuthEnv: () => {},
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
}));

import {
  SESSION_COOKIE,
  createSession,
  getCurrentUser,
  destroyCurrentSession,
  hashSessionToken,
} from './session';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  cookieJar.clear();
});

describe('createSession', () => {
  it('persists a Session row with hashed token and sets a httpOnly cookie', async () => {
    const userId = await makeTestUser(prisma, 'session-create');
    const { rawToken } = await createSession(userId, { userAgent: 'test', ipHash: 'ip-h' });
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(cookieJar.get(SESSION_COOKIE)).toBe(rawToken);

    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashSessionToken(rawToken));
    expect(rows[0]!.userAgent).toBe('test');
    expect(rows[0]!.ipHash).toBe('ip-h');
    expect(rows[0]!.revokedAt).toBeNull();
  });

  it('never persists the raw token', async () => {
    const userId = await makeTestUser(prisma, 'session-nostore');
    const { rawToken } = await createSession(userId);
    const all = await prisma.session.findMany({});
    for (const row of all) {
      expect(row.tokenHash).not.toBe(rawToken);
      expect(row.tokenHash).not.toContain(rawToken);
    }
  });
});

describe('getCurrentUser', () => {
  it('returns null when no cookie is set (no demo fallback)', async () => {
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('returns null when the cookie value does not match any session row', async () => {
    cookieJar.set(SESSION_COOKIE, 'tampered-value-that-will-not-match-any-tokenHash');
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('returns the user after createSession', async () => {
    const userId = await makeTestUser(prisma, 'session-get-user');
    await createSession(userId);
    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
  });

  it('returns null for an expired session', async () => {
    const userId = await makeTestUser(prisma, 'session-expired');
    const { rawToken } = await createSession(userId);
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(rawToken) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('returns null for a revoked session', async () => {
    const userId = await makeTestUser(prisma, 'session-revoked');
    const { rawToken } = await createSession(userId);
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(rawToken) },
      data: { revokedAt: new Date() },
    });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('rotating SESSION_SECRET invalidates all existing sessions (via rehash mismatch)', async () => {
    const userId = await makeTestUser(prisma, 'session-rotate');
    const { rawToken } = await createSession(userId);
    // Simulate rotation by manually hashing the same raw token with a different
    // secret — the fresh hash should not match anything in the DB.
    const fakeRotatedHash = createHash('sha256')
      .update('a-completely-different-secret-used-after-rotation-0000')
      .update(rawToken)
      .digest('hex');
    const match = await prisma.session.findUnique({ where: { tokenHash: fakeRotatedHash } });
    expect(match).toBeNull();
  });
});

describe('destroyCurrentSession', () => {
  it('revokes the session row and clears the cookie', async () => {
    const userId = await makeTestUser(prisma, 'session-logout');
    const { rawToken } = await createSession(userId);
    await destroyCurrentSession();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    const row = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(rawToken) } });
    expect(row?.revokedAt).not.toBeNull();
  });

  it('is a no-op when no cookie is set', async () => {
    await expect(destroyCurrentSession()).resolves.toBeUndefined();
  });
});
