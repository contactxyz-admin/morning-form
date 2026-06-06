'use client';

/**
 * Concierge booking request form (Plan 2026-06-06-001 U3).
 *
 * Marker(s) pre-filled (server-validated against the canonical set on POST),
 * market confirmed (pre-filled from signupMarket), partner(s) NAMED before
 * submission (Article 13 disclosure at collection), and — for the US market —
 * a state input that blocks NY/NJ/RI inline. The state value is sent only for
 * the server's blocking check and is never persisted.
 *
 * POSTs application/json to /api/booking/request.
 */
import { useState } from 'react';

// Hard-blocked states, mirrored from content/test-routes so we can block inline
// before a round-trip. The server re-validates (and is the source of truth).
const BLOCKED_STATES = new Set(['NY', 'NJ', 'RI']);

interface Props {
  markerNames: string[];
  market: 'uk' | 'us';
  partnerNames: string[];
  /** Optional open `measure` Action to link. */
  actionId?: string;
}

export function BookingRequestForm({ markerNames, market, partnerNames, actionId }: Props) {
  const [usState, setUsState] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedState = usState.trim().toUpperCase();
  const stateBlockedInline = market === 'us' && BLOCKED_STATES.has(normalizedState);
  const stateMissing = market === 'us' && normalizedState.length !== 2;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/booking/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markerNames,
          market,
          ...(market === 'us' ? { usState: normalizedState } : {}),
          ...(actionId ? { actionId } : {}),
        }),
      });
      if (res.status === 201) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.guidance ?? data.error ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="mt-3 text-body text-text-secondary leading-relaxed">
        Request received. We&apos;ll email you when your test is ready to book — you&apos;ll
        reveal your redemption code here, in-app. You can cancel below any time before
        it&apos;s arranged.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-body text-text-secondary leading-relaxed">
        We arrange this for you through{' '}
        <strong className="text-text-primary">{partnerNames.join(' and ')}</strong>.
        You redeem the test under your own identity; your data stays between you and
        the lab until you choose to upload your results here.
      </p>

      {market === 'us' && (
        <div className="mt-4">
          <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
            Your US state
          </label>
          <input
            type="text"
            value={usState}
            onChange={(e) => setUsState(e.target.value)}
            maxLength={2}
            placeholder="e.g. CA"
            className="w-24 rounded-card border border-border bg-bg px-3 py-2 text-body text-text-primary uppercase focus:border-text-tertiary focus:outline-none"
            aria-label="US state two-letter code"
          />
          {stateBlockedInline && (
            <p className="mt-2 text-caption text-text-tertiary leading-relaxed">
              Direct-access testing isn&apos;t available in {normalizedState}. Your best
              path is through your primary care provider — they can order the same tests,
              and most insurers cover preventive blood work.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-caption text-alert leading-relaxed">{error}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || stateBlockedInline || stateMissing}
        className="mt-4 inline-flex px-5 py-2.5 rounded-card bg-text-primary text-bg text-body disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? 'Sending…' : 'Request this test →'}
      </button>
    </div>
  );
}
