import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS,
  ageInDays,
  effectiveConfidence,
} from './confidence';

describe('ageInDays', () => {
  const DAY = 24 * 60 * 60 * 1000;
  it('measures forward elapsed days, floored at 0', () => {
    expect(ageInDays(0, 10 * DAY)).toBe(10);
    expect(ageInDays(10 * DAY, 0)).toBe(0); // future reference → 0
  });
  it('returns 0 for non-finite inputs', () => {
    expect(ageInDays(Number.NaN, 10 * DAY)).toBe(0);
  });
});

describe('effectiveConfidence', () => {
  it('does not decay a fresh reading', () => {
    expect(effectiveConfidence(1, 0)).toBe(1);
    expect(effectiveConfidence(0.8, 0)).toBe(0.8);
  });

  it('halves at the half-life and quarters at two half-lives', () => {
    const hl = EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS;
    expect(effectiveConfidence(1, hl)).toBeCloseTo(0.5, 6);
    expect(effectiveConfidence(1, 2 * hl)).toBeCloseTo(0.25, 6);
  });

  it('is < stored for ANY positive age (B4 acceptance: stale → confidence < 1)', () => {
    for (const age of [1, 30, 90, 365]) {
      expect(effectiveConfidence(1, age)).toBeLessThan(1);
    }
  });

  it('is monotonically decreasing in age', () => {
    const ages = [0, 10, 30, 90, 180, 365, 720];
    const vals = ages.map((a) => effectiveConfidence(1, a));
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThanOrEqual(vals[i - 1]);
  });

  it('scales with the stored value (a retest that restores stored 1 undoes decay)', () => {
    expect(effectiveConfidence(0.5, EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS)).toBeCloseTo(0.25, 6);
    // A fresh retest (age 0) on a full-confidence node reads back at 1.
    expect(effectiveConfidence(1, 0)).toBe(1);
  });

  it('clamps stored to [0,1] and treats non-finite stored as fully confident', () => {
    expect(effectiveConfidence(1.5, 0)).toBe(1);
    expect(effectiveConfidence(-0.2, 0)).toBe(0);
    expect(effectiveConfidence(Number.NaN, 0)).toBe(1);
  });

  it('never decays upward for future-dated or invalid half-life inputs', () => {
    expect(effectiveConfidence(0.6, -5)).toBe(0.6);
    expect(effectiveConfidence(0.6, 100, 0)).toBe(0.6);
    expect(effectiveConfidence(0.6, 100, -10)).toBe(0.6);
  });
});
