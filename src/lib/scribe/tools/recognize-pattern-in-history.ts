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
import { env } from '@/lib/env';
import { buildMarkerTrajectory } from '@/lib/markers/trajectory';
import type { ToolContext, ToolHandler } from './types';

/**
 * Longitudinal-reads gate (mirrors `src/lib/markers/trajectory.ts`). When ON,
 * the tool reads the user's **unified lab + wearable** history via
 * `buildMarkerTrajectory` — so the scribe finally sees blood-marker trajectories
 * (graph biomarker/observation nodes), not just wearable `HealthDataPoint`s.
 * When OFF, the tool keeps its pre-existing wearable-only behaviour byte-for-byte.
 * `process.env` first is the repo's test seam.
 */
function longitudinalReadsEnabled(): boolean {
  return (process.env.LONGITUDINAL_GRAPH_ENABLED ?? env.LONGITUDINAL_GRAPH_ENABLED) === 'true';
}

export const recognizePatternInHistorySchema = z.object({
  metrics: z.array(z.string().min(1).max(64)).min(1).max(12),
  windowDays: z.number().int().min(1).max(180).optional(),
});

export type RecognizePatternInHistoryArgs = z.infer<typeof recognizePatternInHistorySchema>;

export const DEFAULT_PATTERN_WINDOW_DAYS = 90;
export const PATTERN_ROW_SAFETY_THRESHOLD = 2000;
export const MAX_SERIES_POINTS = 24;

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
  /** Bounded time series (≤24 most-recent points, most-recent-first).
   *  Present on `ok` status; `[]` on too-little-data / too-much-data. */
  series: SeriesPoint[];
}

export interface SeriesPoint {
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
}

export const recognizePatternInHistoryHandler: ToolHandler<
  RecognizePatternInHistoryArgs,
  RecognizePatternInHistoryResult
> = {
  name: 'recognize_pattern_in_history',
  description:
    "Summarise the user's own recent data (check-ins, wearable data points, and lab/blood-marker results) for the given metrics. Returns counts and first/last/average so the scribe can reason about direction against the user's own baseline. Request lab markers by name (e.g. \"ferritin\") to see their trajectory across panels.",
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
        series: [],
      };
    }

    // Longitudinal ON → unified lab + wearable history (the scribe sees bloods,
    // not just wearables). OFF → the wearable-only path below, unchanged.
    if (longitudinalReadsEnabled()) {
      return buildUnifiedDigest(ctx, topicMetrics, windowDays);
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
        series: [],
      };
    }

    if (dataCount < 3) {
      return {
        status: 'too-little-data',
        windowDays,
        metrics: [],
        checkInCount,
        series: [],
      };
    }

    const rows = await ctx.db.healthDataPoint.findMany({
      where: { userId: ctx.userId, metric: { in: topicMetrics }, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      // Defense-in-depth: the count gate above already bails over the
      // threshold, but cap the materialised set too so a race between the
      // count and the fetch can't load an unbounded result set.
      take: PATTERN_ROW_SAFETY_THRESHOLD,
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

    // Build bounded series: most-recent-first, cap at MAX_SERIES_POINTS.
    const allRowsSorted = [...rows].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const seriesRows = allRowsSorted.slice(0, MAX_SERIES_POINTS);
    const series = seriesRows.map((r) => ({
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      timestamp: r.timestamp.toISOString(),
    }));

    return { status: 'ok', windowDays, metrics, checkInCount, series };
  },
};

/**
 * Unified lab + wearable digest (LONGITUDINAL_GRAPH_ENABLED path).
 *
 * Builds each on-topic metric's series via `buildMarkerTrajectory`, which merges
 * dated lab biomarker/observation nodes with wearable points (unit-reconciled,
 * same-day-deduped, capped to the most-recent ~24). This is what lets the scribe
 * reason over blood-marker trajectories — invisible to the wearable-only path.
 *
 * Differences from the wearable-only path, by design:
 *   - "too-little-data" is judged on the UNIFIED point count, so a user with lab
 *     history but sparse wearables is no longer bailed before their bloods are seen.
 *   - The series is most-recent-N across all time rather than time-windowed —
 *     lab panels are sparse (quarterly), so a fixed day window would hide the
 *     trend. `windowDays` still bounds the check-in count and is echoed back.
 */
async function buildUnifiedDigest(
  ctx: ToolContext,
  topicMetrics: string[],
  windowDays: number,
): Promise<RecognizePatternInHistoryResult> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Safety bound: cap the wearable rows buildMarkerTrajectory will materialise
  // (it reads all-time, then caps). Lab nodes are few (quarterly), so the
  // HealthDataPoint count is the materialisation risk to gate on.
  const [dataCount, checkInCount] = await Promise.all([
    ctx.db.healthDataPoint.count({ where: { userId: ctx.userId, metric: { in: topicMetrics } } }),
    ctx.db.checkIn.count({ where: { userId: ctx.userId, createdAt: { gte: since } } }),
  ]);
  if (dataCount + checkInCount > PATTERN_ROW_SAFETY_THRESHOLD) {
    return { status: 'too-much-data', windowDays, metrics: [], checkInCount, series: [] };
  }

  const seriesByMetric = await Promise.all(
    topicMetrics.map((m) =>
      buildMarkerTrajectory(ctx.db, ctx.userId, m, { maxPoints: MAX_SERIES_POINTS }),
    ),
  );

  const totalPoints = seriesByMetric.reduce((n, s) => n + s.length, 0);
  if (totalPoints < 3) {
    return { status: 'too-little-data', windowDays, metrics: [], checkInCount, series: [] };
  }

  const metrics: MetricSeries[] = topicMetrics.map((m, i) => {
    const newestFirst = seriesByMetric[i];
    if (newestFirst.length === 0) {
      return { metric: m, count: 0, first: null, last: null, average: null };
    }
    const asc = [...newestFirst].reverse(); // oldest-first for first/last
    const sum = asc.reduce((acc, p) => acc + p.value, 0);
    const oldest = asc[0];
    const latest = asc[asc.length - 1];
    return {
      metric: m,
      count: asc.length,
      first: { value: oldest.value, unit: oldest.unit, timestamp: oldest.timestamp },
      last: { value: latest.value, unit: latest.unit, timestamp: latest.timestamp },
      average: sum / asc.length,
    };
  });

  // One bounded, most-recent-first series across all requested metrics.
  const series = seriesByMetric
    .flat()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_SERIES_POINTS);

  return { status: 'ok', windowDays, metrics, checkInCount, series };
}
