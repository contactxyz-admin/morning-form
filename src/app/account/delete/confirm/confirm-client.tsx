'use client';

import { useState } from 'react';

/**
 * Client half of the deletion confirmation page. Renders the final
 * "permanently delete" control behind a typed-confirmation input. Performs NO
 * action on mount — erasure is triggered only by the explicit button click,
 * which POSTs the token (plus the active session cookie) to the confirm API.
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
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <h1>Confirmation link incomplete</h1>
        <p>This link is missing its confirmation token. Request account deletion again from Settings.</p>
      </main>
    );
  }

  if (state === 'done') {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <h1>Your account has been deleted</h1>
        <p>All of your data has been permanently erased. You have been signed out.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1>Permanently delete your account</h1>
      <p>
        This is irreversible. All of your data — assessments, check-ins, records, and uploaded files —
        will be permanently erased. A surviving audit record retains only non-identifying proof that the
        deletion happened.
      </p>
      <label htmlFor="confirm-delete" style={{ display: 'block', marginTop: '1.5rem', fontWeight: 600 }}>
        Type DELETE to confirm
      </label>
      <input
        id="confirm-delete"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoComplete="off"
        style={{ display: 'block', marginTop: '0.5rem', padding: '0.5rem', width: '100%' }}
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!armed || state === 'working'}
        style={{ marginTop: '1.5rem', padding: '0.75rem 1.25rem' }}
      >
        {state === 'working' ? 'Deleting…' : 'Permanently delete my account'}
      </button>
      {state === 'error' && (
        <p role="alert" style={{ marginTop: '1rem', color: '#b00020' }}>
          {message}
        </p>
      )}
    </main>
  );
}
