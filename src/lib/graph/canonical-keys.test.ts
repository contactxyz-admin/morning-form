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

  it('accepts a Date instance and folds hhmmss when a time is provided', () => {
    const d = new Date('2026-01-05T09:15:00Z');
    expect(
      canonicalKeyFor('encounter', { date: d, serviceDisplay: 'Walk-in clinic' }),
    ).toBe('encounter_2026_01_05_walk_in_clinic_091500');
  });

  it('zero-pads month/day without folding time when date is midnight UTC', () => {
    expect(
      canonicalKeyFor('encounter', { date: '2026-01-05', serviceDisplay: 'Walk-in clinic' }),
    ).toBe('encounter_2026_01_05_walk_in_clinic');
  });

  it('falls back to bare date when serviceDisplay slugifies to empty', () => {
    expect(
      canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'the of and' }),
    ).toBe('encounter_2026_03_12');
  });

  it('disambiguates same-day same-service encounters via a provider encounterRef', () => {
    const morning = canonicalKeyFor('encounter', {
      date: '2026-03-12',
      serviceDisplay: 'GP surgery',
      encounterRef: 'GPC-9912',
    });
    const afternoon = canonicalKeyFor('encounter', {
      date: '2026-03-12',
      serviceDisplay: 'GP surgery',
      encounterRef: 'GPC-9917',
    });
    expect(morning).not.toBe(afternoon);
    expect(morning).toBe('encounter_2026_03_12_gp_surgery_gpc_9912');
  });

  it('disambiguates same-day same-service encounters via time when no encounterRef', () => {
    const morning = canonicalKeyFor('encounter', {
      date: '2026-03-12T09:15:00Z',
      serviceDisplay: 'GP surgery',
    });
    const afternoon = canonicalKeyFor('encounter', {
      date: '2026-03-12T14:45:00Z',
      serviceDisplay: 'GP surgery',
    });
    expect(morning).not.toBe(afternoon);
    expect(morning).toBe('encounter_2026_03_12_gp_surgery_091500');
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

describe("G5 — canonicalKeyFor('referral', …)", () => {
  it('builds referral_<slug>_<yyyy_mm_dd> from bare date + serviceDisplay', () => {
    expect(
      canonicalKeyFor('referral', { referredAt: '2026-03-04', serviceDisplay: 'Cardiology' }),
    ).toBe('referral_cardiology_2026_03_04');
  });

  it('collapses stopword/case variants to the same key', () => {
    const a = canonicalKeyFor('referral', {
      referredAt: '2026-03-04',
      serviceDisplay: 'Cardiology',
    });
    const b = canonicalKeyFor('referral', {
      referredAt: '2026-03-04',
      serviceDisplay: 'The Cardiology Department',
    });
    expect(a).toBe('referral_cardiology_2026_03_04');
    // "Department" is not a stopword, so b keeps it; this is deliberate —
    // stopword stripping must not obliterate disambiguators like "dept".
    expect(b).toBe('referral_cardiology_department_2026_03_04');
  });

  it('folds hhmmss when a Date instance or timestamped ISO is provided', () => {
    expect(
      canonicalKeyFor('referral', {
        referredAt: '2026-03-04T09:15:00Z',
        serviceDisplay: 'Cardiology',
      }),
    ).toBe('referral_cardiology_2026_03_04_091500');
    expect(
      canonicalKeyFor('referral', {
        referredAt: new Date('2026-03-04T09:15:00Z'),
        serviceDisplay: 'Cardiology',
      }),
    ).toBe('referral_cardiology_2026_03_04_091500');
  });

  it('throws when serviceDisplay slugifies to empty', () => {
    expect(() =>
      canonicalKeyFor('referral', { referredAt: '2026-03-04', serviceDisplay: 'the of and' }),
    ).toThrow();
  });

  it('throws on an invalid referredAt timestamp', () => {
    expect(() =>
      canonicalKeyFor('referral', { referredAt: 'not-a-date', serviceDisplay: 'Cardiology' }),
    ).toThrow();
  });
});

describe("G5 — canonicalKeyFor('procedure', …)", () => {
  it('builds procedure_<slug>_<yyyy_mm_dd>_<hhmmss> from ISO with time', () => {
    expect(
      canonicalKeyFor('procedure', {
        performedAt: '2026-02-10T14:30:00Z',
        procedureDisplay: 'ECG',
      }),
    ).toBe('procedure_ecg_2026_02_10_143000');
  });

  it('omits hhmmss when performedAt is a bare date string (mirrors encounter)', () => {
    expect(
      canonicalKeyFor('procedure', { performedAt: '2026-02-10', procedureDisplay: 'ECG' }),
    ).toBe('procedure_ecg_2026_02_10');
  });

  it('always folds hhmmss when performedAt is a Date instance', () => {
    expect(
      canonicalKeyFor('procedure', {
        performedAt: new Date('2026-02-10T14:30:00Z'),
        procedureDisplay: 'ECG',
      }),
    ).toBe('procedure_ecg_2026_02_10_143000');
  });

  it('folds encounterRef when present (same-day same-procedure disambiguation)', () => {
    expect(
      canonicalKeyFor('procedure', {
        performedAt: '2026-02-10',
        procedureDisplay: 'Blood draw',
        encounterRef: 'EPR-44112',
      }),
    ).toBe('procedure_blood_draw_2026_02_10_epr_44112');
  });

  it('lets encounterRef supersede hhmmss so a timestamped re-import of the same ref collapses', () => {
    // Mirrors encounter semantics. Without this behaviour a system that
    // sometimes sends `performedAt: '2026-02-10'` and sometimes
    // `performedAt: '2026-02-10T14:30:00Z'` for the same logical procedure
    // (same encounterRef) would produce two distinct canonical keys and a
    // duplicate node on re-import.
    const bareDate = canonicalKeyFor('procedure', {
      performedAt: '2026-02-10',
      procedureDisplay: 'Blood draw',
      encounterRef: 'EPR-44112',
    });
    const timestamped = canonicalKeyFor('procedure', {
      performedAt: '2026-02-10T14:30:00Z',
      procedureDisplay: 'Blood draw',
      encounterRef: 'EPR-44112',
    });
    expect(bareDate).toBe(timestamped);
    expect(bareDate).toBe('procedure_blood_draw_2026_02_10_epr_44112');
  });

  it('throws when procedureDisplay slugifies to empty', () => {
    expect(() =>
      canonicalKeyFor('procedure', { performedAt: '2026-02-10', procedureDisplay: 'the of and' }),
    ).toThrow();
  });

  it('throws on an invalid performedAt timestamp', () => {
    expect(() =>
      canonicalKeyFor('procedure', { performedAt: 'not-a-date', procedureDisplay: 'ECG' }),
    ).toThrow();
  });
});

describe("G5 — canonicalKeyFor('intervention_event', …)", () => {
  it('embeds parentKey and eventKind in intervention_event_<parent>_<date>_<kind>', () => {
    expect(
      canonicalKeyFor('intervention_event', {
        parentKey: 'ferrous_sulfate_200mg',
        occurredAt: '2026-03-15',
        eventKind: 'taken_as_prescribed',
      }),
    ).toBe('intervention_event_ferrous_sulfate_200mg_2026_03_15_taken_as_prescribed');
  });

  it('folds hhmmss between date and eventKind when occurredAt has a time', () => {
    expect(
      canonicalKeyFor('intervention_event', {
        parentKey: 'ferrous_sulfate_200mg',
        occurredAt: '2026-03-15T08:00:00Z',
        eventKind: 'taken_as_prescribed',
      }),
    ).toBe('intervention_event_ferrous_sulfate_200mg_2026_03_15_080000_taken_as_prescribed');
  });

  it('folds hhmmss when occurredAt is a Date instance (not just ISO string)', () => {
    // Exercises the `instanceof Date` branch of detectHasTime for this overload.
    expect(
      canonicalKeyFor('intervention_event', {
        parentKey: 'ferrous_sulfate_200mg',
        occurredAt: new Date('2026-03-15T08:00:00Z'),
        eventKind: 'taken_as_prescribed',
      }),
    ).toBe('intervention_event_ferrous_sulfate_200mg_2026_03_15_080000_taken_as_prescribed');
  });

  it('accepts the full closed eventKind enum verbatim (already snake_case)', () => {
    expect(
      canonicalKeyFor('intervention_event', {
        parentKey: 'sertraline_50mg',
        occurredAt: '2026-03-15',
        eventKind: 'side_effect',
      }),
    ).toBe('intervention_event_sertraline_50mg_2026_03_15_side_effect');
  });

  it('throws when parentKey violates the canonical-key grammar', () => {
    expect(() =>
      canonicalKeyFor('intervention_event', {
        parentKey: 'Not A Canonical Key',
        occurredAt: '2026-03-15',
        eventKind: 'taken_as_prescribed',
      }),
    ).toThrow();
  });

  it('throws on an invalid occurredAt timestamp', () => {
    expect(() =>
      canonicalKeyFor('intervention_event', {
        parentKey: 'ferrous_sulfate_200mg',
        occurredAt: 'not-a-date',
        eventKind: 'taken_as_prescribed',
      }),
    ).toThrow();
  });

  it('rejects parentKey with a trailing underscore (would produce double-underscore in output)', () => {
    // Grammar alone can't catch this: CANONICAL_KEY_RE permits `foo_` and the
    // assembled `intervention_event_foo__2026_...` also passes the regex,
    // leaving a silent double-underscore boundary. Guard at the embed site.
    expect(() =>
      canonicalKeyFor('intervention_event', {
        parentKey: 'ferrous_sulfate_200mg_',
        occurredAt: '2026-03-15',
        eventKind: 'taken_as_prescribed',
      }),
    ).toThrow(/trailing|underscore|grammar/i);
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
    canonicalKeyFor('referral', { referredAt: '2026-03-04', serviceDisplay: 'Cardiology' }),
    canonicalKeyFor('procedure', {
      performedAt: '2026-02-10T14:30:00Z',
      procedureDisplay: 'ECG',
    }),
    canonicalKeyFor('intervention_event', {
      parentKey: 'ferrous_sulfate_200mg',
      occurredAt: '2026-03-15',
      eventKind: 'taken_as_prescribed',
    }),
  ];

  it.each(samples)('matches regex: %s', (key) => {
    expect(key).toMatch(CANONICAL_KEY_RE);
  });
});
