import { describe, expect, it } from 'vitest';
import {
  BIOLOGICAL_VARIATION,
  RCV_Z_BIDIRECTIONAL_95,
  referenceChangeValue,
  getReferenceChangeValue,
  exceedsReferenceChangeValue,
} from './biological-variation';

describe('referenceChangeValue (log-normal, asymmetric)', () => {
  it('computes rise/fall limits from CVA and CVI', () => {
    // HbA1c (CVA 1.0, CVI 1.9): up ≈ 6.13%, down ≈ 5.78%.
    const hba1c = referenceChangeValue(1.0, 1.9);
    expect(hba1c.upPct).toBeCloseTo(6.13, 1);
    expect(hba1c.downPct).toBeCloseTo(5.78, 1);
    // Cholesterol/creatinine (CVA 3.0, CVI 6.0): up ≈ 20.4%, down ≈ 17.0%.
    const chol = referenceChangeValue(3.0, 6.0);
    expect(chol.upPct).toBeCloseTo(20.42, 1);
    expect(chol.downPct).toBeCloseTo(16.96, 1);
  });

  it('the rise limit always exceeds the fall limit (log-normal skew)', () => {
    for (const [key, bv] of Object.entries(BIOLOGICAL_VARIATION)) {
      const rcv = referenceChangeValue(bv.cvaPct, bv.cviPct);
      expect(rcv.upPct, key).toBeGreaterThan(rcv.downPct);
      expect(rcv.downPct, key).toBeGreaterThan(0);
    }
  });

  it('scales with Z', () => {
    expect(referenceChangeValue(3, 6, 1.65).upPct).toBeLessThan(referenceChangeValue(3, 6, 1.96).upPct);
    expect(RCV_Z_BIDIRECTIONAL_95).toBe(1.96);
  });
});

describe('getReferenceChangeValue', () => {
  it('resolves a known marker (case-insensitive)', () => {
    expect(getReferenceChangeValue('hba1c')?.upPct).toBeCloseTo(6.13, 1);
    expect(getReferenceChangeValue('HbA1c')?.downPct).toBeCloseTo(5.78, 1);
    // Ferritin is strongly skewed: up ≈ 55%, down ≈ 35.5%.
    expect(getReferenceChangeValue('ferritin')?.upPct).toBeCloseTo(55.0, 0);
    expect(getReferenceChangeValue('ferritin')?.downPct).toBeCloseTo(35.5, 0);
  });

  it('returns null for a marker with no biological-variation data', () => {
    expect(getReferenceChangeValue('vitamin_d')).toBeNull();
    expect(getReferenceChangeValue('nonsense_marker')).toBeNull();
  });
});

describe('BIOLOGICAL_VARIATION table invariants', () => {
  it('every entry models CVA as the desirable spec (~0.5·CVI)', () => {
    for (const [key, bv] of Object.entries(BIOLOGICAL_VARIATION)) {
      expect(bv.cviPct, key).toBeGreaterThan(0);
      expect(Math.abs(bv.cvaPct - bv.cviPct * 0.5), key).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('exceedsReferenceChangeValue (direction-aware)', () => {
  const hba1c = { upPct: 6.13, downPct: 5.78 };

  it('is true only when a rise clears the up-limit', () => {
    expect(exceedsReferenceChangeValue(40, 44, hba1c)).toBe(true); // +10%
    expect(exceedsReferenceChangeValue(40, 42, hba1c)).toBe(false); // +5%
  });

  it('is true only when a fall clears the down-limit', () => {
    expect(exceedsReferenceChangeValue(44, 40, hba1c)).toBe(true); // −9.1%
    expect(exceedsReferenceChangeValue(42, 40, hba1c)).toBe(false); // −4.8%
  });

  it('applies asymmetric limits by direction (a fall can be real where an equal rise is noise)', () => {
    const skewed = { upPct: 80, downPct: 45 }; // TSH-like
    expect(exceedsReferenceChangeValue(4.0, 6.0, skewed)).toBe(false); // +50% ≤ 80
    expect(exceedsReferenceChangeValue(4.0, 2.0, skewed)).toBe(true); // −50% > 45
  });

  it('does not exceed exactly at the limit (strict >)', () => {
    expect(exceedsReferenceChangeValue(100, 105, { upPct: 5, downPct: 5 })).toBe(false); // +5% == up
    expect(exceedsReferenceChangeValue(100, 95, { upPct: 5, downPct: 5 })).toBe(false); // −5% == down
  });

  it('a flat move never exceeds', () => {
    expect(exceedsReferenceChangeValue(40, 40, hba1c)).toBe(false);
  });

  it('returns true when the baseline is 0 or non-finite (cannot assess ⇒ do not suppress)', () => {
    expect(exceedsReferenceChangeValue(0, 5, hba1c)).toBe(true);
    expect(exceedsReferenceChangeValue(Number.NaN, 5, hba1c)).toBe(true);
  });
});
