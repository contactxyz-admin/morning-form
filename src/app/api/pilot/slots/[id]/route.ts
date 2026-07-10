/**
 * DELETE /api/pilot/slots/[id] — staff-only. Refuses (409) while any LIVE
 * booking exists: staff must cancel members first, so the FK cascade only
 * ever sweeps cancelled history with the slot.
 *
 * The live-booking check and the delete run in one transaction under the
 * same `pilot-slot:` advisory lock bookSlot takes — without it, a member
 * booking between the check and the delete would be silently cascaded away
 * while holding a confirmation email. (Slot lock only; bookSlot's user→slot
 * lock order stays deadlock-free since we never take a user lock here.)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePilotStaff } from '@/lib/pilot/guard';

export const dynamic = 'force-dynamic';

class LiveBookingsError extends Error {
  constructor(public readonly count: number) {
    super(`slot has ${count} live booking(s)`);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requirePilotStaff();
  if (!guard.ok) return guard.response;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pilot-slot:' + params.id})::bigint)`;
      const liveBookings = await tx.pilotSlotBooking.count({
        where: { slotId: params.id, status: 'booked' },
      });
      if (liveBookings > 0) {
        throw new LiveBookingsError(liveBookings);
      }
      await tx.pilotSlot.delete({ where: { id: params.id } });
    });
  } catch (err) {
    if (err instanceof LiveBookingsError) {
      return NextResponse.json(
        { error: `Slot has ${err.count} live booking(s) — cancel them first.` },
        { status: 409 },
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
