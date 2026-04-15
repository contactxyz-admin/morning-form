/**
 * Suggestions engine.
 *
 * `ensureTodaysSuggestions` reads the last 7 days of HealthDataPoints for
 * a user, runs the rule registry, and upserts one Suggestion row per
 * firing rule keyed on (userId, date, kind). Stale kinds for today
 * (rules that previously fired but don't now) are deleted so fixes
 * propagate on the next run.
 */

import type { Suggestion as PrismaSuggestion } from '@prisma/client';
import type { HealthCategory, HealthDataPoint, HealthProvider, Suggestion, SuggestionTier } from '@/types';
import { prisma } from '@/lib/db';
import { evaluateRules } from './rules';

const LOOKBACK_DAYS = 7;

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
  const lookbackStart = new Date(today.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.healthDataPoint.findMany({
    where: { userId, timestamp: { gte: lookbackStart } },
    orderBy: { timestamp: 'asc' },
  });
  const points = rows.map(toHealthDataPoint);
  const outcomes = evaluateRules(points, { now });
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
