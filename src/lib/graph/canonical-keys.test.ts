import { describe, expect, it } from 'vitest';
import { CANONICAL_KEY_RE, canonicalKeyFor, slugify } from './canonical-keys';

describe('slugify', () => {
  it('lowercases and underscores separators', () => {
    expect(slugify('GP Surgery')).toBe('gp_surgery');
  });

  it('strips stopwords case-insensitively', () => {
    expect(slugify('The GP Surgery')).toBe('gp_surgery');
    expect(slugify('At The GP Surgery')).toBe('gp_surgery');
    expect(slugify('THE GP SURGERY')).toBe('gp_surgery');
  });

  it('collapses punctuation to a single underscore', () => {
    expect(slugify('A & E (Resus)')).toBe('e_resus');
  });

  it('returns empty string for stopword-only input', () => {
    expect(slugify('the of and')).toBe('');
  });
});

describe("canonicalKeyFor('encounter', …)", () => {
  it('builds encounter_<date>_<slug> from ISO date + service display', () => {
    expect(
      canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'GP surgery' }),
    ).toBe('encounter_2026_03_12_gp_surgery');
  });

  it('returns the same key when the service display differs by stopwords and case', () => {
    const a = canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'GP Surgery' });
    const b = canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'The GP Surgery' });
    const c = canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'gp surgery' });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('accepts a Date instance and zero-pads month/day', () => {
    const d = new Date('2026-01-05T09:15:00Z');
    expect(
      canonicalKeyFor('encounter', { date: d, serviceDisplay: 'Walk-in clinic' }),
    ).toBe('encounter_2026_01_05_walk_in_clinic');
  });

  it('falls back to bare date when serviceDisplay slugifies to empty', () => {
    expect(
      canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'the of and' }),
    ).toBe('encounter_2026_03_12');
  });
});

describe("canonicalKeyFor('allergy', …)", () => {
  it('normalises case variants to the same key via the registry', () => {
    expect(canonicalKeyFor('allergy', 'peanut')).toBe('peanut');
    expect(canonicalKeyFor('allergy', 'Peanuts')).toBe('peanut');
    expect(canonicalKeyFor('allergy', 'PEANUT')).toBe('peanut');
  });

  it('strips variant names like "Penicillin V" back to the canonical drug', () => {
    expect(canonicalKeyFor('allergy', 'Penicillin V')).toBe('penicillin');
    expect(canonicalKeyFor('allergy', 'Penicillins')).toBe('penicillin');
  });

  it('falls back to slugified label for unknown reactants', () => {
    const key = canonicalKeyFor('allergy', 'Brazilian beeswax');
    expect(key).toBe('brazilian_beeswax');
  });

  it('throws on empty label', () => {
    expect(() => canonicalKeyFor('allergy', '   ')).toThrow();
  });
});

describe("canonicalKeyFor('immunisation', …)", () => {
  it('resolves "Pfizer COVID-19 (3rd dose)" to covid19_pfizer via the registry', () => {
    expect(canonicalKeyFor('immunisation', 'Pfizer COVID-19 (3rd dose)')).toBe('covid19_pfizer');
  });

  it('drops dose/booster noise via longest-alias substring match', () => {
    expect(canonicalKeyFor('immunisation', 'MMR booster')).toBe('mmr');
    expect(canonicalKeyFor('immunisation', 'Flu jab 2025/26')).toBe('influenza');
  });

  it('falls back to slugified label for unknown vaccines', () => {
    expect(canonicalKeyFor('immunisation', 'Bespoke Travel Vaccine')).toBe('bespoke_travel_vaccine');
  });
});

describe("canonicalKeyFor('symptom_episode', …)", () => {
  it('builds episode_<yyyy>_<mm>_<dd>_<hhmmss> from an ISO onset timestamp', () => {
    expect(
      canonicalKeyFor('symptom_episode', { onsetAt: '2026-03-12T14:45:00Z' }),
    ).toBe('episode_2026_03_12_144500');
  });

  it('zero-pads hour, minute, and second', () => {
    expect(
      canonicalKeyFor('symptom_episode', { onsetAt: '2026-03-12T04:05:07Z' }),
    ).toBe('episode_2026_03_12_040507');
  });

  it('folds parentSymptomKey into the key so concurrent episodes do not collide', () => {
    expect(
      canonicalKeyFor('symptom_episode', {
        onsetAt: '2026-03-12T14:45:00Z',
        parentSymptomKey: 'migraine',
      }),
    ).toBe('episode_migraine_2026_03_12_144500');
  });

  it('throws on an invalid onset timestamp', () => {
    expect(() => canonicalKeyFor('symptom_episode', { onsetAt: 'not-a-date' })).toThrow();
  });

  it('throws when parentSymptomKey violates the canonical-key grammar', () => {
    expect(() =>
      canonicalKeyFor('symptom_episode', {
        onsetAt: '2026-03-12T14:45:00Z',
        parentSymptomKey: 'Bad Key',
      }),
    ).toThrow();
  });
});

describe('every generated key matches CANONICAL_KEY_RE', () => {
  const samples: string[] = [
    canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'GP surgery' }),
    canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'the of and' }),
    canonicalKeyFor('allergy', 'Penicillin V'),
    canonicalKeyFor('allergy', 'Brazilian beeswax'),
    canonicalKeyFor('immunisation', 'Pfizer COVID-19 (3rd dose)'),
    canonicalKeyFor('immunisation', 'Bespoke Travel Vaccine'),
    canonicalKeyFor('symptom_episode', { onsetAt: '2026-03-12T14:45:00Z' }),
  ];

  it.each(samples)('matches regex: %s', (key) => {
    expect(key).toMatch(CANONICAL_KEY_RE);
  });
});
