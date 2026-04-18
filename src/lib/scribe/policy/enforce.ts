/**
 * Clinical safety policy enforcement — see docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md (U2, D2).
 *
 * This is the single most important correctness surface in the scribe plan.
 * Every violation is a potential clinical harm or regulatory breach, so the
 * function is deliberately pure: no I/O, no network, no mutation of its
 * inputs, no hidden state.
 *
 * Three checks, in order:
 *   1. `judgmentKind` must be non-null AND present in `allowedJudgmentKinds`
 *      — otherwise `'out-of-scope-routed'`. This is categorical: no
 *      content-level fix can rescue an out-of-scope judgment, so we stop here
 *      and let the caller route (GP prep or clinician handoff).
 *   2. Forbidden phrase patterns — drugs, dose strings, imperative verbs.
 *      Any hit rejects the candidate. We scan the full output, not just
 *      sections, so boilerplate headers can't smuggle a dose string through.
 *   3. Citation density per section — every section's (citationCount /
 *      paragraphCount) must meet the policy floor.
 *
 * Steps 2 and 3 both run even when one fails, so a single enforce() call
 * surfaces every violation at once — the LLM can fix them in one remedial
 * retry instead of an N-round back-and-forth.
 */

import type {
  EnforceResult,
  PolicyCandidate,
  PolicyViolation,
  SafetyPolicy,
} from './types';

export function enforce(
  policy: SafetyPolicy,
  candidate: PolicyCandidate,
): EnforceResult {
  // 1. Judgment kind — categorical; no content-level rescue.
  if (candidate.judgmentKind === null) {
    return {
      ok: false,
      classification: 'out-of-scope-routed',
      violations: [
        {
          kind: 'unknown-judgment-kind',
          detail: 'Candidate declared no judgmentKind; routing out-of-scope.',
        },
      ],
    };
  }
  if (!policy.allowedJudgmentKinds.includes(candidate.judgmentKind)) {
    return {
      ok: false,
      classification: 'out-of-scope-routed',
      violations: [
        {
          kind: 'judgment-kind-not-allowed',
          detail: `Judgment kind '${candidate.judgmentKind}' is not within the ${policy.topicKey} scribe's scope of practice.`,
        },
      ],
    };
  }

  // 2. Forbidden phrases — scan the whole output. We collect every match so
  //    the remedial path sees all violations in one shot.
  const phraseViolations: PolicyViolation[] = [];
  for (const pattern of policy.forbiddenPhrasePatterns) {
    const match = candidate.output.match(pattern);
    if (match) {
      phraseViolations.push({
        kind: 'forbidden-phrase',
        detail: `Output contains a forbidden phrase pattern (${pattern.source}).`,
        match: match[0],
      });
    }
  }

  // 3. Citation density per section.
  const densityViolations: PolicyViolation[] = [];
  for (const section of candidate.sections) {
    if (section.paragraphCount <= 0) continue;
    const density = section.citationCount / section.paragraphCount;
    if (density < policy.minCitationDensityPerSection) {
      densityViolations.push({
        kind: 'insufficient-citation-density',
        detail: `Section '${section.heading}' has density ${density.toFixed(2)} (< floor ${policy.minCitationDensityPerSection}).`,
        sectionHeading: section.heading,
      });
    }
  }

  const allViolations = [...phraseViolations, ...densityViolations];
  if (allViolations.length === 0) {
    return { ok: true, classification: 'clinical-safe', violations: [] };
  }
  return {
    ok: false,
    classification: 'rejected',
    violations: allViolations,
  };
}
