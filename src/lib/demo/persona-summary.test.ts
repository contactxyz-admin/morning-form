import { describe, expect, it } from 'vitest';
import { arrowFor, downsample, formatValue, getMetricSummary } from './persona-summary';

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

    // Every metric promoted to HEADLINE_METRICS in src/app/demo/page.tsx
    // is editorially load-bearing — its blurb claims a recovery story.
    // Lock the data to match the copy, so noise can't accidentally swing
    // a quarterly metric (8 points, low-N) into a "worsened" arrow on
    // production. If a future fixture tweak breaks one of these, this
    // test fails loudly rather than letting the demo overview mislead.
    //
    // Determinism note: this relies on PERSONA_SEED being stable. The
    // generator's seed-determinism invariant is pinned separately by
    // prisma/fixtures/synthetic/metabolic-persona.test.ts; if the seed
    // ever changes, re-verify these direction reads against the new draw.
    it.each([
      'hba1c_percent',
      'systolic_bp_mmhg_morning',
      'sleep_efficiency_pct',
      'free_testosterone_pg_ml',
    ])('headline metric %s reads as improved', (metric) => {
      const summary = getMetricSummary(metric);
      expect(summary).not.toBeNull();
      // toMatchObject so a failure dump shows the full summary (first,
      // last, preInflection, delta) — direction-only assertions are
      // thin: a future regression should surface "where" not just "what".
      expect(summary!).toMatchObject({ direction: 'improved' });
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

describe('downsample', () => {
  it('returns empty for empty input regardless of maxPoints', () => {
    expect(downsample([], 90)).toEqual([]);
    expect(downsample([], 1)).toEqual([]);
    expect(downsample([], 0)).toEqual([]);
  });

  it('returns at most one sample when maxPoints < 2', () => {
    // The interior loop divides by (maxPoints - 1), so any value below
    // 2 must short-circuit before that math runs.
    expect(downsample([10, 20, 30], 1)).toEqual([10]);
    expect(downsample([10, 20, 30], 0)).toEqual([10]);
  });

  it('returns a copy unchanged when values.length <= maxPoints', () => {
    const input = [1, 2, 3];
    const out = downsample(input, 5);
    expect(out).toEqual([1, 2, 3]);
    // It must be a copy, not the same reference — callers that mutate
    // their slice should not corrupt the source.
    expect(out).not.toBe(input);
  });

  it('picks the first and last sample on the exact-equal boundary', () => {
    // When values.length === maxPoints exactly, the implementation
    // returns a copy. The two endpoints are preserved.
    const input = [10, 20, 30, 40];
    const out = downsample(input, 4);
    expect(out[0]).toBe(10);
    expect(out[out.length - 1]).toBe(40);
  });

  it('downsamples evenly and preserves first + last endpoints', () => {
    const input = Array.from({ length: 720 }, (_, i) => i);
    const out = downsample(input, 90);
    expect(out.length).toBe(90);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(719);
  });
});

describe('arrowFor', () => {
  // Four-quadrant truth table for (direction, improvement). The arrow
  // tracks the *physical* direction of the line. This guards the
  // COR-001 inversion class — both reachable quadrants today (improved
  // x up/down) AND the worsened quadrants that will become reachable
  // when a worsened-direction metric appears in HEADLINE_METRICS.
  it('improved + up → up arrow (e.g. sleep efficiency rising)', () => {
    expect(arrowFor({ direction: 'improved', improvement: 'up' })).toBe('↗');
  });

  it('improved + down → down arrow (e.g. HbA1c falling)', () => {
    expect(arrowFor({ direction: 'improved', improvement: 'down' })).toBe('↘');
  });

  it('worsened + up → down arrow (higher-is-better metric falling)', () => {
    expect(arrowFor({ direction: 'worsened', improvement: 'up' })).toBe('↘');
  });

  it('worsened + down → up arrow (lower-is-better metric rising)', () => {
    expect(arrowFor({ direction: 'worsened', improvement: 'down' })).toBe('↗');
  });
});
