import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * Hormonal & endocrine scribe — thyroid, sex hormones, cortisol,
 * adrenal patterns, metabolic hormone signaling.
 *
 * Endocrine markers are tightly coupled to metabolic and energy
 * patterns; this specialist focuses on reading hormone panels (TSH,
 * free T4, testosterone, estradiol, cortisol curves) against typical
 * ranges and over time. Definition lookup is allowed because endocrine
 * vocabulary frequently is the answer (subclinical hypothyroidism,
 * cortisol awakening response, free T3:T4 ratios).
 *
 * outOfScopeRoute is `discussWithClinician` because hormonal questions
 * frequently border on prescribing territory and a real clinician
 * conversation is the right safety net.
 */
export const HORMONAL_ENDOCRINE_POLICY: SafetyPolicy = {
  topicKey: 'hormonal-endocrine',
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
