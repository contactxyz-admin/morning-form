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

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

function postWith(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/booking/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/booking/cancel', () => {
  it('cancels a requested booking and nullifies markerNames', async () => {
    const user = await makeUser('cancel-ok');
    currentUserMock.mockResolvedValue(user);
    const booking = await prisma.bookingRequest.create({
      data: { userId: user.id, markerNames: JSON.stringify(['hs-CRP']), market: 'uk', status: 'requested' },
    });

    const res = await POST(postWith({ bookingId: booking.id }));
    expect(res.status).toBe(200);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('cancelled');
    expect(row.markerNames).toBeNull();
  });

  it('409 when the booking has already been arranged', async () => {
    const user = await makeUser('cancel-arranged');
    currentUserMock.mockResolvedValue(user);
    const booking = await prisma.bookingRequest.create({
      data: { userId: user.id, markerNames: JSON.stringify(['hs-CRP']), market: 'uk', status: 'arranged' },
    });

    const res = await POST(postWith({ bookingId: booking.id }));
    expect(res.status).toBe(409);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('arranged');
  });

  it('IDOR: user A cannot cancel user B booking → 403', async () => {
    const owner = await makeUser('cancel-owner');
    const attacker = await makeUser('cancel-attacker');
    const booking = await prisma.bookingRequest.create({
      data: { userId: owner.id, markerNames: JSON.stringify(['hs-CRP']), market: 'uk', status: 'requested' },
    });
    currentUserMock.mockResolvedValue(attacker);

    const res = await POST(postWith({ bookingId: booking.id }));
    expect(res.status).toBe(403);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('requested');
  });
});
