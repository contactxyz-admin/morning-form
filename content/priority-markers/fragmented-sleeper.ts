/**
 * Fragmented-sleeper archetype — priority biomarkers.
 *
 * Profile: frequent night waking or variable continuity, low morning
 * energy despite hours in bed, decent afternoon energy. The presenting
 * problem is sleep quality, not duration. In men, the highest-yield
 * differential is: iron handling (frequently underdiagnosed without
 * anaemia), subclinical thyroid drift, vitamin D deficit, and the
 * sleep-apnoea / metabolic-syndrome feedback loop.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'fragmented-sleeper',
  rationale:
    'Your assessment points to disrupted sleep continuity rather than insufficient time in bed — the kind of pattern that leaves you tired in the morning even when the sleep tracker says you got eight hours. In men, the differential a GP typically works through is iron stores, thyroid baseline, vitamin D status, and the early metabolic markers that overlap with sleep apnoea. The priorities below are the cheapest panel that surfaces the most-missed causes.',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'Ferritin',
      rationale:
        'Iron stores depleted without anaemia is one of the most underdiagnosed causes of poor sleep continuity in men, especially those who train, donate blood, or eat plant-forward. Ferritin can be in single digits while haemoglobin reads normal.',
      category: 'iron',
      panelAvailability: 'both',
      sortOrder: 0,
    },
    {
      markerName: 'TSH and Free T4',
      rationale:
        'Subclinical thyroid drift produces fragmented sleep in male presentations more than guidance suggests. TSH alone misses the moves; pairing with Free T4 is what a clinician would want to see.',
      category: 'thyroid',
      panelAvailability: 'both',
      sortOrder: 1,
    },
    {
      markerName: 'Vitamin D (25-OH)',
      rationale:
        'Vitamin D status correlates with sleep architecture — REM and slow-wave proportions both. UK winters consistently produce levels low enough to matter in men who work indoors, and US Northern-state results echo this.',
      category: 'micronutrients',
      panelAvailability: 'both',
      sortOrder: 2,
    },
    {
      markerName: 'HbA1c',
      rationale:
        'Fragmented sleep and early metabolic dysregulation feed each other — sleep apnoea is the unifying mechanism. HbA1c is the simplest first look; a high-normal result is the cue to investigate sleep apnoea more directly.',
      category: 'metabolic',
      panelAvailability: 'both',
      sortOrder: 3,
    },
  ],
});
