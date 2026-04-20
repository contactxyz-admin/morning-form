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
  { canonical: 'sleep_duration_light',         alias: 'light_sleep',      unit: 'hours',       category: 'sleep'    },
  { canonical: 'sleep_latency_minutes',        alias: 'sleep_latency',    unit: 'minutes',     category: 'sleep'    },

  // Activity
  { canonical: 'steps_total',                  alias: 'steps',            unit: 'steps',       category: 'activity' },
  { canonical: 'calories_burned',              alias: 'calories',         unit: 'kcal',        category: 'activity' },
  { canonical: 'active_minutes',               alias: 'active_minutes',   unit: 'minutes',     category: 'activity' },
  { canonical: 'strain_score',                 alias: 'strain',           unit: 'score',       category: 'activity' },
  { canonical: 'activity_zone_minutes_moderate', alias: 'zone_mod',       unit: 'minutes',     category: 'activity' },
  { canonical: 'activity_zone_minutes_vigorous', alias: 'zone_vig',       unit: 'minutes',     category: 'activity' },
  { canonical: 'vo2_max',                      alias: 'vo2_max',          unit: 'mL/kg/min',   category: 'activity' },

  // Body
  // D1 (per plan 2026-04-20-001): re-using existing HealthCategory values rather than
  // extending the union. `hydration_intake_daily` and `menstrual_cycle_day` fit `body`;
  // `vo2_max` fits `activity`. `aggregateToSummary` is keyed on alias, not category, so
  // this carries no averaging risk.
  { canonical: 'body_temperature_delta',       alias: 'temperature_delta', unit: '°C',         category: 'body'     },
  { canonical: 'hydration_intake_daily',       alias: 'hydration',         unit: 'mL',         category: 'body'     },
  { canonical: 'menstrual_cycle_day',          alias: 'cycle_day',         unit: 'day',        category: 'body'     },

  // Metabolic (glucose family)
  // `blood_glucose` is a raw reading; the three additions below are derived windows
  // (time-in-range, mean, coefficient of variation) used by CGM-stream ingestion.
  { canonical: 'blood_glucose',                alias: 'glucose',           unit: 'mg/dL',      category: 'metabolic' },
  { canonical: 'glucose_time_in_range',        alias: 'glucose_tir',       unit: '%',          category: 'metabolic' },
  { canonical: 'glucose_mean',                 alias: 'glucose_mean',      unit: 'mg/dL',      category: 'metabolic' },
  { canonical: 'glucose_coefficient_of_variation', alias: 'glucose_cv',    unit: '%',          category: 'metabolic' },

  // Recovery (wearable SpO₂ stream; vital-sign SpO₂ spot-reading lives on vital-signs-registry)
  { canonical: 'blood_oxygen_saturation',      alias: 'spo2_stream',       unit: '%',          category: 'recovery' },
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
