'use client';

/**
 * Booking status block — client interactions for the Phase B timeline seed
 * (Plan 2026-06-06-001 U4).
 *
 * Renders the user's booking requests with two affordances:
 *   - Cancel (requested only) — JS fetch with application/json (the native HTML
 *     form posted form-encoded to a JSON route, which always 400'd — review
 *     SEC-005).
 *   - Reveal redemption code (delivered only) — one-time POST to
 *     /api/booking/reveal; the code is shown in-app, never emailed.
 */
import { useState } from 'react';

export interface BookingRow {
  id: string;
  markerNames: string[];
  status: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  requested: "We're arranging your test",
  arranged: 'Your test is ready to book',
  delivered: 'Ready — reveal your code',
  cancelled: 'Cancelled',
};

export function BookingStatusList({ bookings }: { bookings: BookingRow[] }) {
  return (
    <div className="mt-10 pt-6 border-t border-border">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-4">
        Your test requests
      </h2>
      <ul className="space-y-3">
        {bookings.map((b) => (
          <BookingItem key={b.id} booking={b} />
        ))}
      </ul>
    </div>
  );
}

function BookingItem({ booking }: { booking: BookingRow }) {
  const [status, setStatus] = useState(booking.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [codeConsumed, setCodeConsumed] = useState(false);

  async function cancel() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (res.ok) {
        setStatus('cancelled');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not cancel.');
    } catch {
      setError('Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/booking/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedCode(data.code);
        return;
      }
      if (res.status === 410) {
        setCodeConsumed(true);
        setError('This code has already been revealed.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not reveal the code.');
    } catch {
      setError('Could not reveal the code.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'cancelled') return null;

  return (
    <li className="border border-border rounded-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-body text-text-primary">
          {booking.markerNames.join(', ') || 'Blood test'}
        </p>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
            status === 'delivered'
              ? 'text-positive'
              : status === 'arranged'
                ? 'text-brand-blue-900'
                : 'text-caution'
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-text-tertiary">
        Ref: {booking.id.slice(0, 8)} ·{' '}
        {new Date(booking.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>

      {revealedCode && (
        <div className="mt-3 rounded-card border border-positive/40 bg-positive-light p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
            Your redemption code
          </p>
          <p className="mt-1 font-mono text-body text-text-primary break-all">{revealedCode}</p>
          <p className="mt-2 text-caption text-text-tertiary leading-relaxed">
            Copy this now — for your security it&apos;s shown only once and is not stored after this.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-caption text-alert leading-relaxed">{error}</p>}

      {status === 'requested' && (
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="mt-2 font-mono text-[10px] text-text-tertiary hover:text-alert transition-colors disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Cancel request'}
        </button>
      )}

      {status === 'delivered' && !revealedCode && !codeConsumed && (
        <button
          type="button"
          onClick={reveal}
          disabled={busy}
          className="mt-2 inline-flex px-4 py-2 rounded-card bg-text-primary text-bg text-caption disabled:opacity-50 transition-opacity"
        >
          {busy ? 'Revealing…' : 'Reveal redemption code'}
        </button>
      )}
    </li>
  );
}
