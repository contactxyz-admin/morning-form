'use client';

/**
 * The booking state machine: pick a slot (Chip picker per the demo
 * studio-booking-card prototype) → procedure consent (ConsentStep, W1) →
 * confirm POST → booked card with cancel. If a live booking exists, the
 * booked state renders instead of the picker.
 */
import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { ConsentStep } from '@/components/pilot/consent-step';

export interface BookableSlot {
  id: string;
  venueName: string;
  venueAddress: string;
  startsAt: string;
  notes: string | null;
  remaining: number;
}

export interface OwnBookingView {
  id: string;
  venueName: string;
  venueAddress: string;
  startsAt: string;
  notes: string | null;
}

function formatSlotLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });
}

export function BookClient({
  initialSlots,
  initialOwnBooking,
}: {
  initialSlots: BookableSlot[];
  initialOwnBooking: OwnBookingView | null;
}) {
  const [ownBooking, setOwnBooking] = useState(initialOwnBooking);
  const [slots, setSlots] = useState(initialSlots);
  const [picked, setPicked] = useState<BookableSlot | null>(null);
  const [signedName, setSignedName] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slots grouped venue+day for rendering, preserving startsAt order.
  const groups = useMemo(() => {
    const map = new Map<string, { venueName: string; venueAddress: string; day: string; slots: BookableSlot[] }>();
    for (const slot of slots) {
      const day = formatDayLabel(slot.startsAt);
      const key = `${slot.venueName}|${day}`;
      const existing = map.get(key);
      if (existing) existing.slots.push(slot);
      else map.set(key, { venueName: slot.venueName, venueAddress: slot.venueAddress, day, slots: [slot] });
    }
    return Array.from(map.values());
  }, [slots]);

  async function refreshSlots() {
    try {
      const res = await fetch('/api/pilot/slots');
      if (!res.ok) return;
      const data = (await res.json()) as { slots: BookableSlot[]; ownBooking: { id: string; slot: OwnBookingView } | null };
      setSlots(data.slots);
      // Adopt a booking made elsewhere (second tab/device) so this view can
      // never dead-end on "you already have an active booking".
      if (data.ownBooking) {
        setOwnBooking({ ...data.ownBooking.slot, id: data.ownBooking.id });
        setPicked(null);
      }
    } catch {
      // Non-fatal — the user can reload.
    }
  }

  async function confirmBooking() {
    if (!picked) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/pilot/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotId: picked.id, signedName: signedName.trim(), consentAccepted }),
      });
      const data = (await res.json()) as { booking?: { id: string }; error?: string; code?: string };
      if (!res.ok || !data.booking) {
        setError(data.error ?? 'Something went wrong — refresh and try again.');
        if (data.code === 'slot_full') {
          setPicked(null);
          void refreshSlots();
        }
        // Booked in another tab/device: refetch adopts the existing booking
        // and flips this view to the booked card instead of dead-ending.
        if (data.code === 'active_booking_exists') {
          void refreshSlots();
        }
        return;
      }
      setOwnBooking({
        id: data.booking.id,
        venueName: picked.venueName,
        venueAddress: picked.venueAddress,
        startsAt: picked.startsAt,
        notes: picked.notes,
      });
      setPicked(null);
    } catch {
      setError('Network error — refresh and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!ownBooking) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pilot/bookings/${ownBooking.id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Cancel failed — refresh and try again.');
        return;
      }
      setOwnBooking(null);
      void refreshSlots();
    } catch {
      setError('Network error — refresh and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (ownBooking) {
    return (
      <div className="mt-8 border border-border rounded-card p-5 bg-surface">
        {error && <p className="mb-3 text-caption text-red-700">{error}</p>}
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          Booked
        </p>
        <p className="mt-2 text-body text-text-primary">
          {formatDayLabel(ownBooking.startsAt)} · {formatSlotLabel(ownBooking.startsAt)} (UK time)
        </p>
        <p className="mt-1 text-caption text-text-secondary">
          {ownBooking.venueName}, {ownBooking.venueAddress}
        </p>
        {ownBooking.notes && (
          <p className="mt-2 text-caption text-text-secondary">Preparation: {ownBooking.notes}</p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void cancel()}
          className="mt-4 text-body text-text-tertiary hover:text-text-secondary disabled:opacity-50"
        >
          Cancel this booking
        </button>
      </div>
    );
  }

  if (picked) {
    return (
      <div className="mt-8">
        {error && <p className="mb-3 text-caption text-red-700">{error}</p>}
        <p className="text-body text-text-primary">
          {picked.venueName} · {formatDayLabel(picked.startsAt)} · {formatSlotLabel(picked.startsAt)}{' '}
          (UK time)
        </p>
        <div className="mt-4">
          <ConsentStep
            signedName={signedName}
            onSignedNameChange={setSignedName}
            consentAccepted={consentAccepted}
            onConsentAcceptedChange={setConsentAccepted}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={submitting || !consentAccepted || signedName.trim().length < 2}
            onClick={() => void confirmBooking()}
            className="rounded-full bg-text-primary text-bg px-5 py-2 text-body font-medium disabled:opacity-50"
          >
            Confirm booking
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setPicked(null)}
            className="text-body text-text-tertiary hover:text-text-secondary"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="mt-10 text-body text-text-secondary">
        No upcoming draw events right now — check back soon.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-caption text-red-700">{error}</p>}
      {groups.map((group) => (
        <div key={`${group.venueName}-${group.day}`} className="border border-border rounded-card p-5">
          <p className="text-body text-text-primary">{group.venueName}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{group.venueAddress}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
            {group.day}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {group.slots.map((slot) => (
              <Chip
                key={slot.id}
                onClick={() => slot.remaining > 0 && setPicked(slot)}
                className={slot.remaining === 0 ? 'opacity-50 cursor-not-allowed' : undefined}
              >
                {formatSlotLabel(slot.startsAt)}
                {slot.remaining === 0 ? ' · full' : ''}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
