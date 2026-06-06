/**
 * Well-regulated archetype — priority biomarkers.
 *
 * Profile: decent baseline across sleep, stress, and morning energy.
 * The clinical posture shifts from diagnostic ("what is causing the
 * symptom") to preventive ("what should we track from this baseline").
 * Marker selection prioritises the markers preventive medicine
 * literature treats as the most informative single-number summaries
 * for cardiovascular and metabolic risk.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'well-regulated',
  rationale:
    'Your assessment shows a balanced baseline — decent sleep, manageable stress, energy that holds through the day. The bloodwork question shifts from "what is causing the symptom" to "what is worth tracking from this baseline so we see drift before it becomes a problem." The priorities below are the markers preventive medicine literature treats as the most informative single-number summaries for cardiovascular and metabolic risk in a healthy cohort.',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'ApoB',
      rationale:
        'ApoB counts the atherogenic particles directly and outperforms LDL alone for cardiovascular risk stratification. In a healthy baseline cohort it is the single number most worth tracking over time — drift up is the earliest actionable signal.',
      category: 'cardio',
      panelAvailability: 'both',
      sortOrder: 0,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
    },
    {
      markerName: 'HbA1c',
      rationale:
        'A baseline HbA1c against which to track drift over years is the cheapest metabolic insurance policy a healthy person can buy. Fasting glucose moves too late; HbA1c surfaces the average and is what preventive medicine watches.',
      category: 'metabolic',
      panelAvailability: 'both',
      sortOrder: 1,
    },
    {
      markerName: 'Vitamin D (25-OH)',
      rationale:
        'Vitamin D deficit is common even in well-regulated cohorts, particularly after UK winters or for indoor-workers in any latitude. Cheap to measure, common to find low, simple to address.',
      category: 'micronutrients',
      panelAvailability: 'both',
      sortOrder: 2,
    },
    {
      markerName: 'hs-CRP',
      rationale:
        'A baseline hs-CRP gives you a reference point for tracking inflammation over time. In a well-regulated profile the value should be low; drift up later is one of the earliest signals that something has shifted, even before symptoms.',
      category: 'inflammation',
      panelAvailability: 'both',
      sortOrder: 3,
    },
  ],
});
