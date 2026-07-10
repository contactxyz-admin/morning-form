/**
 * /book — member-facing in-gym draw booking (pilot MVP plan 2026-07-04).
 * Flag off -> redirect home (the /decisions member-page precedent); no
 * session -> sign-in. Slots + own booking are server-loaded and handed to
 * the client state machine (pick → consent → confirm).
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isInGymBookingEnabled } from '@/lib/pilot/config';
import { listUpcomingSlots } from '@/lib/pilot/booking';
import { BookClient } from './book-client';

export const dynamic = 'force-dynamic';

export default async function BookPage() {
  if (!isInGymBookingEnabled()) {
    redirect('/home');
  }
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const { slots, ownBooking } = await listUpcomingSlots(prisma, user.id);

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Book your blood draw
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Pick a slot at one of our partner gym events. The draw takes about ten minutes; results
          land in your Morning Form record.
        </p>
        <BookClient
          initialSlots={slots.map((s) => ({
            id: s.id,
            venueName: s.venueName,
            venueAddress: s.venueAddress,
            startsAt: s.startsAt.toISOString(),
            notes: s.notes,
            remaining: s.remaining,
          }))}
          initialOwnBooking={
            ownBooking
              ? {
                  id: ownBooking.id,
                  venueName: ownBooking.slot.venueName,
                  venueAddress: ownBooking.slot.venueAddress,
                  startsAt: ownBooking.slot.startsAt.toISOString(),
                  notes: ownBooking.slot.notes,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
