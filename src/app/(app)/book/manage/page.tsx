/**
 * /book/manage — staff slot management (pilot MVP plan 2026-07-04). A
 * separate page from /book so the member surface carries no staff
 * conditionals. Gated like /ops: flag -> redirect, session -> sign-in,
 * non-staff -> restricted message with zero data fetched.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isStaff } from '@/lib/ops/config';
import { isInGymBookingEnabled } from '@/lib/pilot/config';
import { ManageClient } from './manage-client';

export const dynamic = 'force-dynamic';

export default async function ManageSlotsPage() {
  if (!isInGymBookingEnabled()) {
    redirect('/home');
  }
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (!isStaff(user.email)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <p className="text-body text-text-secondary">This page is restricted to Morning Form staff.</p>
      </div>
    );
  }

  const slots = await prisma.pilotSlot.findMany({
    orderBy: { startsAt: 'asc' },
    include: {
      bookings: {
        where: { status: 'booked' },
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display font-light text-display-sm text-text-primary -tracking-[0.03em] leading-[1.1]">
          Draw slots — manage
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Create event-day slots and see who&rsquo;s booked. Deleting a slot requires cancelling its
          live bookings first.
        </p>
        <ManageClient
          initialSlots={slots.map((s) => ({
            id: s.id,
            venueName: s.venueName,
            venueAddress: s.venueAddress,
            startsAt: s.startsAt.toISOString(),
            capacity: s.capacity,
            notes: s.notes,
            bookings: s.bookings.map((b) => ({
              id: b.id,
              memberEmail: b.user.email,
              memberName: b.user.name,
            })),
          }))}
        />
      </div>
    </div>
  );
}
