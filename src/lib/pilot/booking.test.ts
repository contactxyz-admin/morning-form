import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { BookingError, bookSlot, cancelBooking, listUpcomingSlots } from './booking';
import { PROCEDURE_CONSENT_TYPE, PROCEDURE_CONSENT_VERSION } from './consent';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

async function makeSlot(overrides: Partial<{ startsAt: Date; capacity: number }> = {}) {
  return prisma.pilotSlot.create({
    data: {
      venueName: 'Third Space Soho',
      venueAddress: '67 Brewer St, London',
      startsAt: overrides.startsAt ?? FUTURE(),
      capacity: overrides.capacity ?? 1,
      createdBy: 'reuben@contact.xyz',
    },
  });
}

describe('bookSlot', () => {
  it('books a slot, captures a consent record atomically, and backfills a null name', async () => {
    const userId = await makeTestUser(prisma, 'bk-happy');
    const slot = await makeSlot({ capacity: 2 });

    const result = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    expect(result.created).toBe(true);
    expect(result.booking.status).toBe('booked');

    const consent = await prisma.consentRecord.findUniqueOrThrow({
      where: { id: result.booking.consentRecordId },
    });
    expect(consent.userId).toBe(userId);
    expect(consent.type).toBe(PROCEDURE_CONSENT_TYPE);
    expect(consent.documentVersion).toBe(PROCEDURE_CONSENT_VERSION);
    expect(consent.signedName).toBe('Jane Doe');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.name).toBe('Jane Doe');
  });

  it('never overwrites an existing display name with the e-signature', async () => {
    const userId = await makeTestUser(prisma, 'bk-name');
    await prisma.user.update({ where: { id: userId }, data: { name: 'Preferred Name' } });
    const slot = await makeSlot();

    await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Legal Fullname' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.name).toBe('Preferred Name');
  });

  it('two concurrent bookings for the last place: exactly one succeeds, no orphan consent', async () => {
    const userA = await makeTestUser(prisma, 'bk-race-a');
    const userB = await makeTestUser(prisma, 'bk-race-b');
    const slot = await makeSlot({ capacity: 1 });

    const results = await Promise.allSettled([
      bookSlot(prisma, { userId: userA, slotId: slot.id, signedName: 'Racer A' }),
      bookSlot(prisma, { userId: userB, slotId: slot.id, signedName: 'Racer B' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as BookingError).code).toBe('slot_full');

    const bookings = await prisma.pilotSlotBooking.count({
      where: { slotId: slot.id, status: 'booked' },
    });
    expect(bookings).toBe(1);

    // The losing transaction rolled back — its consent row must not exist.
    const consents = await prisma.consentRecord.count({
      where: { userId: { in: [userA, userB] }, type: PROCEDURE_CONSENT_TYPE },
    });
    expect(consents).toBe(1);
  });

  it('double-booking the same slot is an idempotent replay (no second consent)', async () => {
    const userId = await makeTestUser(prisma, 'bk-idem');
    const slot = await makeSlot({ capacity: 5 });

    const first = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    const second = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.booking.id).toBe(first.booking.id);

    const consents = await prisma.consentRecord.count({
      where: { userId, type: PROCEDURE_CONSENT_TYPE },
    });
    expect(consents).toBe(1);
  });

  it('a second FUTURE slot is blocked while a live booking exists (one active overall)', async () => {
    const userId = await makeTestUser(prisma, 'bk-cap');
    const slotA = await makeSlot();
    const slotB = await makeSlot();

    await bookSlot(prisma, { userId, slotId: slotA.id, signedName: 'Jane Doe' });
    await expect(
      bookSlot(prisma, { userId, slotId: slotB.id, signedName: 'Jane Doe' }),
    ).rejects.toMatchObject({ code: 'active_booking_exists' });
  });

  it("a PAST booked slot does NOT block the next event (v1 never writes 'attended')", async () => {
    const userId = await makeTestUser(prisma, 'bk-past');
    // Seed a past-event booking directly (bookSlot refuses past slots).
    const pastSlot = await makeSlot({ startsAt: PAST() });
    const consent = await prisma.consentRecord.create({
      data: {
        userId,
        type: PROCEDURE_CONSENT_TYPE,
        documentVersion: PROCEDURE_CONSENT_VERSION,
        signedName: 'Jane Doe',
      },
    });
    await prisma.pilotSlotBooking.create({
      data: { slotId: pastSlot.id, userId, consentRecordId: consent.id },
    });

    const nextSlot = await makeSlot();
    const result = await bookSlot(prisma, { userId, slotId: nextSlot.id, signedName: 'Jane Doe' });
    expect(result.created).toBe(true);
  });

  it('cancel → rebook reuses the row and captures a FRESH consent record', async () => {
    const userId = await makeTestUser(prisma, 'bk-rebook');
    const slot = await makeSlot({ capacity: 3 });

    const first = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    await cancelBooking(prisma, { userId, bookingId: first.booking.id });

    const second = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    expect(second.created).toBe(true);
    expect(second.booking.id).toBe(first.booking.id); // row reuse
    expect(second.booking.consentRecordId).not.toBe(first.booking.consentRecordId);
    expect(second.booking.cancelledAt).toBeNull();

    const consents = await prisma.consentRecord.count({
      where: { userId, type: PROCEDURE_CONSENT_TYPE },
    });
    expect(consents).toBe(2);
  });

  it('cancelling stamps withdrawnAt on the consent; the rebook consent starts unstamped', async () => {
    const userId = await makeTestUser(prisma, 'bk-withdraw');
    const slot = await makeSlot({ capacity: 3 });

    const first = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    await cancelBooking(prisma, { userId, bookingId: first.booking.id });

    const withdrawn = await prisma.consentRecord.findUniqueOrThrow({
      where: { id: first.booking.consentRecordId },
    });
    expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);

    const second = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });
    const fresh = await prisma.consentRecord.findUniqueOrThrow({
      where: { id: second.booking.consentRecordId },
    });
    expect(fresh.withdrawnAt).toBeNull();
  });

  it('rejects a past slot (slot_past) and an unknown slot (slot_not_found)', async () => {
    const userId = await makeTestUser(prisma, 'bk-errs');
    const past = await makeSlot({ startsAt: PAST() });

    await expect(
      bookSlot(prisma, { userId, slotId: past.id, signedName: 'Jane Doe' }),
    ).rejects.toMatchObject({ code: 'slot_past' });
    await expect(
      bookSlot(prisma, { userId, slotId: 'nope', signedName: 'Jane Doe' }),
    ).rejects.toMatchObject({ code: 'slot_not_found' });
  });
});

