/**
 * Flat-liner archetype — priority biomarkers.
 *
 * Profile: low morning AND low afternoon energy. Energy never gets
 * going. This is the classic fatigue presentation, and the cohort
 * where a blood panel returns the highest yield of findings in men:
 * iron deficiency (without anaemia), hypothyroidism, secondary
 * hypogonadism, vitamin D deficit, and obstructive sleep apnoea in
 * higher-BMI presentations.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'flat-liner',
  rationale:
    'Your assessment surfaces persistently low energy across the day — a pattern where the system never gets going. In men, this is the presentation where bloodwork most often returns an actionable finding: iron handling, thyroid function, hormone axis, vitamin D status. The priorities below are the highest-yield panel a GP would work through, ranked by underdiagnosis rate rather than alphabetically.',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'Ferritin',
      rationale:
        'Iron deficiency without anaemia is the most underdiagnosed cause of fatigue in men. The bar to investigate it is low; ferritin in single digits or low teens is meaningful even when haemoglobin reads normal.',
      category: 'iron',
      panelAvailability: 'both',
      sortOrder: 0,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
    },
    {
      markerName: 'TSH and Free T4',
      rationale:
        'Hypothyroidism is a classic differential in flat low energy. TSH alone catches most cases; pairing with Free T4 distinguishes primary from central patterns and is what a clinician would order at the same time.',
      category: 'thyroid',
      panelAvailability: 'both',
      sortOrder: 1,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      // ADVISOR-REVIEW: TSH has a diurnal rhythm (higher in the early morning);
      // for tracking over time a consistent morning sample is preferable. Noted
      // descriptively rather than as a hard requirement.
      fastingNote: 'A morning sample is preferable when tracking thyroid levels over time',
    },
    {
      markerName: 'Total testosterone, Free testosterone, SHBG',
      rationale:
        'Secondary hypogonadism is more common in this profile than the public conversation suggests. Total testosterone is the screening number; free testosterone and SHBG together tell you whether a borderline total is functionally low or carrier-mediated.',
      category: 'hormones',
      panelAvailability: 'both',
      sortOrder: 2,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      // ADVISOR-REVIEW: testosterone has a marked morning peak; guidelines call
      // for a sample taken in the morning (typically before 11am). Stated
      // descriptively for the user.
      fastingNote: 'Best taken in the morning, when testosterone naturally peaks',
    },
    {
      markerName: 'Vitamin D (25-OH)',
      rationale:
        'Vitamin D deficit is consistently present in low-energy presentations, especially after winter or in indoor-workers. Cheap to measure, common to find.',
      category: 'micronutrients',
      panelAvailability: 'both',
      sortOrder: 3,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
    },
    {
      markerName: 'hs-CRP',
      rationale:
        'A persistently elevated hs-CRP in a flat-energy presentation is the signal that something inflammatory is driving the picture — chronic infection, autoimmune process, or undiagnosed sleep apnoea. A normal value reassures; an elevated value sharpens the next conversation.',
      category: 'inflammation',
      panelAvailability: 'both',
      sortOrder: 4,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      // ADVISOR-REVIEW: hs-CRP is non-specific; a recent infection or injury
      // transiently raises it. Best measured when you are well, not acutely ill.
      fastingNote: 'Best measured when you are well — a recent cold or injury can raise this temporarily',
    },
  ],
});
