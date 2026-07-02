/**
 * Demographic (sex- and age-specific) reference ranges (audit item A6).
 *
 * A single population band is wrong for markers whose normal range depends on
 * sex or age — most starkly testosterone (a man's and a woman's "normal" barely
 * overlap) and PSA (rises with age). This module holds curated, cited
 * demographic bands and resolves the one appropriate to a user's sex-at-birth
 * and age. `compare_to_reference_range` prefers a demographic band over the
 * generic captured range when one exists for the user's demographic.
 *
 * Deliberately conservative: a band is returned ONLY when the demographic is
 * unambiguous (e.g. testosterone needs a known sex; PSA needs a known male age).
 * When sex/age is missing or ambiguous the resolver returns null and the caller
 * falls back to the lab's captured range — never a guessed demographic.
 *
 * Sources are carried on each band for transparency (the scribe can cite them):
 *  - Haemoglobin (sex): UK adult reference (men 130–170, women 120–160 g/L).
 *  - Ferritin (sex + menopause age): men 30–400; premenopausal women 15–200;
 *    postmenopausal (~>50) women ≈ men (30–400) µg/L.
 *  - Testosterone (men): Travison et al. 2017, harmonized reference range,
 *    nonobese men 19–39: 264–916 ng/dL → 9.2–31.8 nmol/L (÷28.84).
 *  - Testosterone (women): MedlinePlus adult female ranges.
 *  - PSA (men, age-specific): Oesterling et al. 1993.
 *
 * Reachability note: `compare_to_reference_range` is topic-scoped, so a band
 * only surfaces through the scribe for a marker some topic scopes. Today the
 * iron topic scopes haemoglobin + ferritin (so those are live), while the
 * testosterone/PSA bands are correct and tested but only surface once a topic
 * scopes those markers (no hormone/prostate topic exists yet).
 *
 * Pure and dependency-free.
 */

export type SexAtBirth = 'male' | 'female';

export interface Demographics {
  sexAtBirth?: SexAtBirth | null;
  /** Whole years; derive from birth year via `ageFromBirthYear`. */
  ageYears?: number | null;
}

export interface DemographicRange {
  low: number | null;
  high: number | null;
  unit: string;
  /** Human-readable citation for the band (shown/audited, never fabricated). */
  source: string;
}

/**
 * Normalise a free-form captured sex value to a band-eligible sex, or null.
 * Only unambiguous male/female values map; anything else (intersex, "other",
 * "prefer not to say", empty) returns null so no sex-specific band is applied.
 */
export function normalizeSexAtBirth(raw: string | null | undefined): SexAtBirth | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'man' || s === 'boy') return 'male';
  if (s === 'female' || s === 'f' || s === 'woman' || s === 'girl') return 'female';
  return null;
}

/** Age in whole years from a birth year, or null when implausible/missing. */
export function ageFromBirthYear(
  birthYear: number | null | undefined,
  referenceYear: number,
): number | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const age = referenceYear - birthYear;
  if (age < 0 || age > 120) return null;
  return age;
}

type Resolver = (d: Demographics) => DemographicRange | null;

// Haemoglobin (sex-specific). Same resolver under both spellings of the key.
const haemoglobinResolver: Resolver = ({ sexAtBirth }) => {
  if (sexAtBirth === 'male') return { low: 130, high: 170, unit: 'g/L', source: 'UK adult reference (men)' };
  if (sexAtBirth === 'female') return { low: 120, high: 160, unit: 'g/L', source: 'UK adult reference (women)' };
  return null;
};

const RESOLVERS: Readonly<Record<string, Resolver>> = {
  haemoglobin: haemoglobinResolver,
  hemoglobin: haemoglobinResolver,

  // Ferritin — sex-specific; premenopausal women run lower, postmenopausal
  // (~>50) converge on the male range.
  ferritin: ({ sexAtBirth, ageYears }) => {
    if (sexAtBirth === 'male') {
      return { low: 30, high: 400, unit: 'ug/L', source: 'Adult reference (men)' };
    }
    if (sexAtBirth === 'female') {
      if (ageYears != null && ageYears > 50) {
        return { low: 30, high: 400, unit: 'ug/L', source: 'Adult reference (postmenopausal women, ~>50)' };
      }
      return { low: 15, high: 200, unit: 'ug/L', source: 'Adult reference (premenopausal women)' };
    }
    return null;
  },

  // Total testosterone — sex is decisive; women additionally shift after ~50.
  testosterone_total: ({ sexAtBirth, ageYears }) => {
    if (sexAtBirth === 'male') {
      return {
        low: 9.2,
        high: 31.8,
        unit: 'nmol/L',
        source: 'Travison 2017 harmonized (men, 264–916 ng/dL)',
      };
    }
    if (sexAtBirth === 'female') {
      if (ageYears != null && ageYears > 50) {
        return { low: 0.1, high: 1.4, unit: 'nmol/L', source: 'MedlinePlus (women >50)' };
      }
      return { low: 0.3, high: 1.7, unit: 'nmol/L', source: 'MedlinePlus (women 17–50)' };
    }
    return null;
  },

  // PSA — age-specific; defined for men. Require a known male age (never assume).
  psa: ({ sexAtBirth, ageYears }) => {
    if (sexAtBirth !== 'male' || ageYears == null) return null;
    if (ageYears < 50) return { low: 0, high: 2.5, unit: 'ug/L', source: 'Oesterling 1993 age-specific PSA (40–49)' };
    if (ageYears < 60) return { low: 0, high: 3.5, unit: 'ug/L', source: 'Oesterling 1993 age-specific PSA (50–59)' };
    if (ageYears < 70) return { low: 0, high: 4.5, unit: 'ug/L', source: 'Oesterling 1993 age-specific PSA (60–69)' };
    return { low: 0, high: 6.5, unit: 'ug/L', source: 'Oesterling 1993 age-specific PSA (70–79)' };
  },
};

/**
 * The demographic reference band for a marker given a user's demographics, or
 * null when we have no curated band for that marker/demographic (caller then
 * falls back to the captured range).
 */
export function resolveDemographicRange(
  canonicalKey: string,
  demographics: Demographics,
): DemographicRange | null {
  const resolver = RESOLVERS[canonicalKey.toLowerCase()];
  if (!resolver) return null;
  return resolver(demographics);
}

/** Marker canonicalKeys that have at least one demographic band (for tests/introspection). */
export const DEMOGRAPHIC_RANGE_MARKERS: readonly string[] = Object.keys(RESOLVERS);
