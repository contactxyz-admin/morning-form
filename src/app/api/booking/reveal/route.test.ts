import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

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
  env: { NODE_ENV: 'test', CONCIERGE_BOOKING_ENABLED: 'true' },
}));

import { POST } from './route';
import { encryptToken } from '@/lib/health/crypto';

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

async function seedDelivered(suffix: string, code: string): Promise<{ id: string; userId: string }> {
  const userId = await makeTestUser(prisma, suffix);
  const row = await prisma.bookingRequest.create({
    data: {
      userId,
      market: 'uk',
      status: 'delivered',
      markerNames: null,
      codeEncrypted: encryptToken(code),
    },
  });
  return { id: row.id, userId };
}

function postWith(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/booking/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/booking/reveal', () => {
  it('owner + delivered returns the code once, then nulls the ciphertext', async () => {
    const { id, userId } = await seedDelivered('reveal-ok', 'CODE-XYZ-789');
    currentUserMock.mockResolvedValue({ id: userId, email: 'u@example.com' });

    const res = await POST(postWith({ bookingId: id }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBe('CODE-XYZ-789');

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.codeEncrypted).toBeNull();
  });

  it('second reveal returns 410 (gone)', async () => {
    const { id, userId } = await seedDelivered('reveal-twice', 'ONLY-ONCE');
    currentUserMock.mockResolvedValue({ id: userId, email: 'u@example.com' });

    const first = await POST(postWith({ bookingId: id }));
    expect(first.status).toBe(200);
    const second = await POST(postWith({ bookingId: id }));
    expect(second.status).toBe(410);
  });

  it('non-owner gets 403 and the code is not consumed', async () => {
    const { id } = await seedDelivered('reveal-owner', 'SECRET-CODE');
    const otherUserId = await makeTestUser(prisma, 'reveal-other');
    currentUserMock.mockResolvedValue({ id: otherUserId, email: 'o@example.com' });

    const res = await POST(postWith({ bookingId: id }));
    expect(res.status).toBe(403);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.codeEncrypted).toBeTruthy();
  });

  it('409 when the booking is not yet delivered', async () => {
    const userId = await makeTestUser(prisma, 'reveal-early');
    const row = await prisma.bookingRequest.create({
      data: { userId, market: 'uk', status: 'arranged', markerNames: JSON.stringify(['hs-CRP']) },
    });
    currentUserMock.mockResolvedValue({ id: userId, email: 'u@example.com' });

    const res = await POST(postWith({ bookingId: row.id }));
    expect(res.status).toBe(409);
  });
});
