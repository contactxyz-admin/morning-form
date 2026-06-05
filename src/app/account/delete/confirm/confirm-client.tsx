'use client';

import { useState } from 'react';

/**
 * Client half of the deletion confirmation page. Renders the final
 * "permanently delete" control behind a typed-confirmation input. Performs NO
 * action on mount — erasure is triggered only by the explicit button click,
 * which POSTs the token (plus the active session cookie) to the confirm API.
 *
 * Styled to the app's design language (Fraunces display heading, body/caption
 * type scale, border-b input) even though the route sits outside the (app)
 * layout group — this is the page real users land on from the deletion email.
 */
export function DeleteConfirmClient({ token }: { token: string }) {
  const [confirmText, setConfirmText] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const armed = confirmText.trim() === 'DELETE' && token.length > 0;

  async function onConfirm() {
    if (!armed || state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/account/delete/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setState('done');
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setState('error');
      setMessage(body?.error ?? 'Deletion could not be completed.');
    } catch {
      setState('error');
      setMessage('Network error. Please try again.');
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="font-display font-light text-display-sm text-text-primary -tracking-[0.035em] leading-[1.05]">
          Confirmation link incomplete
        </h1>
        <p className="mt-6 text-body text-text-secondary leading-relaxed">
          This link is missing its confirmation token. Request account deletion again from
          Settings.
        </p>
      </main>
    );
  }

  if (state === 'done') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="font-display font-light text-display-sm text-text-primary -tracking-[0.035em] leading-[1.05]">
          Your account has been deleted
        </h1>
        <p className="mt-6 text-body text-text-secondary leading-relaxed">
          All of your data has been permanently erased. You have been signed out.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display font-light text-display-sm text-text-primary -tracking-[0.035em] leading-[1.05]">
        Permanently delete your account
      </h1>
      <p className="mt-6 text-body text-text-secondary leading-relaxed">
        This is irreversible. All of your data — assessments, check-ins, records, and uploaded
        files — will be permanently erased. A surviving audit record retains only non-identifying
        proof that the deletion happened.
      </p>
      {/* Wrap input + button in a form so an Enter keypress routes through the
          same guarded onConfirm (which no-ops when not armed / already working)
          rather than bypassing the working-state guard. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onConfirm();
        }}
      >
        <label htmlFor="confirm-delete" className="mt-10 block text-caption text-text-tertiary">
          Type DELETE to confirm
        </label>
        <input
          id="confirm-delete"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          placeholder="DELETE"
          className="mt-2 w-full bg-transparent border-b border-border focus:border-alert outline-none text-body text-text-primary py-1.5 font-mono placeholder:text-text-tertiary placeholder:font-mono transition-colors duration-300 ease-spring"
        />
        <button
          type="submit"
          disabled={!armed || state === 'working'}
          className="mt-8 text-body text-alert hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === 'working' ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </form>
      {state === 'error' && (
        <p role="alert" className="mt-4 text-caption text-alert">
          {message}
        </p>
      )}
    </main>
  );
}
