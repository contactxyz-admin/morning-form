/**
 * POST /api/booking/reveal — one-time in-app redemption-code reveal
 * (Plan 2026-06-06-001 U4, review SEC-001 / correctness P0).
 *
 * The redemption code is NEVER in any email. It lives encrypted-at-rest on the
 * BookingRequest row and is revealed exactly once, behind the owning user's
 * session: this endpoint authenticates the user, verifies ownership AND
 * `delivered` status, decrypts the code, nulls the ciphertext column (so a
 * second call returns 410), and returns the plaintext once.
 *
 * The null happens BEFORE returning so a crash mid-response cannot re-expose the
 * code — at-most-once delivery is the safer failure mode here than at-least-once.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { decryptToken } from '@/lib/health/crypto';

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
    select: { id: true, userId: true, status: true, codeEncrypted: true },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }
  if (booking.userId !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }
  if (booking.status !== 'delivered') {
    return NextResponse.json(
      { error: 'No redemption code is available for this booking yet.' },
      { status: 409 },
    );
  }
  if (!booking.codeEncrypted) {
    return NextResponse.json(
      { error: 'This code has already been revealed.' },
      { status: 410 },
    );
  }

  // Decrypt before nulling so a decrypt failure doesn't destroy the ciphertext.
  let code: string;
  try {
    code = decryptToken(booking.codeEncrypted);
  } catch {
    return NextResponse.json(
      { error: 'Unable to reveal the code right now.' },
      { status: 500 },
    );
  }

  // One-time: null the ciphertext. Conditional on it still being present so two
  // concurrent reveals can't both succeed.
  const consumed = await prisma.bookingRequest.updateMany({
    where: { id: booking.id, codeEncrypted: { not: null } },
    data: { codeEncrypted: null },
  });
  if (consumed.count === 0) {
    return NextResponse.json(
      { error: 'This code has already been revealed.' },
      { status: 410 },
    );
  }

  return NextResponse.json({ code });
}
