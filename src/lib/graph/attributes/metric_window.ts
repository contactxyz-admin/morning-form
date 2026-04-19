/**
 * Metric-window node attribute contract (T4 formalisation).
 *
 * Aggregated wearable / home-device windows (daily, 7d, 28d): HRV
 * trends, resting-HR trends, glucose variability, home-BP series,
 * weight trends. Strict — this shape is consumed directly by topic
 * prompts (see src/lib/topics/prompts/sleep-recovery.ts) so drift
 * here breaks downstream rendering silently.
 *
 * T4 changes:
 * - `metric` is now validated against `CANONICAL_METRICS` (canonical
 *   or alias form accepted) rather than any string.
 * - `aggregation` enum added and required. `percentile` is
 *   deliberately NOT in the enum — percentile-based windows imply
 *   an extra `percentileN` field that this contract does not model
 *   yet.
 * - `windowStartAt` / `windowEndAt` replace the loose
 *   `windowStart` / `windowEnd` names and are refined so the window
 *   is non-empty and parseable.
 * - `baselineRef` added (structured reference to the comparison
 *   baseline — a prior window id, a published normal range, etc.).
 */
import { z } from 'zod';
import { CANONICAL_METRICS } from '@/lib/health/canonical';

const METRIC_NAMES: ReadonlySet<string> = new Set(
  CANONICAL_METRICS.flatMap((m) => [m.canonical, m.alias]),
);

export const METRIC_WINDOW_AGGREGATIONS = ['mean', 'median', 'max', 'min', 'stddev', 'range'] as const;
export type MetricWindowAggregation = (typeof METRIC_WINDOW_AGGREGATIONS)[number];

export const METRIC_WINDOW_GRANULARITIES = ['day', 'week', 'month', '7d', '28d'] as const;
export type MetricWindowGranularity = (typeof METRIC_WINDOW_GRANULARITIES)[number];

const BaselineRefSchema = z
  .object({
    value: z.number(),
    derivedFrom: z.string(),
    unit: z.string().optional(),
  })
  .strict();

export const MetricWindowAttributesSchema = z
  .object({
    metric: z.string().refine((v) => METRIC_NAMES.has(v), {
      message: 'metric must be a canonical or alias name from CANONICAL_METRICS',
    }),
    windowStartAt: z.string(),
    windowEndAt: z.string(),
    aggregation: z.enum(METRIC_WINDOW_AGGREGATIONS),
    n: z.number().int().nonnegative(),
    value: z.number(),
    unit: z.string(),
    granularity: z.enum(METRIC_WINDOW_GRANULARITIES).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    mean: z.number().optional(),
    median: z.number().optional(),
    provider: z.string().optional(),
    baselineRef: BaselineRefSchema.optional(),
  })
  .strict()
  .refine(
    (v) => {
      const start = Date.parse(v.windowStartAt);
      const end = Date.parse(v.windowEndAt);
      if (Number.isNaN(start) || Number.isNaN(end)) return false;
      return end >= start;
    },
    { message: 'windowEndAt must be a valid date on or after windowStartAt', path: ['windowEndAt'] },
  );

export type MetricWindowAttributes = z.infer<typeof MetricWindowAttributesSchema>;
