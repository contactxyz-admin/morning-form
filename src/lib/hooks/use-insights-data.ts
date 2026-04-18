'use client';

import { useEffect, useState } from 'react';
import type { EveningCheckIn, MorningCheckIn, WeeklyReview } from '@/types';

export type CheckInHistoryDay = {
  date: string;
  morning?: MorningCheckIn;
  evening?: EveningCheckIn;
};

export type HealthHistoryDay = {
  date: string;
  hrv: number | null;
  recoveryScore: number | null;
  sleepDuration: number | null;
  restingHR: number | null;
  steps: number | null;
};

export type InsightsData = {
  review: WeeklyReview;
  checkInHistory: CheckInHistoryDay[];
  healthHistory: HealthHistoryDay[];
};

export type InsightsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: InsightsData }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

type StoredCheckIn = {
  date: string;
  type: 'morning' | 'evening';
  responses: MorningCheckIn | EveningCheckIn;
};

function collapseCheckInsByDay(rows: StoredCheckIn[]): CheckInHistoryDay[] {
  const byDate = new Map<string, CheckInHistoryDay>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { date: row.date };
    if (row.type === 'morning') entry.morning = row.responses as MorningCheckIn;
    else entry.evening = row.responses as EveningCheckIn;
    byDate.set(row.date, entry);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Loads the three /insights data surfaces (weekly review, check-in history,
 * health history) in parallel. One failed request degrades the whole view to
 * `{ kind: 'error' }` — the page does not render a partial.
 *
 * Empty data is not an error: a signed-in user with zero check-ins returns
 * `{ kind: 'ready' }` with zeroed review counts, which the UI renders as
 * empty bars plus an empty-state caption.
 */
export function useInsightsData(): InsightsState {
  const [state, setState] = useState<InsightsState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [reviewRes, checkInRes, historyRes] = await Promise.all([
          fetch('/api/insights/weekly'),
          fetch('/api/check-in'),
          fetch('/api/insights/health-history?days=7'),
        ]);

        if (cancelled) return;

        if (reviewRes.status === 401 || checkInRes.status === 401 || historyRes.status === 401) {
          setState({ kind: 'unauthenticated' });
          return;
        }

        if (!reviewRes.ok || !checkInRes.ok || !historyRes.ok) {
          setState({
            kind: 'error',
            message: `HTTP ${reviewRes.status}/${checkInRes.status}/${historyRes.status}`,
          });
          return;
        }

        const [{ review }, { checkIns }, { history }] = (await Promise.all([
          reviewRes.json(),
          checkInRes.json(),
          historyRes.json(),
        ])) as [
          { review: WeeklyReview },
          { checkIns: StoredCheckIn[] },
          { history: HealthHistoryDay[] },
        ];

        if (cancelled) return;
        setState({
          kind: 'ready',
          data: {
            review,
            checkInHistory: collapseCheckInsByDay(checkIns),
            healthHistory: history,
          },
        });
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
