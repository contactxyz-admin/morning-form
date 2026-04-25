import { describe, expect, it } from 'vitest';
import {
  clamp,
  gaussian,
  generateSeries,
  makeRng,
  roundTo,
  type SeriesSpec,
} from './generators';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng(42);
    const b = makeRng(43);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('gaussian', () => {
  it('approximates N(0, 1)', () => {
    const rng = makeRng(11);
    const n = 10_000;
    const samples = Array.from({ length: n }, () => gaussian(rng));
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(variance).toBeGreaterThan(0.9);
    expect(variance).toBeLessThan(1.1);
  });
});

describe('clamp', () => {
  it('returns x when in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps to min when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it('clamps to max when above', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('roundTo', () => {
  it('rounds to the requested decimals', () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(1.235, 2)).toBe(1.24);
    expect(roundTo(99.999, 1)).toBe(100);
  });
});

describe('generateSeries', () => {
  const flatSpec: SeriesSpec = {
    baseline: 100,
    trendPre: 0,
    trendPost: 0,
    inflection: 50,
    phi: 0,
    sigma: 0,
    min: -Infinity,
    max: Infinity,
  };

  it('is deterministic given the same seed', () => {
    const a = generateSeries(makeRng(123), 30, {
      ...flatSpec,
      sigma: 5,
      phi: 0.7,
    });
    const b = generateSeries(makeRng(123), 30, {
      ...flatSpec,
      sigma: 5,
      phi: 0.7,
    });
    expect(a).toEqual(b);
  });

  it('returns the baseline when noise and trend are zero', () => {
    const series = generateSeries(makeRng(1), 10, flatSpec);
    expect(series.every((v) => v === 100)).toBe(true);
  });

  it('honors the inflection: post slope is < 50% of pre slope when configured', () => {
    // Zero noise so we can read the slopes directly.
    const spec: SeriesSpec = {
      baseline: 100,
      trendPre: 1,
      trendPost: 0.3, // 30% of pre
      inflection: 12,
      phi: 0,
      sigma: 0,
      min: -Infinity,
      max: Infinity,
    };
    const n = 24;
    const series = generateSeries(makeRng(0), n, spec);
    const preSlope = (series[12] - series[0]) / 12;
    const postSlope = (series[23] - series[12]) / 11;
    expect(preSlope).toBeCloseTo(1, 5);
    expect(postSlope).toBeCloseTo(0.3, 5);
    // Post-inflection slope is at most 50% of pre — the plan's sanity check.
    expect(postSlope).toBeLessThanOrEqual(preSlope * 0.5);
  });

  it('clamps values to [min, max]', () => {
    const spec: SeriesSpec = {
      baseline: 0,
      trendPre: 0,
      trendPost: 0,
      inflection: 0,
      phi: 0,
      sigma: 100, // huge noise
      min: -2,
      max: 2,
    };
    const series = generateSeries(makeRng(99), 1000, spec);
    expect(series.every((v) => v >= -2 && v <= 2)).toBe(true);
  });
});
