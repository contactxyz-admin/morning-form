import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Cardiometabolic scribe — heart, vascular, glucose, lipids, blood
 * pressure, weight regulation, iron-deficiency anemia, metabolic
 * syndrome.
 *
 * The cardiometabolic specialist owns the bridge between iron status,
 * lipid panels, glucose markers, and vascular signals. It compares
 * patient values to reference ranges, identifies trends in the
 * patient's own history, and surfaces citations from prior labs and
 * notes. Definition lookup is included because lipid and glucose
 * vocabulary (LDL-C, HbA1c, ApoB) is dense enough that explaining the
 * term IS often the answer.
 *
 * `iron` remains a separate topic-policy entry for back-compat with
 * existing iron Scribe rows; semantically it is a sub-domain under
 * cardiometabolic that the registry exposes under both keys.
 */
export const CARDIOMETABOLIC_POLICY: SafetyPolicy = {
  topicKey: 'cardiometabolic',
  allowedJudgmentKinds: [
    'reference-range-comparison',
    'pattern-vs-own-history',
    'citation-surfacing',
    'definition-lookup',
  ],
  forbiddenPhrasePatterns: FORBIDDEN_PHRASE_PATTERNS,
  minCitationDensityPerSection: 0.5,
  outOfScopeRoute: 'discussWithClinician',
};
