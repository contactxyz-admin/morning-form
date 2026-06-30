import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Iron scribe — biomarker specialist scope.
 *
 * A specialist GP with an iron-status remit classifies ferritin / Hb / MCV /
 * transferrin saturation values against reference ranges, recognizes patterns
 * in the patient's own history, and surfaces what the patient's own notes
 * already say. They do not define general medical terms (that's the
 * energy-fatigue scribe's remit) and they do not prescribe.
 */
export const IRON_POLICY: SafetyPolicy = {
  topicKey: 'iron',
  allowedJudgmentKinds: [
    'reference-range-comparison',
    'pattern-vs-own-history',
    'citation-surfacing',
    'investigation-avenues',
    // Descriptive trend over dated history (plan 2026-06-30-001 U13) — the
    // enforce structural rule requires every trend section to cite its dated
    // values; enabling it in production is gated on clinical-advisor sign-off.
    'trend-description',
  ],
  forbiddenPhrasePatterns: FORBIDDEN_PHRASE_PATTERNS,
  minCitationDensityPerSection: 0.5,
  outOfScopeRoute: 'discussWithClinician',
};
