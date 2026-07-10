/**
 * GET /api/pilot/slots — member-facing: upcoming slots with remaining
 * capacity plus the caller's own live booking (`createdBy` staff email is
 * never exposed to members).
 *
 * POST /api/pilot/slots — staff-only slot creation (event-day inventory).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePilotMember, requirePilotStaff } from '@/lib/pilot/guard';
import { listUpcomingSlots } from '@/lib/pilot/booking';
import { SLOT_CAPACITY_MAX, SLOT_CAPACITY_MIN } from '@/lib/pilot/config';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requirePilotMember();
  if (!guard.ok) return guard.response;

  const { slots, ownBooking } = await listUpcomingSlots(prisma, guard.user.id);
  return NextResponse.json({
    slots: slots.map((s) => ({
      id: s.id,
      venueName: s.venueName,
      venueAddress: s.venueAddress,
      startsAt: s.startsAt.toISOString(),
      notes: s.notes,
      remaining: s.remaining,
    })),
    ownBooking: ownBooking
      ? {
          id: ownBooking.id,
          slot: {
            venueName: ownBooking.slot.venueName,
            venueAddress: ownBooking.slot.venueAddress,
            startsAt: ownBooking.slot.startsAt.toISOString(),
            notes: ownBooking.slot.notes,
          },
        }
      : null,
  });
}

const CreateSlotSchema = z.object({
  venueName: z.string().trim().min(1).max(200),
  venueAddress: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'startsAt must be in the future',
  }),
  capacity: z.number().int().min(SLOT_CAPACITY_MIN).max(SLOT_CAPACITY_MAX).default(1),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requirePilotStaff();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof CreateSlotSchema>;
  try {
    body = CreateSlotSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slot = await prisma.pilotSlot.create({
    data: {
      venueName: body.venueName,
      venueAddress: body.venueAddress,
      startsAt: body.startsAt,
      capacity: body.capacity,
      notes: body.notes ?? null,
      createdBy: guard.user.email,
    },
  });

  return NextResponse.json({ slot }, { status: 201 });
}
