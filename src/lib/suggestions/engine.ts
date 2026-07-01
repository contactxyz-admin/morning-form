/**
 * Suggestions engine.
 *
 * `ensureTodaysSuggestions` reads recent HealthDataPoints for a user, runs
 * the rule registry, and upserts one Suggestion row per firing rule keyed on
 * (userId, date, kind). Stale kinds for today (rules that previously fired but
 * don't now) are deleted so fixes propagate on the next run.
 *
 * It runs two scoped fetches: the recent `LOOKBACK_DAYS` full point stream for
 * the population/threshold rules (exactly the input they saw before), and a
 * `BASELINE_LOOKBACK_DAYS` window restricted to `BASELINE_METRICS` for the
 * personal-baseline rules (so they have ≥30 days of history without pulling
 * unrelated high-cadence streams over the long window).
 */

import type { Suggestion as PrismaSuggestion } from '@prisma/client';
import type { HealthCategory, HealthDataPoint, HealthProvider, Suggestion, SuggestionTier } from '@/types';
import { prisma } from '@/lib/db';
import { evaluateRules, BASELINE_METRICS } from './rules';

const LOOKBACK_DAYS = 7;
// Wide enough to yield ≥30 distinct UTC days for `median30`/`std30`, with a
// small buffer for missed sync days. Only the baseline metrics are fetched
// over this window (see the scoped query below) — never the full point stream.
const BASELINE_LOOKBACK_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toHealthDataPoint(row: {
  id: string;
  provider: string;
  category: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: Date;
}): HealthDataPoint {
  return {
    id: row.id,
    provider: row.provider as HealthProvider,
    category: row.category as HealthCategory,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    timestamp: row.timestamp.toISOString(),
  };
}

function toSuggestion(row: PrismaSuggestion): Suggestion {
  let triggeringMetricIds: string[] = [];
  try {
    const parsed = JSON.parse(row.triggeringMetricIds);
    if (Array.isArray(parsed)) triggeringMetricIds = parsed as string[];
  } catch {
    // Treat as empty if corrupt. Not worth surfacing.
  }
  return {
    id: row.id,
    date: row.date.toISOString(),
    kind: row.kind,
    title: row.title,
    tier: row.tier as SuggestionTier,
    triggeringMetricIds,
  };
}

export async function ensureTodaysSuggestions(userId: string, now: Date = new Date()): Promise<Suggestion[]> {
  const today = todayUtcMidnight(now);
  const recentStart = new Date(today.getTime() - LOOKBACK_DAYS * DAY_MS);
  const baselineStart = new Date(today.getTime() - BASELINE_LOOKBACK_DAYS * DAY_MS);

  // Two scoped queries: threshold rules get the recent full stream exactly as
  // before; baseline rules get only the baseline metrics over the long window
  // (so a CGM/SpO₂ user isn't pulling 35 days of high-cadence rows to discard).
  const [recentRows, baselineRows] = await Promise.all([
    prisma.healthDataPoint.findMany({
      where: { userId, timestamp: { gte: recentStart } },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.healthDataPoint.findMany({
      where: { userId, metric: { in: BASELINE_METRICS }, timestamp: { gte: baselineStart } },
      orderBy: { timestamp: 'asc' },
    }),
  ]);
  const points = recentRows.map(toHealthDataPoint);
  const baselinePoints = baselineRows.map(toHealthDataPoint);
  const outcomes = evaluateRules(points, { now, baselinePoints });
  const firingKinds = new Set(outcomes.map((o) => o.kind));

  // Delete stale today-rows that no longer fire. Scope strictly to today
  // + this user so historical rows are untouched.
  await prisma.suggestion.deleteMany({
    where: {
      userId,
      date: today,
      kind: { notIn: outcomes.length > 0 ? Array.from(firingKinds) : [] },
    },
  });

  const persisted: PrismaSuggestion[] = [];
  for (const outcome of outcomes) {
    const row = await prisma.suggestion.upsert({
      where: { userId_date_kind: { userId, date: today, kind: outcome.kind } },
      update: {
        title: outcome.title,
        tier: outcome.tier,
        triggeringMetricIds: JSON.stringify(outcome.triggeringMetricIds),
      },
      create: {
        userId,
        date: today,
        kind: outcome.kind,
        title: outcome.title,
        tier: outcome.tier,
        triggeringMetricIds: JSON.stringify(outcome.triggeringMetricIds),
      },
    });
    persisted.push(row);
  }

  return persisted.map(toSuggestion);
}
