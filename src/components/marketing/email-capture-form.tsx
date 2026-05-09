'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { CohortKey } from '@/lib/marketing/cohorts';
import type { Market } from '@/lib/marketing/constants';

interface EmailCaptureFormProps {
  market: Market;
  /**
   * Cohort + slug make the form usable on both anchor pages and the
   * market homepage. The market homepage passes a synthetic cohort
   * (e.g. 'fatigue' as the first-listed cluster) plus the slug 'home'
   * so the funnel still attributes the signup back to a marketing page.
   */
  cohort: CohortKey;
  slug: string;
  buttonLabel: string;
  caption?: string;
}

type Status = 'idle' | 'sent' | 'error' | 'rate_limited';

/**
 * Phase 0 conversion CTA. Submits the visitor's email + signup context
 * to /api/auth/request-link, which persists the attribution on User
 * creation (first signup only — never overwrites returning users).
 *
 * The form swaps to a "check your email" state on success so the
 * visitor knows the magic link is on the way without a full page nav.
 */
export function EmailCaptureForm({
  market,
  cohort,
  slug,
  buttonLabel,
  caption,
}: EmailCaptureFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/request-link', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            signupContext: { market, cohort, slug },
          }),
        });
        if (res.status === 429) {
          setStatus('rate_limited');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        setStatus('sent');
      } catch {
        setStatus('error');
      }
    });
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
          Check your inbox.
        </p>
        <p className="text-body text-text-secondary leading-relaxed max-w-md">
          We&rsquo;ve sent a one-time link to {email}. Open it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          className="flex-1 min-w-[220px] rounded-card border border-border bg-surface px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
          disabled={pending}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Sending…' : buttonLabel}
        </Button>
      </div>
      {status === 'rate_limited' ? (
        <p className="text-caption text-caution">
          Too many requests. Try again in a few minutes.
        </p>
      ) : status === 'error' ? (
        <p className="text-caption text-caution">
          Something went wrong. Please try again.
        </p>
      ) : caption ? (
        <p className="text-caption text-text-tertiary">{caption}</p>
      ) : null}
    </form>
  );
}
