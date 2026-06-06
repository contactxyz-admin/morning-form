/**
 * Sustained-activator archetype — priority biomarkers.
 *
 * Profile: high afternoon energy, poor downshift ability, focus or sleep
 * goal. The clinical picture is a high-functioning operator running on
 * sympathetic activation — the kind of person who reports good output but
 * struggles to switch off. The risks are hidden, not loud: cardiovascular
 * markers worsening under chronic activation, metabolic flexibility
 * dropping while energy is maintained by compensation, testosterone
 * quietly suppressing.
 *
 * Marker selection prioritises the cheapest signals for each risk axis a
 * GP would investigate in this presentation.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'sustained-activator',
  rationale:
    'Your profile points to sustained sympathetic activation — high output through the day but a system that struggles to transition into rest. People in this pattern often run well-compensated for years while underlying markers drift. The priorities below are the cheapest signals to surface what is moving underneath: chronic low-grade inflammation, metabolic flexibility, hormone axis status, and the cardiovascular risk that chronic activation accelerates.',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'hs-CRP',
      rationale:
        'Chronic sympathetic activation correlates with persistent low-grade systemic inflammation. hs-CRP is the cheapest marker to detect it, and a normal value is reassuring even when other tests are normal.',
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
        'High-output profiles often maintain energy through metabolic compensation. HbA1c surfaces glucose dysregulation before fasting glucose moves, and is the standard three-month average a clinician would want first.',
      category: 'metabolic',
      panelAvailability: 'both',
      sortOrder: 1,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false, // HbA1c reflects a 3-month average — no fasting needed
    },
    {
      markerName: 'Free testosterone + SHBG',
      rationale:
        'Chronic stress suppresses the hypothalamic-pituitary-gonadal axis. Free testosterone (paired with SHBG to interpret it correctly) shows whether your energy is being sustained at the cost of your hormone axis rather than alongside it.',
      category: 'hormones',
      panelAvailability: 'both',
      sortOrder: 2,
      sampleType: 'Standard venous blood draw',
      fastingRequired: false,
      // ADVISOR-REVIEW: testosterone morning peak — sample before 11am.
      fastingNote: 'Best taken in the morning, when testosterone naturally peaks',
    },
    {
      markerName: 'ApoB',
      rationale:
        'Cardiovascular risk accumulates silently under chronic sympathetic activation. ApoB is a single-number summary of atherogenic particle count that outperforms LDL alone, and is increasingly the marker preventive clinicians track from the start in this profile.',
      category: 'cardio',
      panelAvailability: 'both',
      sortOrder: 3,
      sampleType: 'Standard venous blood draw',
      // ADVISOR-REVIEW: modern lipid guidance accepts non-fasting ApoB; some
      // labs still request fasting if a full lipid panel with triglycerides is
      // run at the same time.
      fastingRequired: false,
    },
  ],
});
