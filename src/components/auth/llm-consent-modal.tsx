'use client';

/**
 * One-time LLM consent capture. Surfaced when an LLM-bearing route
 * returns 412 with `{ requiresConsent: true }` — the user has signed up
 * but never consented to LLM processing.
 *
 * Pre-2026-05-15 this prose lived inside the /onboarding ConsentStep and
 * fired before any user action. Post-pivot, consent is captured lazily
 * at the moment of first LLM use — see plan
 * docs/plans/2026-05-15-002-feat-lead-gen-signup-and-optional-assessment-plan.md.
 *
 * On accept: POSTs /api/user/consent, then calls onAccepted so the caller
 * can retry the original request.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  /** Whether the modal is currently open */
  open: boolean;
  /** Called after the consent POST returns 204 — caller retries its request */
  onAccepted: () => void;
  /** Called when the user dismisses without accepting (closes the original action) */
  onCancel: () => void;
}

export function LlmConsentModal({ open, onAccepted, onCancel }: Props) {
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAccept = async () => {
    if (!consented || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/user/consent', { method: 'POST' });
      if (!res.ok) {
        setError(`Could not save consent (HTTP ${res.status}). Try again.`);
        setSubmitting(false);
        return;
      }
      onAccepted();
    } catch {
      setError('Could not save consent. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm px-5 py-10 overflow-auto">
      <Card variant="paper" className="max-w-xl w-full">
        <p className="text-label uppercase text-text-tertiary">Before we use AI</p>
        <h2 className="mt-2 font-display font-light text-display-sm text-text-primary -tracking-[0.03em] leading-[1.15]">
          A note on <span className="italic font-light">how we process your data</span>.
        </h2>

        <div className="mt-6 space-y-4 text-body text-text-secondary leading-relaxed max-w-prose -tracking-[0.005em]">
          <p>
            Morning Form is a health information, interpretation, and decision-support
            service. It is not a medical device and does not replace clinical advice.
          </p>
          <p>
            Your health data will be shared with our LLM sub-processor — Anthropic PBC
            (United States) — under contract for generating interpretations. Anthropic
            processes your data under a zero-retention, no-training commitment. You can
            withdraw consent at any time in Settings → Privacy.
          </p>
          <p>
            Cross-border transfer is covered by the UK-US Data Bridge adequacy decision,
            with Standard Contractual Clauses as fallback. Full sub-processor disclosure
            is available on the{' '}
            <Link
              href="/settings/privacy"
              className="text-accent hover:underline underline-offset-4"
            >
              Privacy page
            </Link>
            .
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none mt-6 pt-2">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            disabled={submitting}
            aria-describedby="llm-consent-copy"
            className="mt-1 h-4 w-4 rounded border-border-strong text-accent focus:ring-accent cursor-pointer"
          />
          <span id="llm-consent-copy" className="text-caption text-text-primary">
            I consent to Morning Form processing my health data, including sharing it
            with Anthropic PBC for LLM-based interpretation as described above.
          </span>
        </label>

        {error && (
          <p className="mt-4 text-caption text-alert" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8 flex gap-3 justify-end flex-wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Not now
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!consented || submitting}
            onClick={handleAccept}
          >
            {submitting ? 'Saving…' : 'I accept'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
