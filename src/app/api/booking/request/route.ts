/**
 * POST /api/booking/request — concierge booking request (Plan 2026-06-06-001 U3).
 *
 * Flag-gated behind CONCIERGE_BOOKING_ENABLED. Creates a BookingRequest row,
 * sends a reference-only ops email, and returns confirmation. Ops-email
 * failure deletes the row and returns 502 (no orphan rows).
 *
 * US state is validated for blocking then DISCARDED — never persisted,
 * never logged, never emailed.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { isBlockedState } from '@/../content/test-routes/index';
import { sendEmail } from '@/lib/auth/email';
import { resolvePrioritiesContent } from '@/lib/priority-marker-engine';

export const dynamic = 'force-dynamic';

/** Canonical marker name set — derived from all archetype content at import time. */
const CANONICAL_MARKERS: Set<string> = (() => {
  const names = new Set<string>();
  const archetypes = [
    'sustained-activator', 'fragmented-sleeper', 'sympathetic-dominant',
    'flat-liner', 'over-stimulated', 'well-regulated',
  ];
  for (const key of archetypes) {
    const c = resolvePrioritiesContent(key);
    if (c) for (const m of c.markers) names.add(m.markerName);
  }
  return names;
})();

const BodySchema = z.object({
  markerNames: z.array(z.string().min(1).max(200)).min(1).max(5),
  market: z.enum(['uk', 'us']),
  /** Validated then discarded — never persisted. */
  usState: z.string().max(2).optional(),
  /** Optional Action id to link. */
  actionId: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Flag gate
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

  // Validate marker names against the canonical set.
  const invalid = body.markerNames.filter((n) => !CANONICAL_MARKERS.has(n));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown marker(s): ${invalid.join(', ')}` },
      { status: 400 },
    );
  }

  // US state: validate for blocking, then DISCARD.
  if (body.market === 'us' && body.usState) {
    if (isBlockedState('us', body.usState)) {
      return NextResponse.json(
        {
          error: 'Direct-access testing is not available in your state.',
          guidance: 'Your best path is through your primary care provider — they can order the same tests, and most insurers cover preventive blood work.',
        },
        { status: 422 },
      );
    }
  }
  // State value is NOT logged, stored, or forwarded beyond this check.

  // Create the booking row.
  const booking = await prisma.bookingRequest.create({
    data: {
      userId: user.id,
      markerNames: JSON.stringify(body.markerNames),
      market: body.market,
      status: 'requested',
      actionId: body.actionId ?? null,
    },
  });

  // Send ops email — reference only (no health data).
  // Row-then-email-then-delete-on-failure: no orphan rows.
  if (env.OPS_EMAIL) {
    try {
      await sendEmail({
        to: env.OPS_EMAIL,
        subject: `[morning-form] Booking request ${booking.id.slice(0, 8)}`,
        text: [
          `Booking reference: ${booking.id}`,
          `Status: ${booking.status}`,
          `Created: ${booking.createdAt.toISOString()}`,
          '',
          'View details via the authenticated ops mechanism.',
          'This email contains a booking reference only — no marker names, user identity, or health data.',
        ].join('\n'),
      });
    } catch {
      // Email failed — delete the row so there's no orphan.
      await prisma.bookingRequest.delete({ where: { id: booking.id } });
      return NextResponse.json(
        { error: 'Unable to process your request right now. Please try again.' },
        { status: 502 },
      );
    }
  }

  // User confirmation email (no code promises; names the partner; links status).
  // Non-blocking — if this fails, ops already has the reference.
  const partnerNames = body.market === 'uk' ? 'Medichecks' : 'Ulta Lab Tests';
  try {
    await sendEmail({
      to: user.email,
      subject: 'Your test request has been received',
      text: [
        `Hi ${user.name ?? 'there'},`,
        '',
        `We've received your request to arrange a blood test through ${partnerNames}.`,
        '',
        `Booking reference: ${booking.id.slice(0, 8)}`,
        '',
        'What happens next:',
        '1. Our team arranges the test for you (usually within 1–2 business days).',
        '2. You\'ll get an email when everything is ready — follow the link to view your redemption code in-app.',
        '3. You book your own draw under your own identity.',
        '',
        'You can cancel this request at any time before it\'s arranged.',
        '',
        '— MorningForm',
      ].join('\n'),
    });
  } catch (err) {
    console.error('[booking/request] user confirmation email failed (non-fatal):', err);
  }

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  }, { status: 201 });
}
