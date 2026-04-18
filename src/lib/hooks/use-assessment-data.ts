'use client';

import { useEffect, useState } from 'react';
import type { Protocol, StateProfile } from '@/types';

type AssessmentData = { stateProfile: StateProfile; protocol: Protocol };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: AssessmentData }
  | { kind: 'unauthenticated' }
  | { kind: 'not-onboarded' }
  | { kind: 'error'; message: string };

/**
 * Fetches the persisted assessment output (state profile + protocol) for the
 * current user. Shared across /reveal/profile, /reveal/protocol, and
 * /reveal/rationale so each page renders real data rather than mock fixtures.
 *
 * Returns discriminated states so callers can route (e.g. not-onboarded →
 * /assessment) without re-deriving the response shape.
 */
export function useAssessmentData(): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/assessment');
        if (cancelled) return;
        if (res.status === 401) {
          setState({ kind: 'unauthenticated' });
          return;
        }
        if (res.status === 404) {
          setState({ kind: 'not-onboarded' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as AssessmentData;
        if (!cancelled) setState({ kind: 'ready', data });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load',
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
