/**
 * POST /api/pilot/bookings — book a slot with atomic procedure consent.
 *
 * consentAccepted must be literally true and signedName is the typed
 * e-signature; both feed the ConsentRecord created inside the booking
 * transaction. Typed 409s (slot_full / active_booking_exists), 410 for a
 * past slot, idempotent 200 replay for a double-click on an already-booked
 * slot. Confirmation email + SLOT_BOOKED funnel event fire post-commit,
 * non-fatal, and only for a genuinely new/reactivated booking.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePilotMember } from '@/lib/pilot/guard';
import { BookingError, bookSlot } from '@/lib/pilot/booking';
import { PROCEDURE_CONSENT_VERSION } from '@/lib/pilot/consent';
import { checkAndConsumePilotBookingRateLimit } from '@/lib/booking/rate-limit';
import { sendSlotBookingConfirmationEmail } from '@/lib/pilot/booking-email';
import { writeFunnelEvent, FUNNEL_EVENTS } from '@/lib/funnel/event';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  slotId: z.string().min(1),
  signedName: z.string().trim().min(2).max(200),
  consentAccepted: z.literal(true),
  // The consent version the CLIENT actually rendered. The server stores its
  // own PROCEDURE_CONSENT_VERSION on the ConsentRecord, so a stale tab across
  // a version-bump deploy must be refused — otherwise vN gets recorded
  // against vN-1 text and the signature is no longer tied to what was seen.
  consentDocumentVersion: z.string().min(1).max(100),
});

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requirePilotMember();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.consentDocumentVersion !== PROCEDURE_CONSENT_VERSION) {
    return NextResponse.json(
      {
        error: 'The consent text has been updated since this page loaded — reload and re-read it.',
        code: 'consent_version_mismatch',
      },
      { status: 409 },
    );
  }

  if (!(await checkAndConsumePilotBookingRateLimit(prisma, guard.user.id))) {
    return NextResponse.json(
      { error: 'Too many booking attempts today — try again tomorrow or contact us.' },
      { status: 429 },
    );
  }

  let result;
  try {
    result = await bookSlot(prisma, {
      userId: guard.user.id,
      slotId: body.slotId,
      signedName: body.signedName,
    });
  } catch (err) {
    if (err instanceof BookingError) {
      switch (err.code) {
        case 'slot_not_found':
          return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
        case 'slot_past':
          return NextResponse.json({ error: 'This slot has already started.' }, { status: 410 });
        case 'slot_full':
          return NextResponse.json(
            { error: 'This slot is now full — pick another.', code: 'slot_full' },
            { status: 409 },
          );
        case 'active_booking_exists':
          return NextResponse.json(
            { error: 'You already have an active booking.', code: 'active_booking_exists' },
            { status: 409 },
          );
      }
    }
    // P2028: transaction timed out waiting on the slot advisory lock (an
    // event-day rush serializes on it) — retryable, same mapping as the
    // slot-delete route, not an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') {
      return NextResponse.json(
        { error: 'The slot is busy right now — try again in a moment.' },
        { status: 503 },
      );
    }
    throw err;
  }

  if (result.created) {
    // Post-commit, non-fatal: a booking must not fail because Resend or the
    // funnel write hiccuped — the confirmation is also visible in-app.
    try {
      const [slot, member] = await Promise.all([
        prisma.pilotSlot.findUnique({ where: { id: body.slotId } }),
        prisma.user.findUnique({ where: { id: guard.user.id }, select: { name: true } }),
      ]);
      if (slot) {
        await sendSlotBookingConfirmationEmail({
          to: guard.user.email,
          name: member?.name ?? null,
          venueName: slot.venueName,
          venueAddress: slot.venueAddress,
          startsAt: slot.startsAt,
          notes: slot.notes,
        });
      }
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error(`[pilot] booking confirmation email failed (non-fatal): ${msg}`);
    }
    try {
      await writeFunnelEvent(prisma, {
        // Opaque per-booking funnelId, matching the DRAW_COMPLETED precedent.
        funnelId: result.booking.id,
        userId: guard.user.id,
        event: FUNNEL_EVENTS.SLOT_BOOKED,
        properties: { slotId: body.slotId },
      });
    } catch (eventErr) {
      const msg = eventErr instanceof Error ? eventErr.message : String(eventErr);
      console.error(`[pilot] slot_booked funnel event failed (non-fatal): ${msg}`);
    }
  }

  return NextResponse.json(
    { booking: { id: result.booking.id, status: result.booking.status } },
    { status: result.created ? 201 : 200 },
  );
}
