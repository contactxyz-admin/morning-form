/**
 * Canonical metric registry.
 *
 * Two vocabularies coexist:
 *   - `canonical`: long, vendor-neutral storage names (inspired by Spike/OpenWearables
 *     unified data models). Stable identifiers we can migrate to as the system grows.
 *   - `alias`:     short names the suggestions rule engine reads
 *     (see `src/lib/suggestions/rules.ts`). These are what land in
 *     `HealthDataPoint.metric` today and what `HealthSyncService.aggregateToSummary`
 *     looks up.
 *
 * Provider clients call `pointFromCanonical(name, value, opts)` from
 * `./normalize.ts` with EITHER the canonical or alias name; the helper
 * looks up the entry here and emits an alias-named row with `unit` and
 * `category` filled from this registry.
 */

import type { HealthCategory } from '@/types';

export interface CanonicalMetric {
  readonly canonical: string;
  readonly alias: string;
  readonly unit: string;
  readonly category: HealthCategory;
}

export const CANONICAL_METRICS = [
  // Recovery
  { canonical: 'heart_rate_variability_rmssd', alias: 'hrv',              unit: 'ms',          category: 'recovery' },
  { canonical: 'recovery_score',               alias: 'recovery_score',   unit: '%',           category: 'recovery' },
  { canonical: 'readiness_score',              alias: 'readiness_score',  unit: 'score',       category: 'recovery' },
  { canonical: 'respiratory_rate',             alias: 'respiratory_rate', unit: 'breaths/min', category: 'recovery' },

  // Heart
  { canonical: 'resting_heart_rate',           alias: 'resting_hr',       unit: 'bpm',         category: 'heart'    },
  { canonical: 'average_heart_rate',           alias: 'avg_hr',           unit: 'bpm',         category: 'heart'    },
  { canonical: 'max_heart_rate',               alias: 'max_hr',           unit: 'bpm',         category: 'heart'    },

  // Sleep
  { canonical: 'sleep_duration_total',         alias: 'duration',         unit: 'hours',       category: 'sleep'    },
  { canonical: 'sleep_efficiency',             alias: 'efficiency',       unit: '%',           category: 'sleep'    },
  { canonical: 'sleep_duration_deep',          alias: 'deep_sleep',       unit: 'hours',       category: 'sleep'    },
  { canonical: 'sleep_duration_rem',           alias: 'rem_sleep',        unit: 'hours',       category: 'sleep'    },

  // Activity
  { canonical: 'steps_total',                  alias: 'steps',            unit: 'steps',       category: 'activity' },
  { canonical: 'calories_burned',              alias: 'calories',         unit: 'kcal',        category: 'activity' },
  { canonical: 'active_minutes',               alias: 'active_minutes',   unit: 'minutes',     category: 'activity' },
  { canonical: 'strain_score',                 alias: 'strain',           unit: 'score',       category: 'activity' },

  // Body
  { canonical: 'body_temperature_delta',       alias: 'temperature_delta', unit: '°C',         category: 'body'     },
  { canonical: 'blood_glucose',                alias: 'glucose',           unit: 'mg/dL',      category: 'body'     },
] as const satisfies readonly CanonicalMetric[];

export type RuleAlias = (typeof CANONICAL_METRICS)[number]['alias'];
export type CanonicalName = (typeof CANONICAL_METRICS)[number]['canonical'];
export type MetricName = RuleAlias | CanonicalName;

const BY_CANONICAL = new Map<string, CanonicalMetric>(CANONICAL_METRICS.map((m) => [m.canonical, m]));
const BY_ALIAS = new Map<string, CanonicalMetric>(CANONICAL_METRICS.map((m) => [m.alias, m]));

export function findMetric(name: MetricName): CanonicalMetric {
  const m = BY_ALIAS.get(name) ?? BY_CANONICAL.get(name);
  if (!m) throw new Error(`Unknown metric: ${name}`);
  return m;
}

export function unitFor(name: MetricName): string {
  return findMetric(name).unit;
}

export function categoryFor(name: MetricName): HealthCategory {
  return findMetric(name).category;
}

export function aliasFor(canonical: CanonicalName): RuleAlias {
  const m = BY_CANONICAL.get(canonical);
  if (!m) throw new Error(`Unknown canonical metric: ${canonical}`);
  return m.alias as RuleAlias;
}

export function canonicalFor(alias: RuleAlias): CanonicalName {
  const m = BY_ALIAS.get(alias);
  if (!m) throw new Error(`Unknown metric alias: ${alias}`);
  return m.canonical as CanonicalName;
}
