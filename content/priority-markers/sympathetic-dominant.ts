/**
 * Sympathetic-dominant archetype — priority biomarkers.
 *
 * Profile: explicit high stress and poor wind-down. Different from
 * sustained-activator: this one is overtly stressed, not high-output-
 * with-hidden-strain. The clinical concern axis is HPA dysregulation
 * → cardiovascular and metabolic risk, plus suppressed testosterone.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'sympathetic-dominant',
  rationale:
    'Your assessment surfaces chronic stress and a system that cannot get out of activation. Sustained stress drives the HPA axis hard enough that downstream markers move in predictable directions — inflammation rises, glucose handling drifts, testosterone suppresses. The priorities below are what a clinician would investigate first to see how much of the load has reached the bloodwork.',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'hs-CRP',
      rationale:
        'Chronic stress drives systemic low-grade inflammation. hs-CRP is the most informative single marker and one of the cheapest — a persistently elevated value is the signal to investigate underlying mechanisms (sleep apnoea, metabolic syndrome, autoimmune).',
      category: 'inflammation',
      panelAvailability: 'both',
      sortOrder: 0,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      fastingNote: 'Best measured when you are well — a recent cold or injury can raise this temporarily',
    },
    {
      markerName: 'HbA1c',
      rationale:
        'Cortisol elevation under chronic stress accelerates glucose dysregulation. HbA1c shows the three-month average; a creeping value is one of the earliest signs the stress load is reaching metabolic markers.',
      category: 'metabolic',
      panelAvailability: 'both',
      sortOrder: 1,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false, // HbA1c reflects a 3-month average — no fasting needed
    },
    {
      markerName: 'Free testosterone',
      rationale:
        'Chronic stress directly suppresses testosterone via cortisol-mediated pathways. Free testosterone is a more reliable read than total alone, and a depressed value in this profile is often the cause of the recovery, drive, and energy issues that come with the stress pattern.',
      category: 'hormones',
      panelAvailability: 'both',
      sortOrder: 2,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      fastingNote: 'Best taken in the morning, when testosterone naturally peaks',
    },
    {
      markerName: 'AM cortisol',
      rationale:
        'Direct measurement of the axis under load. Serum AM cortisol on a basic panel is reasonable for an initial look; flat or inverted patterns are the signal a clinician would investigate further with a salivary day-curve.',
      category: 'hormones',
      panelAvailability: 'both',
      sortOrder: 3,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      // ADVISOR-REVIEW (TIMING-SENSITIVE): serum cortisol is strongly diurnal
      // and the reference interval assumes a sample drawn in a tight morning
      // window (commonly ~08:00–09:00). The exact window and whether to advise
      // it to users needs clinical sign-off before launch — this descriptive
      // note is a placeholder for the advisor, not a directive.
      fastingNote: 'This test must be taken in the morning, ideally around 8–9am, for the result to be interpretable',
    },
  ],
});
