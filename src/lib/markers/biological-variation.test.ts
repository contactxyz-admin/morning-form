import { describe, expect, it } from 'vitest';
import {
  BIOLOGICAL_VARIATION,
  RCV_Z_BIDIRECTIONAL_95,
  referenceChangeValuePct,
  getReferenceChangeValuePct,
  exceedsReferenceChangeValue,
} from './biological-variation';

describe('referenceChangeValuePct', () => {
  it('computes Z·√2·√(CVA²+CVI²)', () => {
    // HbA1c: CVA 1.0, CVI 1.9 → 1.96·√2·√(1+3.61) ≈ 5.95%.
    expect(referenceChangeValuePct(1.0, 1.9)).toBeCloseTo(5.95, 1);
    // Cholesterol: CVA 3.0, CVI 6.0 → ≈ 18.6%.
    expect(referenceChangeValuePct(3.0, 6.0)).toBeCloseTo(18.59, 1);
  });

  it('scales with Z', () => {
    const z196 = referenceChangeValuePct(3, 6, 1.96);
    const z165 = referenceChangeValuePct(3, 6, 1.65);
    expect(z165).toBeLessThan(z196);
    expect(RCV_Z_BIDIRECTIONAL_95).toBe(1.96);
  });
});

describe('getReferenceChangeValuePct', () => {
  it('resolves a known marker (case-insensitive)', () => {
    expect(getReferenceChangeValuePct('hba1c')).toBeCloseTo(5.95, 1);
    expect(getReferenceChangeValuePct('HbA1c')).toBeCloseTo(5.95, 1);
  });

  it('returns null for a marker with no biological-variation data', () => {
    expect(getReferenceChangeValuePct('vitamin_d')).toBeNull();
    expect(getReferenceChangeValuePct('nonsense_marker')).toBeNull();
  });
});

describe('BIOLOGICAL_VARIATION table invariants', () => {
  it('every entry models CVA as the desirable spec (~0.5·CVI) and yields a positive RCV', () => {
    for (const [key, bv] of Object.entries(BIOLOGICAL_VARIATION)) {
      expect(bv.cviPct, key).toBeGreaterThan(0);
      expect(bv.cvaPct, key).toBeGreaterThan(0);
      // CVA ≈ 0.5·CVI (rounded to 1 dp) — the documented modelling convention.
      expect(Math.abs(bv.cvaPct - bv.cviPct * 0.5), key).toBeLessThanOrEqual(0.1);
      expect(referenceChangeValuePct(bv.cvaPct, bv.cviPct), key).toBeGreaterThan(0);
    }
  });
});

describe('exceedsReferenceChangeValue', () => {
  it('is true only when the |%change| clears the RCV', () => {
    // HbA1c RCV ≈ 5.95%.
    expect(exceedsReferenceChangeValue(40, 44, 5.95)).toBe(true); // +10%
    expect(exceedsReferenceChangeValue(40, 42, 5.95)).toBe(false); // +5%
  });

  it('is symmetric in direction (uses |change|)', () => {
    expect(exceedsReferenceChangeValue(44, 40, 5.95)).toBe(true); // −9.1%
    expect(exceedsReferenceChangeValue(42, 40, 5.95)).toBe(false); // −4.8%
  });

  it('returns true when the baseline is 0 or non-finite (cannot assess ⇒ do not suppress)', () => {
    expect(exceedsReferenceChangeValue(0, 5, 10)).toBe(true);
    expect(exceedsReferenceChangeValue(Number.NaN, 5, 10)).toBe(true);
  });
});