describe('cancelBooking', () => {
  it('cancels own booking; a second cancel reports already_cancelled', async () => {
    const userId = await makeTestUser(prisma, 'cx-own');
    const slot = await makeSlot();
    const { booking } = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane' });

    expect(await cancelBooking(prisma, { userId, bookingId: booking.id })).toEqual({ cancelled: true });
    expect(await cancelBooking(prisma, { userId, bookingId: booking.id })).toEqual({
      cancelled: false,
      reason: 'already_cancelled',
    });
  });

  it("someone else's booking conflates to not_found (no enumeration leak)", async () => {
    const owner = await makeTestUser(prisma, 'cx-owner');
    const attacker = await makeTestUser(prisma, 'cx-attacker');
    const slot = await makeSlot();
    const { booking } = await bookSlot(prisma, { userId: owner, slotId: slot.id, signedName: 'O' });

    expect(await cancelBooking(prisma, { userId: attacker, bookingId: booking.id })).toEqual({
      cancelled: false,
      reason: 'not_found',
    });
  });
});

describe('listUpcomingSlots', () => {
  it('reports remaining capacity and excludes past slots; cancel frees the place', async () => {
    const userId = await makeTestUser(prisma, 'ls-cap');
    const slot = await makeSlot({ capacity: 2 });
    await makeSlot({ startsAt: PAST() }); // must not appear

    const { booking } = await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane' });

    let view = await listUpcomingSlots(prisma, userId);
    const mine = view.slots.find((s) => s.id === slot.id);
    expect(mine?.remaining).toBe(1);
    expect(view.slots.every((s) => s.startsAt.getTime() > Date.now())).toBe(true);
    expect(view.ownBooking?.id).toBe(booking.id);

    await cancelBooking(prisma, { userId, bookingId: booking.id });
    view = await listUpcomingSlots(prisma, userId);
    expect(view.slots.find((s) => s.id === slot.id)?.remaining).toBe(2);
    expect(view.ownBooking).toBeNull();
  });
});
