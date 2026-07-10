/**
 * Slot booking core — the one place capacity, the one-active-booking cap,
 * and atomic consent capture are enforced.
 *
 * Concurrency: one interactive $transaction per booking, serialized by two
 * transaction-scoped advisory locks in a FIXED order (user first, then slot
 * — consistent ordering prevents deadlock between concurrent bookings).
 * Keys are domain-prefixed so pilot locks never collide with the retest
 * draws' user-keyed lock (src/lib/retest/draws.ts). Capacity is a live
 * count of status='booked' rows under the lock — no denormalised counter,
 * so cancellation frees capacity with nothing to drift.
 */
import { Prisma, type PilotSlotBooking, type PrismaClient } from '@prisma/client';
import {
  PROCEDURE_CONSENT_TYPE,
  PROCEDURE_CONSENT_VERSION,
} from './consent';

export type BookingErrorCode = 'slot_not_found' | 'slot_past' | 'slot_full' | 'active_booking_exists';

export class BookingError extends Error {
  constructor(public readonly code: BookingErrorCode) {
    super(code);
    this.name = 'BookingError';
  }
}

export interface BookSlotInput {
  userId: string;
  slotId: string;
  /** Typed full-name e-signature from the consent step. Trimmed by the route's Zod. */
  signedName: string;
}

export interface BookSlotResult {
  booking: PilotSlotBooking;
  /** False when this call was an idempotent replay of an existing live booking. */
  created: boolean;
}

export async function bookSlot(db: PrismaClient, input: BookSlotInput): Promise<BookSlotResult> {
  const { userId, slotId, signedName } = input;
  return db.$transaction(async (tx) => {
    // Fixed lock order: user, then slot. $executeRaw (not $queryRaw):
    // pg_advisory_xact_lock returns void, which $queryRaw can't deserialize.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pilot-user:' + userId})::bigint)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pilot-slot:' + slotId})::bigint)`;

    const slot = await tx.pilotSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new BookingError('slot_not_found');
    const now = new Date();
    if (slot.startsAt <= now) throw new BookingError('slot_past');

    // Idempotent replay: an existing LIVE booking for this exact slot is a
    // double-click, not an error — return it unchanged (no second email/event).
    const existing = await tx.pilotSlotBooking.findUnique({
      where: { slotId_userId: { slotId, userId } },
    });
    if (existing && existing.status === 'booked') {
      return { booking: existing, created: false };
    }

    // One active booking overall. The `startsAt > now` join matters: v1 never
    // writes 'attended', so past-event rows stay 'booked' forever and must
    // not block the next event day.
    const activeElsewhere = await tx.pilotSlotBooking.count({
      where: {
        userId,
        status: 'booked',
        slot: { startsAt: { gt: now } },
      },
    });
    if (activeElsewhere > 0) throw new BookingError('active_booking_exists');

    // Live capacity check under the slot lock.
    const booked = await tx.pilotSlotBooking.count({
      where: { slotId, status: 'booked' },
    });
    if (booked >= slot.capacity) throw new BookingError('slot_full');

    // Procedure consent — captured atomically with the booking (W1: no
    // standalone consent endpoint, so no orphaned consents and no version
    // drift between what was shown and what was booked).
    const consent = await tx.consentRecord.create({
      data: {
        userId,
        type: PROCEDURE_CONSENT_TYPE,
        documentVersion: PROCEDURE_CONSENT_VERSION,
        signedName,
      },
    });

    // Identity capture: backfill User.name from the e-signature ONLY when
    // unset — a legal signature must never clobber a chosen display name.
    await tx.user.updateMany({ where: { id: userId, name: null }, data: { name: signedName } });

    // Create, or reactivate the cancelled row this (slot,user) pair already
    // owns (the @@unique constraint makes rebook-after-cancel a row reuse),
    // repointing to the FRESH consent record.
    const booking = existing
      ? await tx.pilotSlotBooking.update({
          where: { id: existing.id },
          data: { status: 'booked', consentRecordId: consent.id, cancelledAt: null },
        })
      : await tx.pilotSlotBooking.create({
          data: { slotId, userId, consentRecordId: consent.id },
        });

    return { booking, created: true };
  });
}

export interface CancelBookingResult {
  cancelled: boolean;
  /** 'not_found' covers not-owned too (no enumeration leak); 'already_cancelled'; 'slot_past'. */
  reason?: 'not_found' | 'already_cancelled' | 'slot_past';
}

export async function cancelBooking(
  db: PrismaClient | Prisma.TransactionClient,
  input: { userId: string; bookingId: string },
): Promise<CancelBookingResult> {
  const booking = await db.pilotSlotBooking.findFirst({
    where: { id: input.bookingId, userId: input.userId },
    include: { slot: { select: { startsAt: true } } },
  });
  if (!booking) return { cancelled: false, reason: 'not_found' };
  if (booking.slot.startsAt <= new Date()) return { cancelled: false, reason: 'slot_past' };

  // CAS: only a currently-booked row cancels; a concurrent cancel loses cleanly.
  const cas = await db.pilotSlotBooking.updateMany({
    where: { id: input.bookingId, userId: input.userId, status: 'booked' },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
  if (cas.count === 0) return { cancelled: false, reason: 'already_cancelled' };

  // Withdrawal evidence on the consent artifact itself: cancelling the
  // booking withdraws the procedure consent (per the consent copy), and the
  // ConsentRecord outlives the booking row (staff slot delete cascades
  // cancelled bookings away), so the withdrawal must be stamped here.
  await db.consentRecord.update({
    where: { id: booking.consentRecordId },
    data: { withdrawnAt: new Date() },
  });
  return { cancelled: true };
}

export interface UpcomingSlot {
  id: string;
  venueName: string;
  venueAddress: string;
  startsAt: Date;
  capacity: number;
  notes: string | null;
  remaining: number;
}

export interface UpcomingSlotsResult {
  slots: UpcomingSlot[];
  /** The caller's own live booking on a future slot, if any. */
  ownBooking: (PilotSlotBooking & { slot: { venueName: string; venueAddress: string; startsAt: Date; notes: string | null } }) | null;
}

export async function listUpcomingSlots(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<UpcomingSlotsResult> {
  const now = new Date();
  const [slots, counts, ownBooking] = await Promise.all([
    db.pilotSlot.findMany({
      where: { startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    }),
    db.pilotSlotBooking.groupBy({
      by: ['slotId'],
      where: { status: 'booked', slot: { startsAt: { gt: now } } },
      _count: { _all: true },
    }),
    db.pilotSlotBooking.findFirst({
      where: { userId, status: 'booked', slot: { startsAt: { gt: now } } },
      include: {
        slot: { select: { venueName: true, venueAddress: true, startsAt: true, notes: true } },
      },
    }),
  ]);

  const bookedBySlot = new Map(counts.map((c) => [c.slotId, c._count._all]));
  return {
    slots: slots.map((s) => ({
      id: s.id,
      venueName: s.venueName,
      venueAddress: s.venueAddress,
      startsAt: s.startsAt,
      capacity: s.capacity,
      notes: s.notes,
      remaining: Math.max(0, s.capacity - (bookedBySlot.get(s.id) ?? 0)),
    })),
    ownBooking,
  };
}
