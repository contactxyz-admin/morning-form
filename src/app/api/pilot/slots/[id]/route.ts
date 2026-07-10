/**
 * DELETE /api/pilot/slots/[id] — staff-only. Refuses (409) while any LIVE
 * booking exists: staff must cancel members first, so the FK cascade only
 * ever sweeps cancelled history with the slot.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePilotStaff } from '@/lib/pilot/guard';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requirePilotStaff();
  if (!guard.ok) return guard.response;

  const liveBookings = await prisma.pilotSlotBooking.count({
    where: { slotId: params.id, status: 'booked' },
  });
  if (liveBookings > 0) {
    return NextResponse.json(
      { error: `Slot has ${liveBookings} live booking(s) — cancel them first.` },
      { status: 409 },
    );
  }

  try {
    await prisma.pilotSlot.delete({ where: { id: params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
