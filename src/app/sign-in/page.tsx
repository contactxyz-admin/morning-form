'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { track } from '@/lib/funnel/track';
import { FUNNEL_EVENTS, type AuthProvider } from '@/lib/funnel/event';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export default function SignInPage() {
  // Empty default — pre-filling demo@morningform.com would let an
  // unattentive new visitor on a preview env with ALLOW_DEMO_BYPASS=1
  // click "Send sign-in link" and get a one-click session as the demo
  // user via the verifyUrl bypass in /api/auth/request-link.
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus({ kind: 'error', message: 'Enter your email.' });
      return;
    }

    setStatus({ kind: 'loading' });

    // Funnel event — fires on every submit, including returning users
    // re-authenticating. Use the AuthProvider union so Phase B SSO
    // additions can't introduce typos that break analytics queries.
    // Returning-user inflation is acknowledged: dedup on (userId,
    // eventName) at the analytics consumer side; SIGNUP_COMPLETED is
    // the load-bearing conversion event and is server-side gated.
    const provider: AuthProvider = 'magic_link';
    track(FUNNEL_EVENTS.SIGNUP_INITIATED, { provider });

    try {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setStatus({
          kind: 'error',
          message: data.error || 'Too many requests. Try again in a few minutes.',
        });
        return;
      }
      if (!res.ok) {
        setStatus({ kind: 'error', message: data.error || 'Sign in failed.' });
        return;
      }

      // Dev demo bypass: server returns the raw verify URL so we can jump
      // straight into the /api/auth/verify flow without a mailbox roundtrip.
      if (typeof data.verifyUrl === 'string') {
        window.location.href = data.verifyUrl;
        return;
      }

      setStatus({ kind: 'sent' });
    } catch (err) {
      console.error(err);
      setStatus({ kind: 'error', message: 'Sign in failed. Try again.' });
    }
  };

  const loading = status.kind === 'loading';
  const sent = status.kind === 'sent';
  const errorMessage = status.kind === 'error' ? status.message : undefined;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-5 sm:px-8 pt-8">
        <Link
          href="/"
          className="text-label uppercase text-text-tertiary hover:text-text-primary transition-colors"
        >
          Morning Form
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8">
        <form onSubmit={handleSubmit} className="w-full max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
            Sign in · Create your account
          </p>
          <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.035em] leading-[1.05]">
            Sign in or create your <span className="italic font-light">account</span>.
          </h1>

          {sent ? (
            <>
              <p className="mt-6 text-body-lg text-text-secondary leading-relaxed max-w-prose -tracking-[0.005em]">
                Check your inbox. We&rsquo;ve sent a one-time link to{' '}
                <span className="text-text-primary">{email}</span> — open it on
                this device to continue. Links expire after 15 minutes.
              </p>
              <div className="mt-10">
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  size="lg"
                  onClick={() => setStatus({ kind: 'idle' })}
                >
                  Use a different email
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 text-body-lg text-text-secondary leading-relaxed max-w-prose -tracking-[0.005em]">
                Your full record — labs, wearables, and what they mean — ready
                in minutes. Magic link, no password; works whether you&rsquo;re
                new or returning.
              </p>

              <div className="mt-10">
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errorMessage}
                  disabled={loading}
                />
              </div>

              <div className="mt-8">
                <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
                  {loading ? 'Sending link…' : 'Continue with email →'}
                </Button>
              </div>

              {/*
               * Phase B: SSO providers (Google, Apple) slot in here, wired
               * when OAuth credentials are provisioned. Today the rule
               * stands alone to reserve the visual rhythm so the eventual
               * additions don't force a re-layout.
               */}
              <div
                className="mt-10 mb-8 flex items-center gap-4"
                aria-hidden="true"
              >
                <span className="flex-1 border-t border-border" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                  or
                </span>
                <span className="flex-1 border-t border-border" />
              </div>

              <p className="text-body text-text-secondary">
                Want to look around first?{' '}
                <Link
                  href="/demo"
                  className="text-text-primary underline-offset-4 hover:underline transition-colors duration-300 ease-spring"
                >
                  See a sample record →
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
