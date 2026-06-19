import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Medication & supplement review scribe — the in-lane "pharma specialist"
 * (Plan 2026-06-19-001 Unit 3).
 *
 * This specialist exists to turn "should I take X?" into a clinician-ready
 * conversation: it surfaces the GENERAL evidence picture and names the
 * question to raise with a clinician or pharmacist. It NEVER recommends, never
 * names a dose or a specific brand/compound, never asserts efficacy. The
 * accountable human — the clinician — makes the call.
 *
 * The bound is structural, not just prompt-deep:
 *   - `allowedJudgmentKinds` is the tightest discuss-only pair —
 *     `citation-surfacing` (point at the general evidence) and
 *     `investigation-avenues` (name what to discuss / investigate). It is
 *     deliberately NOT allowed `reference-range-comparison` or
 *     `pattern-vs-own-history`: making a call on the member's own values is
 *     the domain specialists' / clinician's job, not this one's.
 *   - `outOfScopeRoute: 'discussWithClinician'` — anything beyond surfacing +
 *     investigation hands off to a clinician conversation.
 *   - `forbiddenPhrasePatterns` is the shared global set, so a named compound,
 *     dose, or imperative ("take …") in the output is rejected by enforce()
 *     regardless of what the model intended.
 */
export const MEDICATION_SUPPLEMENT_POLICY: SafetyPolicy = {
  topicKey: 'medication-supplement',
  allowedJudgmentKinds: ['citation-surfacing', 'investigation-avenues'],
  forbiddenPhrasePatterns: FORBIDDEN_PHRASE_PATTERNS,
  minCitationDensityPerSection: 0.5,
  outOfScopeRoute: 'discussWithClinician',
};
