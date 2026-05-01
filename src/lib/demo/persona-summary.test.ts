import { describe, expect, it } from 'vitest';
import { formatValue, getMetricSummary } from './persona-summary';

describe('getMetricSummary', () => {
  it('returns null for unknown metric keys', () => {
    expect(getMetricSummary('does_not_exist')).toBeNull();
  });

  it('reads displayName, unit, decimals, cadence straight from MetricSpec', () => {
    // Spot-check a metric where the fixture spec is the only source of truth
    // for these fields. If MetricSpec ever drifts from these values the
    // assertion fails — by design.
    const summary = getMetricSummary('hba1c_percent');
    expect(summary).not.toBeNull();
    expect(summary!.displayName).toBe('HbA1c');
    expect(summary!.unit).toBe('%');
    expect(summary!.cadence).toBe('quarterly');
    expect(summary!.decimals).toBe(2);
  });

  describe('improvement / direction encoding', () => {
    // The MetricCard arrow on /demo derives the visible arrow from
    // (direction, improvement). Locking these pairings here guards
    // against the inversion bug that prompted COR-001.
    it('encodes lower-is-better metrics with improvement="down"', () => {
      const hba1c = getMetricSummary('hba1c_percent');
      expect(hba1c!.improvement).toBe('down');
    });

    it('encodes higher-is-better metrics with improvement="up"', () => {
      const sleep = getMetricSummary('sleep_efficiency_pct');
      const testo = getMetricSummary('free_testosterone_pg_ml');
      expect(sleep!.improvement).toBe('up');
      expect(testo!.improvement).toBe('up');
    });

    it('marks the persona "improved" on lower-is-better metrics that recover post-inflection', () => {
      // Persona arc: HbA1c drifts up pre-intervention to ~6.10 at
      // inflection, then recovers post-intervention to ~5.78. The
      // honest direction comes from comparing last (post-recovery)
      // against preInflection (peak), not against the noisy first
      // sample at baseline.
      const hba1c = getMetricSummary('hba1c_percent');
      expect(hba1c!.last).toBeLessThan(hba1c!.preInflection);
      expect(hba1c!.direction).toBe('improved');
    });

    it('marks the persona "improved" on higher-is-better metrics that rise post-inflection', () => {
      const sleep = getMetricSummary('sleep_efficiency_pct');
      expect(sleep!.last).toBeGreaterThan(sleep!.preInflection);
      expect(sleep!.direction).toBe('improved');
    });
  });

  describe('series shape', () => {
    it('downsamples a daily 720-point series to exactly 90 samples', () => {
      const sleep = getMetricSummary('sleep_efficiency_pct');
      // Daily cadence over 24 months = 720 points pre-downsample.
      // The exact 90 contract guards against off-by-one drift in downsample.
      expect(sleep!.values.length).toBe(90);
    });

    it('keeps quarterly series intact (8 points fits under maxPoints)', () => {
      const hba1c = getMetricSummary('hba1c_percent');
      expect(hba1c!.values.length).toBe(8);
    });

    it('places inflectionIndex strictly inside the downsampled series', () => {
      const sleep = getMetricSummary('sleep_efficiency_pct');
      expect(sleep!.inflectionIndex).toBeGreaterThan(0);
      expect(sleep!.inflectionIndex).toBeLessThan(sleep!.values.length - 1);
    });
  });

  it('is deterministic across repeated calls (process-cache safe)', () => {
    const a = getMetricSummary('hba1c_percent');
    const b = getMetricSummary('hba1c_percent');
    expect(a!.values).toEqual(b!.values);
    expect(a!.first).toBe(b!.first);
    expect(a!.last).toBe(b!.last);
  });
});

describe('formatValue', () => {
  it('rounds to the requested decimals', () => {
    expect(formatValue(5.876, 2)).toBe('5.88');
    expect(formatValue(120.4, 0)).toBe('120');
  });
});
