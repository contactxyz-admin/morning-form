import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Sleep & recovery scribe — wearable-biometric specialist scope.
 *
 * A specialist GP for sleep compares nightly HRV, RHR, and sleep-stage
 * signals against typical ranges, tracks patterns in the patient's own
 * baseline over time, and points back to the source metric row. Definition
 * lookup is delegated to energy-fatigue; the sleep scribe stays anchored to
 * the patient's own data.
 */
export const SLEEP_RECOVERY_POLICY: SafetyPolicy = {
  topicKey: 'sleep-recovery',
  allowedJudgmentKinds: [
    'reference-range-comparison',
    'pattern-vs-own-history',
    'citation-surfacing',
    'investigation-avenues',
    // Descriptive trend over dated history (plan 2026-06-30-001 U13); advisor
    // sign-off gates go-live, enforce requires every trend section to cite.
    'trend-description',
  ],
  forbiddenPhrasePatterns: FORBIDDEN_PHRASE_PATTERNS,
  minCitationDensityPerSection: 0.5,
  outOfScopeRoute: 'gpPrep',
};
