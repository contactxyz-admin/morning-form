/**
 * POST /api/pilot/bookings/[id]/cancel — member cancels their own booking
 * (which withdraws the procedure consent for that draw). CAS on
 * status='booked'; not-owned conflates to 404 (no enumeration leak);
 * refuses after the slot has started.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePilotMember } from '@/lib/pilot/guard';
import { cancelBooking } from '@/lib/pilot/booking';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requirePilotMember();
  if (!guard.ok) return guard.response;

  // Transaction: the status CAS and the consent withdrawnAt stamp must land
  // together — a cancelled booking with an un-stamped consent is exactly the
  // audit gap the stamp exists to close.
  const result = await prisma.$transaction((tx) =>
    cancelBooking(tx, {
      userId: guard.user.id,
      bookingId: params.id,
    }),
  );

  if (!result.cancelled) {
    switch (result.reason) {
      case 'not_found':
        return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      case 'slot_past':
        return NextResponse.json(
          { error: 'This slot has already started — it can no longer be cancelled online.' },
          { status: 409 },
        );
      default:
        return NextResponse.json({ error: 'Booking is already cancelled.' }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true });
}
