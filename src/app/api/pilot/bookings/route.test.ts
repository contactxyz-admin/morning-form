import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

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

const confirmationEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/pilot/booking-email', () => ({
  sendSlotBookingConfirmationEmail: (...args: unknown[]) => confirmationEmailMock(...args),
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
  confirmationEmailMock.mockClear().mockResolvedValue(undefined);
  envMock.IN_GYM_BOOKING_ENABLED = 'true';
});

async function makeSlot(overrides: Partial<{ startsAt: Date; capacity: number }> = {}) {
  return prisma.pilotSlot.create({
    data: {
      venueName: 'Third Space Soho',
      venueAddress: '67 Brewer St, London',
      startsAt: overrides.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      capacity: overrides.capacity ?? 2,
      createdBy: 'reuben@contact.xyz',
    },
  });
}

function postWith(body: unknown) {
  return new NextRequest('http://localhost/api/pilot/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function signIn(suffix: string) {
  const userId = await makeTestUser(prisma, `bkr-${suffix}`);
  currentUserMock.mockResolvedValue({ id: userId, email: `bkr-${suffix}@example.com` });
  return userId;
}

describe('POST /api/pilot/bookings — guards and validation', () => {
  it('404 when the flag is off; 401 when unauthenticated', async () => {
    envMock.IN_GYM_BOOKING_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'm@example.com' });
    expect((await POST(postWith({}))).status).toBe(404);

    envMock.IN_GYM_BOOKING_ENABLED = 'true';
    currentUserMock.mockResolvedValue(null);
    expect((await POST(postWith({}))).status).toBe(401);
  });

  it('400 unless consentAccepted is literally true', async () => {
    await signIn('consent');
    const slot = await makeSlot();
    for (const consentAccepted of [false, 'true', 1, undefined]) {
      const res = await POST(
        postWith({ slotId: slot.id, signedName: 'Jane Doe', consentAccepted }),
      );
      expect(res.status).toBe(400);
    }
    // No consent row may exist for a rejected request.
    expect(await prisma.pilotSlotBooking.count({ where: { slotId: slot.id } })).toBe(0);
  });

  it('400 on a too-short signed name', async () => {
    await signIn('shortname');
    const slot = await makeSlot();
    const res = await POST(
      postWith({ slotId: slot.id, signedName: ' J ', consentAccepted: true }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/pilot/bookings — flow', () => {
  it('201 on a new booking; confirmation email + SLOT_BOOKED event fire exactly once', async () => {
    await signIn('happy');
    const slot = await makeSlot();

    const res = await POST(postWith({ slotId: slot.id, signedName: 'Jane Doe', consentAccepted: true }));
    expect(res.status).toBe(201);
    const { booking } = (await res.json()) as { booking: { id: string; status: string } };
    expect(booking.status).toBe('booked');

    expect(confirmationEmailMock).toHaveBeenCalledTimes(1);
    expect(confirmationEmailMock.mock.calls[0][0]).toMatchObject({
      venueName: 'Third Space Soho',
    });
    const events = await prisma.funnelEvent.count({
      where: { funnelId: booking.id, event: FUNNEL_EVENTS.SLOT_BOOKED },
    });
    expect(events).toBe(1);
  });

  it('idempotent replay: 200, same booking, NO second email or funnel event', async () => {
    await signIn('replay');
    const slot = await makeSlot();

    const first = await POST(postWith({ slotId: slot.id, signedName: 'Jane Doe', consentAccepted: true }));
    const second = await POST(postWith({ slotId: slot.id, signedName: 'Jane Doe', consentAccepted: true }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);

    const firstBody = (await first.json()) as { booking: { id: string } };
    const secondBody = (await second.json()) as { booking: { id: string } };
    expect(secondBody.booking.id).toBe(firstBody.booking.id);

    expect(confirmationEmailMock).toHaveBeenCalledTimes(1);
    const events = await prisma.funnelEvent.count({
      where: { funnelId: firstBody.booking.id, event: FUNNEL_EVENTS.SLOT_BOOKED },
    });
    expect(events).toBe(1);
  });

  it('typed conflicts: slot_full and active_booking_exists → 409 with a code', async () => {
    const fullSlot = await makeSlot({ capacity: 1 });
    const occupant = await makeTestUser(prisma, 'bkr-occupant');
    currentUserMock.mockResolvedValue({ id: occupant, email: 'occupant@example.com' });
    await POST(postWith({ slotId: fullSlot.id, signedName: 'First In', consentAccepted: true }));

    await signIn('conflict');
    const fullRes = await POST(
      postWith({ slotId: fullSlot.id, signedName: 'Too Late', consentAccepted: true }),
    );
    expect(fullRes.status).toBe(409);
    expect(((await fullRes.json()) as { code: string }).code).toBe('slot_full');

    // Same caller books an open slot, then tries a second one.
    const slotA = await makeSlot();
    const slotB = await makeSlot();
    await POST(postWith({ slotId: slotA.id, signedName: 'Jane Doe', consentAccepted: true }));
    const capRes = await POST(
      postWith({ slotId: slotB.id, signedName: 'Jane Doe', consentAccepted: true }),
    );
    expect(capRes.status).toBe(409);
    expect(((await capRes.json()) as { code: string }).code).toBe('active_booking_exists');
  });

  it('410 for a past slot, 404 for an unknown slot', async () => {
    await signIn('gone');
    const past = await makeSlot({ startsAt: new Date(Date.now() - 60 * 60 * 1000) });
    expect(
      (await POST(postWith({ slotId: past.id, signedName: 'Jane Doe', consentAccepted: true }))).status,
    ).toBe(410);
    expect(
      (await POST(postWith({ slotId: 'nope', signedName: 'Jane Doe', consentAccepted: true }))).status,
    ).toBe(404);
  });

  it('email failure is non-fatal: booking still returns 201', async () => {
    confirmationEmailMock.mockRejectedValue(new Error('resend down'));
    await signIn('mailfail');
    const slot = await makeSlot();

    const res = await POST(postWith({ slotId: slot.id, signedName: 'Jane Doe', consentAccepted: true }));
    expect(res.status).toBe(201);
    const { booking } = (await res.json()) as { booking: { id: string } };
    const row = await prisma.pilotSlotBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('booked');
  });
});
