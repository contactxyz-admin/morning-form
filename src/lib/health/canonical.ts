/**
 * Canonical metric registry.
 *
 * Two vocabularies coexist:
 *   - `canonical`: long, vendor-neutral storage names (inspired by Spike/OpenWearables
 *     unified data models). Persisted in `metadata.canonical` so we can swap the
 *     short alias later without losing semantics.
 *   - `alias`:     short names the suggestions rule engine reads
 *     (see `src/lib/suggestions/rules.ts`). These are what land in
 *     `HealthDataPoint.metric` today.
 *
 * Provider clients call `pointFromCanonical(name, value, opts)` from
 * `./normalize.ts` with EITHER the canonical or alias name; the helper
 * looks up the entry here and emits an alias-named row with `unit` and
 * `category` filled from this registry.
 */

import type { HealthCategory } from '@/types';

export interface CanonicalMetric {
  canonical: string;
  alias: string;
  unit: string;
  category: HealthCategory;
  kind: 'timeseries';
}

export const CANONICAL_METRICS: readonly CanonicalMetric[] = [
  // Recovery
  { canonical: 'heart_rate_variability_rmssd', alias: 'hrv',              unit: 'ms',     category: 'recovery', kind: 'timeseries' },
  { canonical: 'recovery_score',               alias: 'recovery_score',   unit: '%',      category: 'recovery', kind: 'timeseries' },
  { canonical: 'readiness_score',              alias: 'readiness_score',  unit: 'score',  category: 'recovery', kind: 'timeseries' },
  { canonical: 'respiratory_rate',             alias: 'respiratory_rate', unit: 'bpm',    category: 'recovery', kind: 'timeseries' },

  // Heart
  { canonical: 'resting_heart_rate',           alias: 'resting_hr',       unit: 'bpm',    category: 'heart',    kind: 'timeseries' },
  { canonical: 'average_heart_rate',           alias: 'avg_hr',           unit: 'bpm',    category: 'heart',    kind: 'timeseries' },
  { canonical: 'max_heart_rate',               alias: 'max_hr',           unit: 'bpm',    category: 'heart',    kind: 'timeseries' },

  // Sleep
  { canonical: 'sleep_duration_total',         alias: 'duration',         unit: 'hours',  category: 'sleep',    kind: 'timeseries' },
  { canonical: 'sleep_efficiency',             alias: 'efficiency',       unit: '%',      category: 'sleep',    kind: 'timeseries' },
  { canonical: 'sleep_duration_deep',          alias: 'deep_sleep',       unit: 'hours',  category: 'sleep',    kind: 'timeseries' },
  { canonical: 'sleep_duration_rem',           alias: 'rem_sleep',        unit: 'hours',  category: 'sleep',    kind: 'timeseries' },

  // Activity
  { canonical: 'steps_total',                  alias: 'steps',            unit: 'steps',   category: 'activity', kind: 'timeseries' },
  { canonical: 'calories_burned',              alias: 'calories',         unit: 'kcal',    category: 'activity', kind: 'timeseries' },
  { canonical: 'active_minutes',               alias: 'active_minutes',   unit: 'minutes', category: 'activity', kind: 'timeseries' },
  { canonical: 'strain_score',                 alias: 'strain',           unit: 'score',   category: 'activity', kind: 'timeseries' },

  // Body
  { canonical: 'body_temperature_delta',       alias: 'temperature_delta', unit: '°C',    category: 'body',     kind: 'timeseries' },
  { canonical: 'blood_glucose',                alias: 'glucose_fasting',   unit: 'mg/dL', category: 'body',     kind: 'timeseries' },
] as const;

export type RuleAlias = (typeof CANONICAL_METRICS)[number]['alias'];
export type CanonicalName = (typeof CANONICAL_METRICS)[number]['canonical'];

const BY_CANONICAL = new Map<string, CanonicalMetric>(CANONICAL_METRICS.map((m) => [m.canonical, m]));
const BY_ALIAS = new Map<string, CanonicalMetric>(CANONICAL_METRICS.map((m) => [m.alias, m]));

export function findMetric(name: string): CanonicalMetric | undefined {
  return BY_ALIAS.get(name) ?? BY_CANONICAL.get(name);
}

export function unitFor(name: string): string {
  const m = findMetric(name);
  if (!m) throw new Error(`Unknown metric: ${name}`);
  return m.unit;
}

export function categoryFor(name: string): HealthCategory {
  const m = findMetric(name);
  if (!m) throw new Error(`Unknown metric: ${name}`);
  return m.category;
}

export function aliasFor(canonical: string): string {
  const m = BY_CANONICAL.get(canonical);
  if (!m) throw new Error(`Unknown canonical metric: ${canonical}`);
  return m.alias;
}

export function canonicalFor(alias: string): string {
  const m = BY_ALIAS.get(alias);
  if (!m) throw new Error(`Unknown metric alias: ${alias}`);
  return m.canonical;
}
