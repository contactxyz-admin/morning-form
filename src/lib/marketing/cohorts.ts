/**
 * Cohort taxonomy for the SEO/GEO landing system.
 *
 * Eight clusters targeting men 25–50, drawn from the 2026-05-09 plan.
 * Each cohort maps to a collection of pages (e.g., the "fatigue" cohort
 * owns "fatigue-in-men", "ferritin-low-but-haemoglobin-normal",
 * "blood-tests-for-low-energy"). Pages declare `cohortKey` against this
 * taxonomy; the visit-beacon validates inbound cohort values against
 * COHORT_KEYS to prevent analytics pollution.
 */

export const COHORT_KEYS = [
  'fatigue',
  'testosterone',
  'longevity-40',
  'recovery-hrv',
  'metabolic',
  'cardio',
  'fertility',
  'executive',
] as const;

export type CohortKey = (typeof COHORT_KEYS)[number];

export const COHORTS: Record<CohortKey, { label: string; description: string }> = {
  fatigue: {
    label: 'Fatigue',
    description: 'Tired high-performing men, 30–45.',
  },
  testosterone: {
    label: 'Hormones & vitality',
    description: 'Testosterone, libido, hormonal health, 25–50.',
  },
  'longevity-40': {
    label: 'Longevity 40+',
    description: 'Men over 40 focused on prevention and biomarker tracking.',
  },
  'recovery-hrv': {
    label: 'Recovery & HRV',
    description: 'Athletes and recreational lifters, 25–45, recovery-focused.',
  },
  metabolic: {
    label: 'Metabolic',
    description: 'Weight, insulin, glucose; men 30–50.',
  },
  cardio: {
    label: 'Cardiovascular',
    description: 'Cholesterol, ApoB, heart-risk; men 35–50.',
  },
  fertility: {
    label: 'Fertility',
    description: 'Preconception health for men 28–45.',
  },
  executive: {
    label: 'Executive health',
    description: 'Founder/operator performance, men 30–50.',
  },
};

export function isCohortKey(value: unknown): value is CohortKey {
  return typeof value === 'string' && (COHORT_KEYS as readonly string[]).includes(value);
}
