import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const sendMock = vi.fn<() => Promise<{ sent: boolean }>>();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    ALLOW_DEMO_BYPASS: '1',
  },
}));

vi.mock('@/lib/env', () => ({
  env: envMock,
  assertAuthEnv: () => {},
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
}));

vi.mock('@/lib/auth/email', () => ({
  sendMagicLinkEmail: (...args: unknown[]) => sendMock(...(args as [])),
}));

import { POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ sent: false });
});

// No rate-limit cleanup: each test uses a unique email + IP so counters don't
// collide across tests. A global `deleteMany({})` would race with other test
// files that share the same test DB.

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/auth/request-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/request-link', () => {
  it('400s when the email is missing or invalid', async () => {
    const bad = await POST(makeRequest({ email: 'not-an-email' }));
    expect(bad.status).toBe(400);
    const empty = await POST(makeRequest({}));
    expect(empty.status).toBe(400);
  });

  it('returns 200 with identical shape for both known and unknown emails', async () => {
    const newEmail = `new-${Date.now()}@example.com`;
    const resA = await POST(makeRequest({ email: newEmail }));
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(Object.keys(bodyA).sort()).toEqual(['ok']);

    const resB = await POST(makeRequest({ email: `unknown-${Date.now()}@example.com` }));
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(Object.keys(bodyB).sort()).toEqual(['ok']);
  });

  it('creates a MagicLinkToken and invokes the email sender exactly once for a valid email', async () => {
    const emailAddr = `happy-${Date.now()}@example.com`;
    await POST(makeRequest({ email: emailAddr }));
    const user = await prisma.user.findUnique({ where: { email: emailAddr } });
    expect(user).not.toBeNull();
    const tokens = await prisma.magicLinkToken.findMany({ where: { userId: user!.id } });
    expect(tokens).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('returns 429 when the per-email rate limit is exceeded', async () => {
    const emailAddr = `rl-${Date.now()}@example.com`;
    for (let i = 0; i < 3; i++) {
      const r = await POST(makeRequest({ email: emailAddr }, { 'x-forwarded-for': `9.9.9.${i}` }));
      expect(r.status).toBe(200);
    }
    const r4 = await POST(makeRequest({ email: emailAddr }, { 'x-forwarded-for': '9.9.9.9' }));
    expect(r4.status).toBe(429);
  });

  it('dev demo bypass returns devRawToken in the response body when ALLOW_DEMO_BYPASS=1', async () => {
    const res = await POST(makeRequest({ email: 'demo@morningform.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.devRawToken).toBe('string');
    expect(typeof body.verifyUrl).toBe('string');
    expect(body.verifyUrl).toContain(encodeURIComponent(body.devRawToken));
  });

  it('does NOT leak devRawToken when ALLOW_DEMO_BYPASS is unset (simulates Vercel preview)', async () => {
    const prev = envMock.ALLOW_DEMO_BYPASS;
    envMock.ALLOW_DEMO_BYPASS = '';
    try {
      const res = await POST(makeRequest({ email: 'demo@morningform.com' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.devRawToken).toBeUndefined();
      expect(body.verifyUrl).toBeUndefined();
    } finally {
      envMock.ALLOW_DEMO_BYPASS = prev;
    }
  });

  it('still returns 200 when the email sender throws', async () => {
    sendMock.mockRejectedValueOnce(new Error('resend outage'));
    const res = await POST(makeRequest({ email: `sendfail-${Date.now()}@example.com` }));
    expect(res.status).toBe(200);
  });
});
