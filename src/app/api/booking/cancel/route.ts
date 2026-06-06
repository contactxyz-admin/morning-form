/**
 * POST /api/booking/cancel — cancel a concierge booking request (U3).
 *
 * Only `requested` bookings can be cancelled (user-initiated). Already
 * arranged/delivered/cancelled bookings return 409. User-scoped: only
 * the owning user can cancel their own request.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  bookingId: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  if (env.CONCIERGE_BOOKING_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Concierge booking is not enabled.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const booking = await prisma.bookingRequest.findUnique({
    where: { id: body.bookingId },
    select: { id: true, userId: true, status: true },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }

  if (booking.userId !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  if (booking.status !== 'requested') {
    return NextResponse.json(
      { error: `Cannot cancel a ${booking.status} booking. Only requested bookings can be cancelled.` },
      { status: 409 },
    );
  }

  await prisma.bookingRequest.update({
    where: { id: booking.id },
    data: { status: 'cancelled' },
  });

  return NextResponse.json({ id: booking.id, status: 'cancelled' });
}
