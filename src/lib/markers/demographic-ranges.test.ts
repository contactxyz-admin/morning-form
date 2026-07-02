import { describe, expect, it } from 'vitest';
import {
  normalizeSexAtBirth,
  ageFromBirthYear,
  resolveDemographicRange,
} from './demographic-ranges';

describe('normalizeSexAtBirth', () => {
  it('maps unambiguous male/female variants', () => {
    for (const v of ['male', 'Male', 'M', 'man', ' MALE ']) expect(normalizeSexAtBirth(v)).toBe('male');
    for (const v of ['female', 'F', 'Woman']) expect(normalizeSexAtBirth(v)).toBe('female');
  });

  it('returns null for ambiguous / other / empty values', () => {
    for (const v of ['', null, undefined, 'other', 'intersex', 'prefer not to say', 'nonbinary']) {
      expect(normalizeSexAtBirth(v)).toBeNull();
    }
  });
});

describe('ageFromBirthYear', () => {
  it('computes whole-year age', () => {
    expect(ageFromBirthYear(1990, 2026)).toBe(36);
  });
  it('rejects missing or implausible years', () => {
    expect(ageFromBirthYear(null, 2026)).toBeNull();
    expect(ageFromBirthYear(2030, 2026)).toBeNull(); // future
    expect(ageFromBirthYear(1800, 2026)).toBeNull(); // >120
  });
});

describe('resolveDemographicRange — testosterone_total (sex-decisive)', () => {
  it('returns the Travison harmonized band for men', () => {
    const r = resolveDemographicRange('testosterone_total', { sexAtBirth: 'male', ageYears: 25 });
    expect(r).toMatchObject({ low: 9.2, high: 31.8, unit: 'nmol/L' });
    expect(r?.source).toContain('Travison');
    // Same band across ages for men (Travison is a single harmonized adult range).
    expect(resolveDemographicRange('testosterone_total', { sexAtBirth: 'male', ageYears: 70 })).toMatchObject({
      low: 9.2,
      high: 31.8,
    });
  });

  it('returns the age-shifted female band', () => {
    expect(resolveDemographicRange('testosterone_total', { sexAtBirth: 'female', ageYears: 30 })).toMatchObject({
      low: 0.3,
      high: 1.7,
    });
    expect(resolveDemographicRange('testosterone_total', { sexAtBirth: 'female', ageYears: 60 })).toMatchObject({
      low: 0.1,
      high: 1.4,
    });
  });

  it('female band defaults to the 17–50 range when age is unknown', () => {
    expect(resolveDemographicRange('testosterone_total', { sexAtBirth: 'female' })).toMatchObject({
      low: 0.3,
      high: 1.7,
    });
  });

  it('returns null when sex is unknown (never guesses a testosterone band)', () => {
    expect(resolveDemographicRange('testosterone_total', { ageYears: 25 })).toBeNull();
    expect(resolveDemographicRange('testosterone_total', { sexAtBirth: null, ageYears: 25 })).toBeNull();
  });

  it('varies by sex for the same value — the core A6 acceptance', () => {
    const male = resolveDemographicRange('testosterone_total', { sexAtBirth: 'male', ageYears: 40 });
    const female = resolveDemographicRange('testosterone_total', { sexAtBirth: 'female', ageYears: 40 });
    expect(male?.high).not.toBe(female?.high);
    expect(male!.low).toBeGreaterThan(female!.high!); // ranges don't even overlap
  });
});

describe('resolveDemographicRange — psa (age-specific, men)', () => {
  it('returns the Oesterling age band for men', () => {
    expect(resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 45 })).toMatchObject({ high: 2.5 });
    expect(resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 55 })).toMatchObject({ high: 3.5 });
    expect(resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 65 })).toMatchObject({ high: 4.5 });
    expect(resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 75 })).toMatchObject({ high: 6.5 });
  });

  it('varies by age band — the core A6 acceptance', () => {
    const young = resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 45 });
    const old = resolveDemographicRange('psa', { sexAtBirth: 'male', ageYears: 75 });
    expect(young?.high).not.toBe(old?.high);
  });

  it('returns null when sex is not male or age is unknown (never assumes)', () => {
    expect(resolveDemographicRange('psa', { sexAtBirth: 'female', ageYears: 65 })).toBeNull();
    expect(resolveDemographicRange('psa', { ageYears: 65 })).toBeNull();
    expect(resolveDemographicRange('psa', { sexAtBirth: 'male' })).toBeNull();
  });
});

describe('resolveDemographicRange — haemoglobin (sex, iron-topic-scoped/live)', () => {
  it('returns sex-specific bands (both spellings of the key)', () => {
    expect(resolveDemographicRange('haemoglobin', { sexAtBirth: 'male' })).toMatchObject({ low: 130, high: 170 });
    expect(resolveDemographicRange('haemoglobin', { sexAtBirth: 'female' })).toMatchObject({ low: 120, high: 160 });
    expect(resolveDemographicRange('hemoglobin', { sexAtBirth: 'male' })).toMatchObject({ low: 130, high: 170 });
  });
  it('returns null when sex is unknown (falls back to captured range)', () => {
    expect(resolveDemographicRange('haemoglobin', {})).toBeNull();
  });
});

describe('resolveDemographicRange — ferritin (sex + menopause age, iron-topic-scoped/live)', () => {
  it('varies by sex and by menopause age', () => {
    expect(resolveDemographicRange('ferritin', { sexAtBirth: 'male', ageYears: 40 })).toMatchObject({ low: 30, high: 400 });
    expect(resolveDemographicRange('ferritin', { sexAtBirth: 'female', ageYears: 35 })).toMatchObject({ low: 15, high: 200 });
    expect(resolveDemographicRange('ferritin', { sexAtBirth: 'female', ageYears: 60 })).toMatchObject({ low: 30, high: 400 });
  });
  it('premenopausal band is the default female band when age is unknown', () => {
    expect(resolveDemographicRange('ferritin', { sexAtBirth: 'female' })).toMatchObject({ low: 15, high: 200 });
  });
  it('returns null when sex is unknown', () => {
    expect(resolveDemographicRange('ferritin', { ageYears: 40 })).toBeNull();
  });
});

describe('resolveDemographicRange — markers without a demographic band', () => {
  it('returns null so the caller falls back to the captured range', () => {
    expect(resolveDemographicRange('creatinine', { sexAtBirth: 'male', ageYears: 40 })).toBeNull();
    expect(resolveDemographicRange('hba1c', { sexAtBirth: 'female', ageYears: 40 })).toBeNull();
  });
});
