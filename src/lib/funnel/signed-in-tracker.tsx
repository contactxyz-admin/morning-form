'use client';

/**
 * Reads `?signed_in=1` (set by /api/auth/verify on redirect) and fires
 * the sign_in_completed funnel event exactly once, then strips the
 * query param via history.replaceState so a reload doesn't refire.
 *
 * Used on /record (the dominant post-signin destination). Server-side
 * firing isn't possible because the funnelId lives in localStorage on
 * the client, not in a cookie the server can read.
 */
import { useEffect } from 'react';
import { track } from './track';
import { FUNNEL_EVENTS } from './event';

export function SignedInTracker(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('signed_in') !== '1') return;

    track(FUNNEL_EVENTS.SIGN_IN_COMPLETED);

    // Strip the param so a reload or share-URL doesn't refire.
    url.searchParams.delete('signed_in');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, []);
  return null;
}
