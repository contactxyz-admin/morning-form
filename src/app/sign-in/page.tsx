'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SignInPage() {
  const [email, setEmail] = useState('demo@morningform.com');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Sign in failed.');
        setLoading(false);
        return;
      }

      router.push(data.redirectTo || '/home');
      router.refresh();
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Sign in failed. Try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-5 sm:px-8 pt-8">
        <Link href="/" className="text-label uppercase text-text-tertiary hover:text-text-primary transition-colors">
          Morning Form
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8">
        <form onSubmit={handleSubmit} className="w-full max-w-md">
          <p className="text-label uppercase text-text-tertiary mb-4">Return</p>
          <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.035em] leading-[1.05]">
            Welcome <span className="italic font-light">back</span>.
          </h1>
          <p className="mt-5 text-body-lg text-text-secondary">
            Sign in with your email to return to your protocol.
          </p>

          <p className="mt-5 text-caption text-text-tertiary border border-border-strong rounded-card-sm px-4 py-3 bg-surface-warm/60">
            Dev sign-in · data writes are still scoped to the seeded demo account until real auth
            ships.
          </p>

          <div className="mt-10">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error || undefined}
              disabled={loading}
            />
          </div>

          <div className="mt-8">
            <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </Button>
          </div>

          <p className="mt-8 text-caption text-text-tertiary text-center">
            New here?{' '}
            <Link
              href="/onboarding"
              className="text-text-secondary hover:text-text-primary transition-colors underline-offset-4 hover:underline"
            >
              Begin assessment
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
