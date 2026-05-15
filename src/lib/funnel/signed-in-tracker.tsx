'use client';

/**
 * Reads `?signed_in=1` (set by /api/auth/verify on redirect) and fires
 * the sign_in_completed funnel event exactly once, then strips the
 * query param via history.replaceState so a reload doesn't refire.
 *
 * Also reads `?new=1` (set when this is the user's first session ever)
 * and fires signup_completed alongside sign_in_completed in that case.
 * SIGN_IN_COMPLETED fires for every fresh session (returning users
 * included); SIGNUP_COMPLETED fires once, for the first-ever session.
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
    if (url.searchParams.get('new') === '1') {
      // Provider 'magic_link' until Phase B adds SSO; the verify route
      // doesn't currently distinguish providers beyond the auth path
      // taken (which today is magic-link only).
      track(FUNNEL_EVENTS.SIGNUP_COMPLETED, { provider: 'magic_link' });
    }

    // Strip both params so a reload or share-URL doesn't refire.
    url.searchParams.delete('signed_in');
    url.searchParams.delete('new');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, []);
  return null;
}
