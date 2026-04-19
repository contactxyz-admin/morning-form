import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Energy & fatigue scribe — generalist-with-scope scope.
 *
 * Fatigue crosses iron, sleep, thyroid, and mood. A specialist-GP scribe
 * here is the generalist triage — comparing the patient's labs against
 * reference ranges, recognizing patterns in self-reported check-ins and
 * wearable history, surfacing citations from prior notes, and defining the
 * specific terms that show up in those notes (e.g., "TSH", "HbA1c"). It does
 * not prescribe; the outOfScopeRoute is GP prep so anything ambiguous lands
 * in the patient's next-visit brief.
 */
export const ENERGY_FATIGUE_POLICY: SafetyPolicy = {
  topicKey: 'energy-fatigue',
  allowedJudgmentKinds: [
    'reference-range-comparison',
    'pattern-vs-own-history',
    'citation-surfacing',
    'definition-lookup',
  ],
  forbiddenPhrasePatterns: FORBIDDEN_PHRASE_PATTERNS,
  minCitationDensityPerSection: 0.5,
  outOfScopeRoute: 'gpPrep',
};
