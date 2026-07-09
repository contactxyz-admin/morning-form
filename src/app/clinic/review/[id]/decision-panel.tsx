'use client';

/**
 * The clinician's approve/escalate controls. Escalate expands a required
 * reason plus marker checkboxes pre-checked to the lab-flagged subset (the
 * server applies the same default when none are sent; sending the explicit
 * checked set keeps what-the-clinician-saw and what-was-stored identical).
 * POST/error/confirm flow per booking-request-form.tsx.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface DecisionMarker {
  joinKey: string;
  displayName: string;
  flaggedOutOfRange: boolean;
}

export function DecisionPanel({ reviewId, markers }: { reviewId: string; markers: DecisionMarker[] }) {
  const router = useRouter();
  const [view, setView] = useState<'idle' | 'escalating'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(markers.filter((m) => m.flaggedOutOfRange).map((m) => m.joinKey)),
  );
  const [error, setError] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  async function submit(action: 'approve' | 'escalate') {
    setError(null);
    setSubmitting(true);
    try {
      const body =
        action === 'approve'
          ? { action }
          : { action, reason: reason.trim(), markerKeys: Array.from(checked) };
      const res = await fetch(`/api/clinic/reviews/${reviewId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        memberEmailSent?: boolean;
        opsEmailSent?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — refresh and try again.');
        return;
      }
      if (action === 'escalate' && data.memberEmailSent === false) {
        setEmailWarning(
          'The decision is recorded, but the member email failed to send — follow up manually.',
        );
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('Network error — refresh and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 border border-border rounded-card p-4 bg-surface">
        <p className="text-body text-text-primary">Decision recorded.</p>
        {emailWarning && <p className="mt-2 text-caption text-amber-800">{emailWarning}</p>}
      </div>
    );
  }

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="mt-8 border border-border rounded-card p-4">
      {error && <p className="mb-3 text-caption text-red-700">{error}</p>}
      {view === 'idle' ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit('approve')}
            className="rounded-full bg-text-primary text-bg px-5 py-2 text-body font-medium disabled:opacity-50"
          >
            Approve — no escalation
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setView('escalating')}
            className="rounded-full border border-border px-5 py-2 text-body text-text-primary disabled:opacity-50"
          >
            Escalate…
          </button>
        </div>
      ) : (
        <div>
          <p className="text-body text-text-primary">Escalate for a GP conversation</p>
          <p className="mt-1 text-caption text-text-secondary">
            Select the markers the escalation applies to and give a reason (recorded on the
            sign-off; not shown verbatim to the member).
          </p>
          <div className="mt-3 space-y-1">
            {markers.map((m) => (
              <label key={m.joinKey} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(m.joinKey)}
                  onChange={() => toggle(m.joinKey)}
                />
                <span className="text-caption text-text-primary">
                  {m.displayName}
                  {m.flaggedOutOfRange ? ' (lab-flagged)' : ''}
                </span>
              </label>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Clinical reason for escalation (min 10 characters)"
            rows={3}
            className="mt-3 w-full border border-border rounded-card px-3 py-2 text-body text-text-primary bg-bg"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={submitting || reason.trim().length < 10 || checked.size === 0}
              onClick={() => void submit('escalate')}
              className="rounded-full bg-text-primary text-bg px-5 py-2 text-body font-medium disabled:opacity-50"
            >
              Confirm escalation
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setView('idle')}
              className="text-body text-text-tertiary hover:text-text-secondary"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
