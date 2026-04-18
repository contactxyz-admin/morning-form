/**
 * `recognize_pattern_in_history` — surfaces pattern-vs-own-history judgments
 * by summarising the user's own recent `CheckIn` and `HealthDataPoint` rows
 * over a bounded window.
 *
 * Output is a structured digest (counts, latest values, simple trend bucket)
 * — the scribe composes the narrative, not the handler. Two bail-outs:
 *
 *   - `too-little-data`: fewer than 3 data points over the window. Surfacing
 *     a "trend" from two points is noise; the specialist GP should ask for
 *     more data or route to GP prep.
 *   - `too-much-data`: row count exceeds the safety threshold (default 2000)
 *     across check-ins + data points. We bail rather than materialise and
 *     aggregate a huge dataset inside a tool call; the compile path has cheaper
 *     aggregate queries, and the runtime path shouldn't block on this either.
 *
 * Scope:
 *   - User-scoped at the DB layer (every query includes ctx.userId).
 *   - Topic-scoped by the registry: the requested metrics are filtered to
 *     those that substring-match one of the topic's `canonicalKeyPatterns`
 *     before any DB query runs. An unknown topic, or a request with only
 *     off-topic metrics, returns `too-little-data` without touching the DB —
 *     a hallucinated cross-topic metric cannot leak the user's data from
 *     another topic.
 */
import { z } from 'zod';
import { getTopicConfig } from '@/lib/topics/registry';
import type { ToolContext, ToolHandler } from './types';

export const recognizePatternInHistorySchema = z.object({
  metrics: z.array(z.string().min(1).max(64)).min(1).max(12),
  windowDays: z.number().int().min(1).max(180).optional(),
});

export type RecognizePatternInHistoryArgs = z.infer<typeof recognizePatternInHistorySchema>;

export const DEFAULT_PATTERN_WINDOW_DAYS = 90;
export const PATTERN_ROW_SAFETY_THRESHOLD = 2000;

export type PatternDigestStatus =
  | 'ok'
  | 'too-little-data'
  | 'too-much-data';

export interface MetricSeries {
  metric: string;
  count: number;
  first: { value: number; unit: string; timestamp: string } | null;
  last: { value: number; unit: string; timestamp: string } | null;
  average: number | null;
}

export interface RecognizePatternInHistoryResult {
  status: PatternDigestStatus;
  windowDays: number;
  metrics: MetricSeries[];
  checkInCount: number;
}

export const recognizePatternInHistoryHandler: ToolHandler<
  RecognizePatternInHistoryArgs,
  RecognizePatternInHistoryResult
> = {
  name: 'recognize_pattern_in_history',
  description:
    'Summarise the user\'s own recent data (check-ins + wearable data points) for the given metrics over a bounded window. Returns counts and first/last/average so the scribe can reason about direction against the user\'s own baseline.',
  parameters: recognizePatternInHistorySchema,
  async execute(ctx: ToolContext, args: RecognizePatternInHistoryArgs) {
    const windowDays = args.windowDays ?? DEFAULT_PATTERN_WINDOW_DAYS;

    // Topic scope gate — filter requested metrics down to those that match
    // this topic's canonicalKeyPatterns. An unknown topic filters everything
    // out. If nothing survives the filter we return too-little-data without
    // touching the DB, so a hallucinated off-topic metric cannot probe the
    // user's data from another topic.
    const topic = getTopicConfig(ctx.topicKey);
    const topicMetrics = topic
      ? args.metrics.filter((m) =>
          topic.canonicalKeyPatterns.some((p) => m.toLowerCase().includes(p.toLowerCase())),
        )
      : [];
    if (topicMetrics.length === 0) {
      return {
        status: 'too-little-data',
        windowDays,
        metrics: [],
        checkInCount: 0,
      };
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [dataCount, checkInCount] = await Promise.all([
      ctx.db.healthDataPoint.count({
        where: { userId: ctx.userId, metric: { in: topicMetrics }, timestamp: { gte: since } },
      }),
      ctx.db.checkIn.count({
        where: { userId: ctx.userId, createdAt: { gte: since } },
      }),
    ]);

    const totalRows = dataCount + checkInCount;
    if (totalRows > PATTERN_ROW_SAFETY_THRESHOLD) {
      return {
        status: 'too-much-data',
        windowDays,
        metrics: [],
        checkInCount,
      };
    }

    if (dataCount < 3) {
      return {
        status: 'too-little-data',
        windowDays,
        metrics: [],
        checkInCount,
      };
    }

    const rows = await ctx.db.healthDataPoint.findMany({
      where: { userId: ctx.userId, metric: { in: topicMetrics }, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });

    const byMetric = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byMetric.get(r.metric) ?? [];
      arr.push(r);
      byMetric.set(r.metric, arr);
    }

    const metrics: MetricSeries[] = topicMetrics.map((m) => {
      const series = byMetric.get(m) ?? [];
      if (series.length === 0) {
        return { metric: m, count: 0, first: null, last: null, average: null };
      }
      const sum = series.reduce((acc, r) => acc + r.value, 0);
      const first = series[0];
      const last = series[series.length - 1];
      return {
        metric: m,
        count: series.length,
        first: {
          value: first.value,
          unit: first.unit,
          timestamp: first.timestamp.toISOString(),
        },
        last: {
          value: last.value,
          unit: last.unit,
          timestamp: last.timestamp.toISOString(),
        },
        average: sum / series.length,
      };
    });

    return { status: 'ok', windowDays, metrics, checkInCount };
  },
};
