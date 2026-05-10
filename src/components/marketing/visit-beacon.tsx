'use client';

import { useEffect, useRef } from 'react';
import type { CohortKey } from '@/lib/marketing/cohorts';
import type { Market } from '@/lib/marketing/constants';

interface VisitBeaconProps {
  slug: string;
  cohort: CohortKey;
  market: Market;
}

/**
 * Fires one POST /api/marketing/visit per page-load. Schema-level dedupe
 * collapses reload-within-1-minute spam onto a single LandingPageVisit
 * row, so the client-side guard here is a cheap belt-and-braces against
 * React StrictMode double-renders in dev rather than a correctness rule.
 *
 * Renders nothing — the only side effect is the network call. Failures
 * are swallowed (analytics is non-load-bearing for the page render).
 */
export function VisitBeacon({ slug, cohort, market }: VisitBeaconProps) {
  // Module-scope-equivalent ref so the StrictMode double-effect in dev
  // does not produce two POSTs per page-load. Production has no double
  // render; the guard is harmless either way.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fetch('/api/marketing/visit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        cohort,
        market,
        referrer: typeof document === 'undefined' ? undefined : document.referrer || undefined,
      }),
      keepalive: true,
    }).catch(() => {
      // Analytics best-effort. Silent failure preserves page experience.
    });
  }, [slug, cohort, market]);

  return null;
}
