'use client';

/**
 * Staff slot CRUD: list with live booking counts + member emails, a small
 * create form, and delete (server refuses while live bookings exist).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ManagedSlot {
  id: string;
  venueName: string;
  venueAddress: string;
  startsAt: string;
  capacity: number;
  notes: string | null;
  bookings: { id: string; memberEmail: string; memberName: string | null }[];
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

export function ManageClient({ initialSlots }: { initialSlots: ManagedSlot[] }) {
  const router = useRouter();
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSlot() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/pilot/slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          venueName: venueName.trim(),
          venueAddress: venueAddress.trim(),
          // datetime-local is zone-less; new Date() interprets it in the
          // BROWSER's zone. Accepted v1 tradeoff: founders create slots from
          // the UK, so browser zone == Europe/London == the wall-clock they
          // mean. Creating slots from abroad WOULD store a shifted instant —
          // but the list below re-renders in Europe/London, so the mistake is
          // visible immediately after creating.
          startsAt: startsAt ? new Date(startsAt).toISOString() : '',
          capacity: Number(capacity),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Create failed.');
        return;
      }
      setVenueName('');
      setVenueAddress('');
      setStartsAt('');
      setCapacity('1');
      setNotes('');
      router.refresh();
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSlot(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/pilot/slots/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Delete failed.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — try again.');
    }
  }

  const inputClass =
    'w-full border border-border rounded-card px-3 py-2 text-body text-text-primary bg-bg';

  return (
    <div className="mt-8">
      {error && <p className="mb-3 text-caption text-red-700">{error}</p>}

      <div className="border border-border rounded-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          New slot
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={inputClass} placeholder="Venue name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
          <input className={inputClass} placeholder="Venue address" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
          <input className={inputClass} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <input className={inputClass} type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <input className={`${inputClass} mt-2`} placeholder="Prep notes shown to members (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button
          type="button"
          disabled={submitting || !venueName.trim() || !venueAddress.trim() || !startsAt}
          onClick={() => void createSlot()}
          className="mt-3 rounded-full bg-text-primary text-bg px-5 py-2 text-body font-medium disabled:opacity-50"
        >
          Create slot
        </button>
      </div>

      <ul className="mt-6 space-y-3">
        {initialSlots.map((slot) => (
          <li key={slot.id} className="border border-border rounded-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body text-text-primary">
                  {slot.venueName} · {formatSlot(slot.startsAt)} (UK)
                </p>
                <p className="mt-0.5 text-caption text-text-tertiary">{slot.venueAddress}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                  {slot.bookings.length}/{slot.capacity} booked
                </p>
                {slot.bookings.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {slot.bookings.map((b) => (
                      <li key={b.id} className="text-caption text-text-secondary">
                        {b.memberName ? `${b.memberName} · ` : ''}
                        {b.memberEmail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => void deleteSlot(slot.id)}
                className="shrink-0 text-caption text-text-tertiary hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
