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

/** The minimal shape of each fetch arm the classifier needs (a subset of `Response`). */
export type ArmStatus = { ok: boolean; status: number };

/**
 * Pure classification of the three /insights arms by HTTP status, before any
 * body is read. Decides whether the page is unauthenticated, errored, or may
 * proceed — and which arms it is safe to read.
 *
 * Arm policy:
 * - weekly + check-in are REQUIRED: a non-ok response (other than 401) fails
 *   the whole page.
 * - health-history is OPTIONAL: it is plausible to fail (or be empty) for a
 *   user with no wearable, so a non-ok response degrades that section to empty
 *   rather than failing the page.
 * - any 401 on any arm → unauthenticated (the session is gone for all arms).
 *
 * `healthHistoryOk` tells the caller whether to read the health-history body
 * or substitute an empty array.
 */
export type ArmClassification =
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }
  | { kind: 'proceed'; healthHistoryOk: boolean };

export function classifyInsightsArms(
  review: ArmStatus,
  checkIn: ArmStatus,
  history: ArmStatus,
): ArmClassification {
  if (review.status === 401 || checkIn.status === 401 || history.status === 401) {
    return { kind: 'unauthenticated' };
  }

  // Required arms: a failure here fails the page.
  if (!review.ok || !checkIn.ok) {
    return {
      kind: 'error',
      message: `HTTP ${review.status}/${checkIn.status}/${history.status}`,
    };
  }

  // Optional arm: health-history degrades to an empty section on failure.
  return { kind: 'proceed', healthHistoryOk: history.ok };
}

/**
 * Loads the three /insights data surfaces (weekly review, check-in history,
 * health history) in parallel.
 *
 * The weekly and check-in arms are required: a failed request degrades the
 * whole view to `{ kind: 'error' }` — the page does not render a partial. The
 * health-history arm is optional (plausible to fail or be empty for a user
 * with no wearable) and degrades to an empty section instead of failing the
 * page. See `classifyInsightsArms`.
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

        const classification = classifyInsightsArms(reviewRes, checkInRes, historyRes);
        if (classification.kind === 'unauthenticated') {
          setState({ kind: 'unauthenticated' });
          return;
        }
        if (classification.kind === 'error') {
          setState({ kind: 'error', message: classification.message });
          return;
        }

        // Required arms are guaranteed ok here. The health-history body is only
        // read when its arm succeeded; otherwise the section degrades to empty.
        const [{ review }, { checkIns }] = (await Promise.all([
          reviewRes.json(),
          checkInRes.json(),
        ])) as [{ review: WeeklyReview }, { checkIns: StoredCheckIn[] }];

        const healthHistory: HealthHistoryDay[] = classification.healthHistoryOk
          ? ((await historyRes.json()) as { history: HealthHistoryDay[] }).history
          : [];

        if (cancelled) return;
        setState({
          kind: 'ready',
          data: {
            review,
            checkInHistory: collapseCheckInsByDay(checkIns),
            healthHistory,
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
