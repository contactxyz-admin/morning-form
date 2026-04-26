import { FORBIDDEN_PHRASE_PATTERNS } from './forbidden-phrases';
import type { SafetyPolicy } from './types';

/**
 * General-care scribe — first-contact triage scope.
 *
 * The general scribe owns the chat by default. It triages across every
 * registered domain, answers directly when a triage-level answer suffices,
 * and consults specialists (via the `refer_to_specialist` tool) when a
 * deeper reading of the patient's data would meaningfully change the
 * answer. The remit covers all four judgment kinds because the general
 * scribe must be able to define terms, compare to reference ranges, spot
 * patterns in the user's history, and surface citations the user already
 * has — those are the same primitives a triage GP uses.
 *
 * Distinct from energy-fatigue (a fatigue specialist with a triage flavor)
 * and from the three core specialists; this policy is the umbrella under
 * which any conversation lives when the router cannot identify a specific
 * specialist topic, plus any conversation explicitly routed to 'general'.
 */
export const GENERAL_POLICY: SafetyPolicy = {
  topicKey: 'general',
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
