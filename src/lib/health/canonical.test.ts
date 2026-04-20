import { describe, expect, it } from 'vitest';
import {
  CANONICAL_METRICS,
  aliasFor,
  canonicalFor,
  categoryFor,
  findMetric,
  unitFor,
  type CanonicalName,
  type MetricName,
  type RuleAlias,
} from './canonical';

describe('canonical metric registry', () => {
  it('every entry has a unit and category', () => {
    for (const m of CANONICAL_METRICS) {
      expect(m.unit, `${m.canonical} missing unit`).toBeTruthy();
      expect(m.category, `${m.canonical} missing category`).toBeTruthy();
    }
  });

  it('canonical names are unique', () => {
    const names = CANONICAL_METRICS.map((m) => m.canonical);
    expect(new Set(names).size).toBe(names.length);
  });

  it('alias names are unique', () => {
    const aliases = CANONICAL_METRICS.map((m) => m.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('alias <-> canonical round-trips for every entry', () => {
    for (const m of CANONICAL_METRICS) {
      expect(canonicalFor(m.alias)).toBe(m.canonical);
      expect(aliasFor(m.canonical)).toBe(m.alias);
    }
  });

  it('findMetric resolves both alias and canonical to the same entry', () => {
    for (const m of CANONICAL_METRICS) {
      expect(findMetric(m.alias)).toBe(m);
      expect(findMetric(m.canonical)).toBe(m);
    }
  });

  it('unitFor and categoryFor accept alias or canonical', () => {
    expect(unitFor('hrv')).toBe('ms');
    expect(unitFor('heart_rate_variability_rmssd')).toBe('ms');
    expect(categoryFor('hrv')).toBe('recovery');
    expect(categoryFor('heart_rate_variability_rmssd')).toBe('recovery');
  });

  it('throws on unknown metric names', () => {
    expect(() => unitFor('not_a_metric' as MetricName)).toThrow(/Unknown metric/);
    expect(() => categoryFor('not_a_metric' as MetricName)).toThrow(/Unknown metric/);
    expect(() => canonicalFor('not_an_alias' as RuleAlias)).toThrow(/Unknown metric alias/);
    expect(() => aliasFor('not_canonical' as CanonicalName)).toThrow(/Unknown canonical metric/);
  });

  it('locks the full registry contract (canonical, alias, unit, category for every metric)', () => {
    // Snapshot-style assertion: any drift in canonical name, alias, unit, or
    // category requires explicit acknowledgement here. Catches silent renames
    // that would break the rule engine OR the storage layer.
    const tuples = CANONICAL_METRICS.map((m) => [m.canonical, m.alias, m.unit, m.category]).sort(
      (a, b) => a[0].localeCompare(b[0]),
    );
    expect(tuples).toEqual(
      [
        ['active_minutes', 'active_minutes', 'minutes', 'activity'],
        ['activity_zone_minutes_moderate', 'zone_mod', 'minutes', 'activity'],
        ['activity_zone_minutes_vigorous', 'zone_vig', 'minutes', 'activity'],
        ['average_heart_rate', 'avg_hr', 'bpm', 'heart'],
        ['blood_glucose', 'glucose', 'mg/dL', 'metabolic'],
        ['blood_oxygen_saturation', 'spo2_stream', '%', 'recovery'],
        ['body_temperature_delta', 'temperature_delta', '°C', 'body'],
        ['calories_burned', 'calories', 'kcal', 'activity'],
        ['glucose_coefficient_of_variation', 'glucose_cv', '%', 'metabolic'],
        ['glucose_mean', 'glucose_mean', 'mg/dL', 'metabolic'],
        ['glucose_time_in_range', 'glucose_tir', '%', 'metabolic'],
        ['heart_rate_variability_rmssd', 'hrv', 'ms', 'recovery'],
        ['hydration_intake_daily', 'hydration', 'mL', 'body'],
        ['max_heart_rate', 'max_hr', 'bpm', 'heart'],
        ['menstrual_cycle_day', 'cycle_day', 'day', 'body'],
        ['readiness_score', 'readiness_score', 'score', 'recovery'],
        ['recovery_score', 'recovery_score', '%', 'recovery'],
        ['respiratory_rate', 'respiratory_rate', 'breaths/min', 'recovery'],
        ['resting_heart_rate', 'resting_hr', 'bpm', 'heart'],
        ['sleep_duration_deep', 'deep_sleep', 'hours', 'sleep'],
        ['sleep_duration_light', 'light_sleep', 'hours', 'sleep'],
        ['sleep_duration_rem', 'rem_sleep', 'hours', 'sleep'],
        ['sleep_duration_total', 'duration', 'hours', 'sleep'],
        ['sleep_efficiency', 'efficiency', '%', 'sleep'],
        ['sleep_latency_minutes', 'sleep_latency', 'minutes', 'sleep'],
        ['steps_total', 'steps', 'steps', 'activity'],
        ['strain_score', 'strain', 'score', 'activity'],
        ['vo2_max', 'vo2_max', 'mL/kg/min', 'activity'],
      ].sort((a, b) => a[0].localeCompare(b[0])),
    );
  });
});

describe('G1 — wearable vocabulary additions', () => {
  it('resolves glucose variability aliases', () => {
    expect(findMetric('glucose_tir').canonical).toBe('glucose_time_in_range');
    expect(findMetric('glucose_cv').canonical).toBe('glucose_coefficient_of_variation');
    expect(findMetric('glucose_mean').canonical).toBe('glucose_mean');
  });

  it('resolves sleep additions (light, latency) distinctly from total/deep/rem', () => {
    expect(findMetric('light_sleep').unit).toBe('hours');
    expect(findMetric('sleep_latency').unit).toBe('minutes');
    expect(findMetric('deep_sleep').canonical).toBe('sleep_duration_deep');
  });

  it('resolves activity-zone minutes', () => {
    expect(findMetric('zone_mod').canonical).toBe('activity_zone_minutes_moderate');
    expect(findMetric('zone_vig').canonical).toBe('activity_zone_minutes_vigorous');
  });

  it('resolves vo2_max with canonical = alias', () => {
    expect(findMetric('vo2_max').unit).toBe('mL/kg/min');
    expect(findMetric('vo2_max').category).toBe('activity');
  });

  it('places menstrual cycle day and hydration under existing body category (D1)', () => {
    expect(findMetric('cycle_day').category).toBe('body');
    expect(findMetric('hydration').category).toBe('body');
    expect(findMetric('hydration').unit).toBe('mL');
  });

  it('blood_oxygen_saturation alias spo2_stream does not collide with vital-sign spo2', () => {
    // Namespaces are deliberately split: the vital-sign `spo2` lives on the
    // observation registry; the stream metric lives here. Alias string must
    // not be `spo2` to avoid cross-registry confusion.
    expect(findMetric('spo2_stream').canonical).toBe('blood_oxygen_saturation');
    // Calling findMetric with bare 'spo2' must NOT resolve here.
    expect(() => findMetric('spo2' as MetricName)).toThrow(/Unknown metric/);
  });
});
