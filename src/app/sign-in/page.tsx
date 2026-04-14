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
      <header className="px-5 pt-6">
        <Link
          href="/"
          className="font-mono text-label tracking-[0.2em] text-text-primary uppercase"
        >
          Morning Form
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="font-serif text-[2rem] leading-[1.15] tracking-tight text-text-primary">
            Welcome back.
          </h1>
          <p className="mt-4 text-body text-text-secondary">
            Sign in with your email to return to your protocol.
          </p>

          <p className="mt-4 text-caption text-text-tertiary border border-border rounded-input px-3 py-2">
            Dev sign-in · data writes are still scoped to the seeded demo account until real auth ships.
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
            <Button type="submit" fullWidth loading={loading} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </Button>
          </div>

          <p className="mt-6 text-caption text-text-tertiary text-center">
            New here?{' '}
            <Link href="/onboarding" className="text-text-secondary hover:text-text-primary transition-colors">
              Begin assessment
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
