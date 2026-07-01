/**
 * Suggestions engine.
 *
 * `ensureTodaysSuggestions` reads recent HealthDataPoints for a user, runs
 * the rule registry, and upserts one Suggestion row per firing rule keyed on
 * (userId, date, kind). Stale kinds for today (rules that previously fired but
 * don't now) are deleted so fixes propagate on the next run.
 *
 * It fetches a `BASELINE_LOOKBACK_DAYS` window (so personal-baseline rules
 * have ≥30 days of history) but hands the population/threshold rules only the
 * recent `LOOKBACK_DAYS` slice, so those rules see exactly the input they saw
 * before — the wider fetch is additive, baseline-only context.
 */

import type { Suggestion as PrismaSuggestion } from '@prisma/client';
import type { HealthCategory, HealthDataPoint, HealthProvider, Suggestion, SuggestionTier } from '@/types';
import { prisma } from '@/lib/db';
import { evaluateRules } from './rules';

const LOOKBACK_DAYS = 7;
// Wide enough to yield ≥30 distinct UTC days for `median30`/`std30`, with a
// small buffer for missed sync days.
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
  const baselineStart = new Date(today.getTime() - BASELINE_LOOKBACK_DAYS * DAY_MS);
  const recentStart = new Date(today.getTime() - LOOKBACK_DAYS * DAY_MS);

  const rows = await prisma.healthDataPoint.findMany({
    where: { userId, timestamp: { gte: baselineStart } },
    orderBy: { timestamp: 'asc' },
  });
  const baselinePoints = rows.map(toHealthDataPoint);
  // Existing threshold rules see exactly the recent slice they saw before the
  // fetch was widened; only baseline rules read the full `baselinePoints`.
  const points = baselinePoints.filter(
    (p) => new Date(p.timestamp).getTime() >= recentStart.getTime(),
  );
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
