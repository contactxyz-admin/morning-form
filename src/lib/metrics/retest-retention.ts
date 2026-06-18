/**
 * Retest-retention metric (Plan 2026-06-17-001 U4).
 *
 * The pilot's headline question: of users whose first forward (non-backfill)
 * draw completed, what fraction RETURNED for a second draw — and how many did so
 * because the loop brought them back (a nudge-attributed return)?
 *
 * Why a standalone module rather than an activation-funnel stage: the activation
 * funnel is a strictly sequential signup→retained chain whose "% of previous"
 * assumes progression from signup. Retest retention is a different ratio with a
 * forward-baseline denominator — modelling it as the chain's 8th stage would
 * compute a misleading "% of retained-7d". So it is its own computation,
 * surfaced as a distinct report section.
 *
 * Honest denominator (the founder-review fixes):
 *   - PENDING users (a completed baseline, no second draw yet, retest not yet
 *     overdue) are excluded from the rate — they have not had the chance to
 *     return. Counting them would deflate retention early.
 *   - LAPSED or long-overdue draws are confirmed NON-RETURNS, not pending
 *     unknowns, so they belong in the denominator.
 *   - BACKFILLED baselines are excluded entirely (forward-only): backfill grants
 *     nudge-eligibility, not retention credit for return earned before the loop.
 *
 * Scope: first-return retention (baseline → second draw). Ongoing 3rd/4th-draw
 * retention is a later metric.
 */

import type { Db } from './activation-funnel';
import { RETEST_LAPSE_GRACE_DAYS, RETEST_NUDGE_OFFSETS_DAYS } from '@/lib/retest/constants';
import type { DrawAttribution } from '@/lib/retest/draws';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days after a scheduled draw's `scheduledFor` at which — absent a completion —
 * it is a confirmed non-return: the nudge sequence is exhausted and the lapse
 * grace has passed (whether or not the cron has flipped it to `lapsed` yet).
 */
export const RETEST_OVERDUE_DAYS =
  RETEST_NUDGE_OFFSETS_DAYS[RETEST_NUDGE_OFFSETS_DAYS.length - 1] + RETEST_LAPSE_GRACE_DAYS;

export type AttributionMix = Record<DrawAttribution, number>;

export interface RetestRetentionReport {
  /** Forward (non-backfill) completed-baseline users — the population. */
  baselineUsers: number;
  /** Baseline users who completed a second draw (any attribution). */
  returned: number;
  /** Baseline users whose second draw was attributed to a nudge (loop-caused). */
  nudgeAttributedReturned: number;
  /** Baseline users with no second draw whose next draw lapsed/overdue. */
  nonReturned: number;
  /** Baseline users still within their retest window — excluded from the rate. */
  pending: number;
  /** Users who have had the chance to return: returned + nonReturned. */
  resolvedDenominator: number;
  /** Headline: nudgeAttributedReturned / resolvedDenominator × 100 (null if none resolved). */
  nudgeAttributedRetentionPct: number | null;
  /** returned / resolvedDenominator × 100 (null if none resolved). */
  totalRetentionPct: number | null;
  /** Attribution mix of the second draws (the first return). */
  secondDrawAttributionMix: AttributionMix;
  /** Median days from the nudge to completion over nudge-attributed returns (null if none). */
  medianNudgeToRebookDays: number | null;
}

interface DrawRow {
  userId: string;
  sequence: number | null;
  status: string;
  scheduledFor: Date | null;
  completedAt: Date | null;
  lastNudgedAt: Date | null;
  attribution: string | null;
}

const ATTRIBUTIONS: readonly DrawAttribution[] = [
  'baseline',
  'nudge',
  'organic',
  'ops',
  'clinician',
  'backfill',
];

function emptyMix(): AttributionMix {
  return { baseline: 0, nudge: 0, organic: 0, ops: 0, clinician: 0, backfill: 0 };
}

export async function computeRetestRetention(
  db: Db,
  options: { now?: Date; userIds?: string[] } = {},
): Promise<RetestRetentionReport> {
  const now = options.now ?? new Date();
  const draws: DrawRow[] = await db.draw.findMany({
    where: { ...(options.userIds ? { userId: { in: options.userIds } } : {}) },
    select: {
      userId: true,
      sequence: true,
      status: true,
      scheduledFor: true,
      completedAt: true,
      lastNudgedAt: true,
      attribution: true,
    },
  });

  const byUser = new Map<string, DrawRow[]>();
  for (const d of draws) {
    const list = byUser.get(d.userId);
    if (list) list.push(d);
    else byUser.set(d.userId, [d]);
  }

  let baselineUsers = 0;
  let returned = 0;
  let nudgeAttributedReturned = 0;
  let nonReturned = 0;
  let pending = 0;
  const mix = emptyMix();
  const latencies: number[] = [];

  // Map iteration via forEach (the repo's idiom — avoids the downlevel-iterator
  // constraint on Map#values()).
  byUser.forEach((userDraws) => {
    const baseline = userDraws.find((d) => d.status === 'completed' && d.sequence === 1);
    if (!baseline) return; // no completed baseline → not in the population
    if (baseline.attribution === 'backfill') return; // forward-only

    baselineUsers++;

    const second = userDraws.find((d) => d.status === 'completed' && d.sequence === 2);
    if (second) {
      returned++;
      const attr = normalizeAttribution(second.attribution);
      mix[attr]++;
      if (attr === 'nudge') {
        nudgeAttributedReturned++;
        if (second.lastNudgedAt && second.completedAt) {
          latencies.push((second.completedAt.getTime() - second.lastNudgedAt.getTime()) / DAY_MS);
        }
      }
      return;
    }

    // No second draw → classify the next-draw slot.
    const lapsed = userDraws.find((d) => d.status === 'lapsed');
    const scheduled = userDraws.find((d) => d.status === 'scheduled');
    if (lapsed) {
      nonReturned++;
    } else if (
      scheduled &&
      scheduled.scheduledFor &&
      (now.getTime() - scheduled.scheduledFor.getTime()) / DAY_MS >= RETEST_OVERDUE_DAYS
    ) {
      nonReturned++; // overdue beyond the lapse point → confirmed non-return
    } else {
      pending++; // still within the retest window (or no slot yet) → no chance yet
    }
  });

  const resolvedDenominator = returned + nonReturned;
  return {
    baselineUsers,
    returned,
    nudgeAttributedReturned,
    nonReturned,
    pending,
    resolvedDenominator,
    nudgeAttributedRetentionPct: pct(nudgeAttributedReturned, resolvedDenominator),
    totalRetentionPct: pct(returned, resolvedDenominator),
    secondDrawAttributionMix: mix,
    medianNudgeToRebookDays: latencies.length === 0 ? null : round2(median(latencies)),
  };
}

function normalizeAttribution(value: string | null): DrawAttribution {
  return (ATTRIBUTIONS as readonly string[]).includes(value ?? '')
    ? (value as DrawAttribution)
    : 'organic';
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return round1((numerator / denominator) * 100);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
