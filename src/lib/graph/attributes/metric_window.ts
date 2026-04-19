/**
 * Metric-window node attribute contract.
 *
 * Aggregated wearable windows (daily, 7d, 28d). Strict — this shape is
 * consumed directly by topic prompts (see
 * src/lib/topics/prompts/sleep-recovery.ts) so drift here breaks
 * downstream rendering silently.
 */
import { z } from 'zod';

export const MetricWindowAttributesSchema = z
  .object({
    metric: z.string(),
    windowStart: z.string(),
    windowEnd: z.string(),
    granularity: z.enum(['day', 'week', 'month', '7d', '28d']).optional(),
    value: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    mean: z.number().optional(),
    median: z.number().optional(),
    unit: z.string().optional(),
    sampleCount: z.number().int().nonnegative().optional(),
    provider: z.string().optional(),
  })
  .strict();

export type MetricWindowAttributes = z.infer<typeof MetricWindowAttributesSchema>;
