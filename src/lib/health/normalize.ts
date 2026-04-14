/**
 * Vendor-neutral normalization helper.
 *
 * Provider clients call `pointFromCanonical(name, value, opts)` with EITHER
 * the canonical storage name (e.g. `heart_rate_variability_rmssd`) or the
 * rule-engine alias (e.g. `hrv`). The returned `HealthDataPoint` always
 * carries the alias as `metric` (preserving the existing rule-engine
 * contract — see `src/lib/suggestions/rules.ts`) and stashes the canonical
 * name in `metadata.canonical` so we can rename or migrate later without
 * losing semantics.
 */

import type { HealthDataPoint, HealthProvider } from '@/types';
import { findMetric } from './canonical';

export interface PointOpts {
  timestamp: string;
  provider: HealthProvider;
  /** Override the registered unit (e.g. provider returned a different unit and you converted upstream). Rare. */
  unit?: string;
}

export function pointFromCanonical(name: string, value: number, opts: PointOpts): HealthDataPoint {
  const entry = findMetric(name);
  if (!entry) throw new Error(`Unknown metric: ${name}`);
  return {
    category: entry.category,
    metric: entry.alias,
    value,
    unit: opts.unit ?? entry.unit,
    timestamp: opts.timestamp,
    provider: opts.provider,
  };
}
