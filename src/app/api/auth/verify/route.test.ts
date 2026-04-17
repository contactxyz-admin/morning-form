import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

// In-memory cookie jar so createSession (via session.ts) doesn't need next/headers.
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

import { hashToken, issueMagicLink } from '@/lib/auth/magic-link';
import { SESSION_COOKIE } from '@/lib/session';
import { GET } from './route';

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

// No rate-limit cleanup: verify-route tests always use freshly issued tokens
// with unique emails, so counters never collide. A global `deleteMany({})`
// would race with other test files that share the same test DB.

function makeGet(token: string): Request {
  return new Request(`http://localhost:3000/api/auth/verify?token=${encodeURIComponent(token)}`, {
    method: 'GET',
  });
}

describe('GET /api/auth/verify', () => {
  it('verifies a fresh token, sets the session cookie, and redirects', async () => {
    const addr = `verify-happy-${Date.now()}@example.com`;
    const issued = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-h' });
    if (issued.outcome !== 'issued') throw new Error('unreachable');

    const res = await GET(makeGet(issued.rawToken));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/(home|assessment)$/);
    expect(cookieJar.get(SESSION_COOKIE)).toBeTypeOf('string');

    // Token is marked consumed.
    const user = await prisma.user.findUnique({ where: { email: addr } });
    const token = await prisma.magicLinkToken.findFirst({ where: { userId: user!.id } });
    expect(token?.consumedAt).not.toBeNull();
  });

  it('returns 410 when the token has already been consumed', async () => {
    const addr = `verify-reuse-${Date.now()}@example.com`;
    const issued = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-h' });
    if (issued.outcome !== 'issued') throw new Error('unreachable');

    const first = await GET(makeGet(issued.rawToken));
    expect(first.status).toBe(303);
    cookieJar.clear();
    const second = await GET(makeGet(issued.rawToken));
    expect(second.status).toBe(410);
    expect(cookieJar.get(SESSION_COOKIE)).toBeUndefined();
  });

  it('returns 410 when the token has expired', async () => {
    const addr = `verify-expired-${Date.now()}@example.com`;
    const issued = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-h' });
    if (issued.outcome !== 'issued') throw new Error('unreachable');
    // Push expiresAt into the past. Use the production hashToken helper so
    // this test stays correct if the hash construction is ever rotated again.
    await prisma.magicLinkToken.updateMany({
      where: { tokenHash: hashToken(issued.rawToken) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await GET(makeGet(issued.rawToken));
    expect(res.status).toBe(410);
  });

  it('returns 404 for a tampered / unknown token', async () => {
    const res = await GET(makeGet('bogus-token-that-will-not-match-anything'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for an empty token query param', async () => {
    const res = await GET(new Request('http://localhost:3000/api/auth/verify'));
    expect(res.status).toBe(404);
  });
});
