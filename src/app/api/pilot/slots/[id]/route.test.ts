import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { bookSlot, cancelBooking } from '@/lib/pilot/booking';

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

import { DELETE } from './route';

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

const STAFF = { id: 'staff-1', email: 'reuben@contact.xyz' };

function deleteWith(id: string) {
  const req = new NextRequest(`http://localhost/api/pilot/slots/${id}`, { method: 'DELETE' });
  return { req, ctx: { params: { id } } };
}

async function makeSlot() {
  return prisma.pilotSlot.create({
    data: {
      venueName: 'Third Space Soho',
      venueAddress: '67 Brewer St, London',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      capacity: 2,
      createdBy: 'reuben@contact.xyz',
    },
  });
}

describe('DELETE /api/pilot/slots/[id]', () => {
  it('403 for a non-staff member', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'member@example.com' });
    const { req, ctx } = deleteWith('any');
    expect((await DELETE(req, ctx)).status).toBe(403);
  });

  it('409 while a live booking exists; deletes once it is cancelled', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    const userId = await makeTestUser(prisma, 'slotdel-live');
    const slot = await makeSlot();
    const { booking } = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane' });

    const blocked = deleteWith(slot.id);
    expect((await DELETE(blocked.req, blocked.ctx)).status).toBe(409);

    await cancelBooking(prisma, { userId, bookingId: booking.id });
    const allowed = deleteWith(slot.id);
    expect((await DELETE(allowed.req, allowed.ctx)).status).toBe(200);

    expect(await prisma.pilotSlot.findUnique({ where: { id: slot.id } })).toBeNull();
    // Cascade swept the cancelled booking row with the slot.
    expect(await prisma.pilotSlotBooking.findUnique({ where: { id: booking.id } })).toBeNull();
  });

  it('404 on an unknown slot id', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    const { req, ctx } = deleteWith('does-not-exist');
    expect((await DELETE(req, ctx)).status).toBe(404);
  });
});
