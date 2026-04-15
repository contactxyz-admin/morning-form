/**
 * Vendor-neutral normalization helper.
 *
 * Provider clients call `pointFromCanonical(name, value, opts)` with EITHER
 * the canonical storage name (e.g. `heart_rate_variability_rmssd`) or the
 * rule-engine alias (e.g. `hrv`). The returned `HealthDataPoint` carries the
 * alias as `metric` (preserving the existing rule-engine contract — see
 * `src/lib/suggestions/rules.ts`).
 */

import type { HealthDataPoint, HealthProvider } from '@/types';
import { findMetric, type MetricName } from './canonical';

export interface PointOpts {
  timestamp: string;
  provider: HealthProvider;
  /** Override the registered unit (e.g. provider returned a different unit and you converted upstream). Rare. */
  unit?: string;
}

export function pointFromCanonical(name: MetricName, value: number, opts: PointOpts): HealthDataPoint {
  const entry = findMetric(name);
  return {
    category: entry.category,
    metric: entry.alias,
    value,
    unit: opts.unit ?? entry.unit,
    timestamp: opts.timestamp,
    provider: opts.provider,
  };
}
