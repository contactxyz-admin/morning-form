/**
 * Over-stimulated archetype — priority biomarkers.
 *
 * Profile: high stimulant sensitivity OR frequent-to-daily anxiety
 * combined with high stress. Acute stress on a sensitive nervous
 * system. The clinical concern axis is HPA axis dysregulation, the
 * thyroid hyperfunction differential (anxiety + stim sensitivity is
 * the classic missed presentation), and inflammation under the load.
 */
import { defineArchetypePriorities } from '@/lib/priority-markers-schema';

export default defineArchetypePriorities({
  archetype: 'over-stimulated',
  rationale:
    'Your assessment surfaces a sensitive nervous system under load — anxiety patterns plus stimulant sensitivity plus persistent stress. The bloodwork differential a clinician would want first is thyroid status (hyperthyroidism mimics this presentation almost exactly), HPA axis indicators, and the inflammation that follows chronic activation. The priorities below are the cheapest panel that distinguishes "stress and sensitivity" from "thyroid dysfunction underneath it."',
  lastReviewedAt: '2026-05-10',
  reviewerKey: 'morning-form-editorial',
  markers: [
    {
      markerName: 'TSH and Free T4',
      rationale:
        'Hyperthyroidism is the classic missed differential in anxiety-with-stimulant-sensitivity presentations. TSH paired with Free T4 is the cheapest exclude; a suppressed TSH in this profile changes the next conversation entirely.',
      category: 'thyroid',
      panelAvailability: 'both',
      sortOrder: 0,
    },
    {
      markerName: 'hs-CRP',
      rationale:
        'Sustained activation drives inflammation regardless of cause. hs-CRP is the cheapest signal that the stress load has reached systemic markers, and is a useful baseline to track whether interventions are moving the underlying state.',
      category: 'inflammation',
      panelAvailability: 'both',
      sortOrder: 1,
    },
    {
      markerName: 'Free testosterone',
      rationale:
        'The cortisol-testosterone axis runs counter-regulatorily — sustained cortisol suppresses testosterone, and a depressed free testosterone is often the cause of the fatigue-on-top-of-anxiety presentation that this profile produces.',
      category: 'hormones',
      panelAvailability: 'both',
      sortOrder: 2,
    },
    {
      markerName: 'Magnesium (RBC where available)',
      rationale:
        'Magnesium status is one of the few micronutrients with a defensible relationship to anxiety patterns. Serum magnesium is on most panels but is a poor reflector of intracellular stores; ask the provider for an RBC magnesium if the standard run is normal but the symptoms persist.',
      category: 'micronutrients',
      panelAvailability: 'neither',
      sortOrder: 3,
    },
  ],
});
