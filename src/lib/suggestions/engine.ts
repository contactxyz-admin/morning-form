import type { DailySuggestion } from '@prisma/client';
import { prisma } from '@/lib/db';
import { computeBaselines } from './baselines';
import { evaluateRules, type RuleMetric, type RuleProtocolItem } from './rules';

const HISTORY_DAYS = 30;

/**
 * Generate today's suggestions for a user from their HealthDataPoint history
 * and current Protocol. Idempotent: re-running the same day inserts nothing new
 * because of the (userId, date, kind) unique index plus a pre-insert dedupe
 * that respects already-handled (accepted/dismissed/snoozed) suggestions.
 */
export async function ensureTodaysSuggestions(
  userId: string,
  date: string
): Promise<DailySuggestion[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - HISTORY_DAYS);

  const [points, protocol, existingToday] = await Promise.all([
    prisma.healthDataPoint.findMany({
      where: { userId, timestamp: { gte: since } },
      select: { id: true, metric: true, value: true, timestamp: true },
    }),
    prisma.protocol.findUnique({
      where: { userId },
      include: { items: { select: { compounds: true, timeSlot: true } } },
    }),
    prisma.dailySuggestion.findMany({
      where: { userId, date },
      select: { kind: true },
    }),
  ]);

  const ruleMetrics: RuleMetric[] = points.map((p) => ({
    id: p.id,
    metric: p.metric,
    value: p.value,
    timestamp: p.timestamp,
  }));
  const ruleProtocol: RuleProtocolItem[] = protocol?.items ?? [];
  const baselines = computeBaselines(ruleMetrics);

  const results = evaluateRules({
    metrics: ruleMetrics,
    baselines,
    protocol: ruleProtocol,
    today: date,
  });

  const existingKinds = new Set(existingToday.map((s) => s.kind));
  const fresh = results.filter((r) => !existingKinds.has(r.kind));

  if (fresh.length > 0) {
    // Per-row upsert (with no-op update) is race-safe against the unique index
    // (userId, date, kind), so concurrent calls that both pass the existingKinds
    // gate cannot crash on P2002. SQLite createMany does not support skipDuplicates.
    await Promise.all(
      fresh.map((r) =>
        prisma.dailySuggestion.upsert({
          where: { userId_date_kind: { userId, date, kind: r.kind } },
          create: {
            userId,
            date,
            kind: r.kind,
            title: r.title,
            rationale: r.rationale,
            evidenceTier: r.evidenceTier,
            triggeringMetricIds: JSON.stringify(r.triggeringMetricIds),
          },
          update: {},
        })
      )
    );
  }

  return prisma.dailySuggestion.findMany({
    where: { userId, date },
    orderBy: { createdAt: 'desc' },
  });
}
