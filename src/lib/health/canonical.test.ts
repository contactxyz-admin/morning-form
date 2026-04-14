import { describe, expect, it } from 'vitest';
import {
  CANONICAL_METRICS,
  aliasFor,
  canonicalFor,
  categoryFor,
  findMetric,
  unitFor,
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
    expect(() => unitFor('not_a_metric')).toThrow(/Unknown metric/);
    expect(() => categoryFor('not_a_metric')).toThrow(/Unknown metric/);
    expect(() => canonicalFor('not_an_alias')).toThrow(/Unknown metric alias/);
    expect(() => aliasFor('not_canonical')).toThrow(/Unknown canonical metric/);
  });

  it('locks the rule-engine alias contract (every alias the suggestions engine reads)', () => {
    const aliases = CANONICAL_METRICS.map((m) => m.alias).sort();
    expect(aliases).toEqual(
      [
        'active_minutes',
        'avg_hr',
        'calories',
        'deep_sleep',
        'duration',
        'efficiency',
        'glucose_fasting',
        'hrv',
        'max_hr',
        'readiness_score',
        'recovery_score',
        'rem_sleep',
        'respiratory_rate',
        'resting_hr',
        'steps',
        'strain',
        'temperature_delta',
      ].sort(),
    );
  });
});
