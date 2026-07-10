import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { bookSlot } from '@/lib/pilot/booking';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  IN_GYM_BOOKING_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { POST } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  envMock.IN_GYM_BOOKING_ENABLED = 'true';
});

function postWith(id: string) {
  const req = new NextRequest(`http://localhost/api/pilot/bookings/${id}/cancel`, {
    method: 'POST',
  });
  return { req, ctx: { params: { id } } };
}

async function makeBooking(suffix: string, startsAt?: Date) {
  const userId = await makeTestUser(prisma, `cxr-${suffix}`);
  const slot = await prisma.pilotSlot.create({
    data: {
      venueName: 'Third Space Soho',
      venueAddress: '67 Brewer St, London',
      startsAt: startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      capacity: 1,
      createdBy: 'reuben@contact.xyz',
    },
  });
  const { booking } = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
  return { userId, slot, booking };
}

describe('POST /api/pilot/bookings/[id]/cancel', () => {
  it('404 when the flag is off; 401 when unauthenticated', async () => {
    envMock.IN_GYM_BOOKING_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'm@example.com' });
    const off = postWith('any');
    expect((await POST(off.req, off.ctx)).status).toBe(404);

    envMock.IN_GYM_BOOKING_ENABLED = 'true';
    currentUserMock.mockResolvedValue(null);
    const anon = postWith('any');
    expect((await POST(anon.req, anon.ctx)).status).toBe(401);
  });

  it('cancels own booking (200); second attempt reports 409', async () => {
    const { userId, booking } = await makeBooking('own');
    currentUserMock.mockResolvedValue({ id: userId, email: 'own@example.com' });

    const first = postWith(booking.id);
    expect((await POST(first.req, first.ctx)).status).toBe(200);
    const row = await prisma.pilotSlotBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).not.toBeNull();

    const second = postWith(booking.id);
    expect((await POST(second.req, second.ctx)).status).toBe(409);
  });

  it("someone else's booking → 404 (no enumeration leak), row untouched", async () => {
    const { booking } = await makeBooking('victim');
    const attacker = await makeTestUser(prisma, 'cxr-attacker');
    currentUserMock.mockResolvedValue({ id: attacker, email: 'attacker@example.com' });

    const { req, ctx } = postWith(booking.id);
    expect((await POST(req, ctx)).status).toBe(404);
    const row = await prisma.pilotSlotBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('booked');
  });

  it('409 once the slot has started', async () => {
    // Book a future slot, then move the slot into the past to simulate time
    // passing (bookSlot refuses past slots at booking time).
    const { userId, slot, booking } = await makeBooking('past');
    await prisma.pilotSlot.update({
      where: { id: slot.id },
      data: { startsAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    currentUserMock.mockResolvedValue({ id: userId, email: 'past@example.com' });

    const { req, ctx } = postWith(booking.id);
    expect((await POST(req, ctx)).status).toBe(409);
    const row = await prisma.pilotSlotBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('booked');
  });
});
