import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS,
  ageInDays,
  effectiveConfidence,
  confidenceDecayLoss,
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

describe('confidenceDecayLoss (staleness magnitude, base-level independent)', () => {
  const hl = EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS;

  it('is 0 for a fresh reading regardless of base confidence', () => {
    expect(confidenceDecayLoss(1, 0)).toBe(0);
    expect(confidenceDecayLoss(0.3, 0)).toBe(0);
  });

  it('equals the confidence given up to decay (stored − effective)', () => {
    expect(confidenceDecayLoss(1, hl)).toBeCloseTo(0.5, 6); // 1 → 0.5
    expect(confidenceDecayLoss(0.5, hl)).toBeCloseTo(0.25, 6); // 0.5 → 0.25
  });

  it('does NOT charge low authored confidence as staleness', () => {
    // A low-confidence but barely-aged node has almost no *loss* (the review
    // finding: the old -(1-effConf) form would have charged ~0.7 here).
    const loss = confidenceDecayLoss(0.3, 1, hl);
    expect(loss).toBeLessThan(0.01);
    // …while a full-confidence, year-stale node has a large loss.
    expect(confidenceDecayLoss(1, 365, hl)).toBeGreaterThan(loss);
  });

  it('is bounded in [0, stored] and monotonically increasing in age', () => {
    const ages = [0, 30, 90, 180, 365, 720];
    const vals = ages.map((a) => confidenceDecayLoss(0.8, a, hl));
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.8);
    }
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
  });
});
