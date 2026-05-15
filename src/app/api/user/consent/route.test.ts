import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
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
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

import { POST } from './route';

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

function makePost(opts?: { origin?: string | null }): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts?.origin !== undefined && opts.origin !== null) {
    headers.set('origin', opts.origin);
  }
  return new Request('http://localhost:3000/api/user/consent', {
    method: 'POST',
    headers,
  });
}

async function makeConsentTestUser(consented: boolean): Promise<string> {
  // Don't use the shared `makeTestUser` helper because it pre-sets
  // llmConsentAcceptedAt to Date() — the whole point of these tests is
  // to exercise the null/Date branches explicitly.
  const user = await prisma.user.create({
    data: {
      email: `consent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      llmConsentAcceptedAt: consented ? new Date() : null,
    },
  });
  return user.id;
}

describe('POST /api/user/consent', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it('records the timestamp and returns 204 for a first-time consent', async () => {
    const userId = await makeConsentTestUser(false);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(makePost());
    expect(res.status).toBe(204);

    const after = await prisma.user.findUnique({ where: { id: userId } });
    expect(after?.llmConsentAcceptedAt).toBeInstanceOf(Date);
  });

  it('preserves the original timestamp on re-POST (idempotent)', async () => {
    const userId = await makeConsentTestUser(false);
    currentUserMock.mockResolvedValue({ id: userId });

    await POST(makePost());
    const first = await prisma.user.findUnique({ where: { id: userId } });
    const originalTs = first!.llmConsentAcceptedAt!;

    // Re-POST after a small wait. The endpoint must NOT overwrite the
    // existing timestamp — DPIA / audit requires the *first* moment of
    // consent to be load-bearing.
    await new Promise((r) => setTimeout(r, 10));
    const res = await POST(makePost());
    expect(res.status).toBe(204);

    const second = await prisma.user.findUnique({ where: { id: userId } });
    expect(second!.llmConsentAcceptedAt!.getTime()).toBe(originalTs.getTime());
  });

  it('rejects cross-origin POSTs (defense-in-depth CSRF guard)', async () => {
    const userId = await makeConsentTestUser(false);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(makePost({ origin: 'https://attacker.example' }));
    expect(res.status).toBe(403);

    // Consent must NOT be recorded.
    const after = await prisma.user.findUnique({ where: { id: userId } });
    expect(after?.llmConsentAcceptedAt).toBeNull();
  });

  it('accepts same-origin POSTs', async () => {
    const userId = await makeConsentTestUser(false);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(makePost({ origin: 'http://localhost:3000' }));
    expect(res.status).toBe(204);
  });

  it('accepts POSTs without an Origin header (server-side / curl)', async () => {
    const userId = await makeConsentTestUser(false);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(makePost({ origin: null }));
    expect(res.status).toBe(204);
  });
});
