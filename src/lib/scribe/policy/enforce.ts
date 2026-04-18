/**
 * Clinical safety policy enforcement — see docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md (U2, D2).
 *
 * This is the single most important correctness surface in the scribe plan.
 * Every violation is a potential clinical harm or regulatory breach, so the
 * function is deliberately pure: no I/O, no network, no mutation of its
 * inputs, no hidden state.
 *
 * Three checks — forbidden phrases run FIRST and DOMINATE, because a drug
 * name or dose string is unsafe regardless of whether the scribe believed
 * it was within scope. The remaining checks only run on otherwise-clean
 * output:
 *   1. Forbidden phrase patterns (dominates) — drugs, dose strings,
 *      imperative verbs. Any hit rejects the candidate. We scan the full
 *      output, not just sections, so boilerplate headers can't smuggle a
 *      dose string through — and we scan even when `judgmentKind` is null
 *      or disallowed, so an "out of scope" wrapper cannot launder a drug
 *      mention.
 *   2. `judgmentKind` must be non-null AND present in `allowedJudgmentKinds`
 *      — otherwise `'out-of-scope-routed'`. This is categorical: no
 *      content-level fix can rescue an out-of-scope judgment, so we stop here
 *      and let the caller route (GP prep or clinician handoff).
 *   3. Citation density per section — every section's (citationCount /
 *      paragraphCount) must meet the policy floor. A `citation-surfacing`
 *      judgment with zero sections cannot vacuously pass — citation-surfacing
 *      means "point at your source" and an empty sections array is either a
 *      bug or a model trying to skip the requirement.
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
  // 1. Forbidden phrases — dominates. Runs before the judgment-kind gate so
  //    an out-of-scope wrapper cannot hide a drug mention.
  const phraseViolations = scanForbiddenPhrases(
    candidate.output,
    policy.forbiddenPhrasePatterns,
  );
  if (phraseViolations.length > 0) {
    return {
      ok: false,
      classification: 'rejected',
      violations: phraseViolations,
    };
  }

  // 2. Judgment kind — categorical; no content-level rescue.
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

  // 3. Citation density per section.
  const densityViolations: PolicyViolation[] = [];
  // Guard: citation-surfacing requires at least one section. An empty
  // sections array would otherwise vacuously pass the density loop — the
  // scribe must actually point at a source to call itself citation-surfacing.
  if (candidate.judgmentKind === 'citation-surfacing' && candidate.sections.length === 0) {
    densityViolations.push({
      kind: 'insufficient-citation-density',
      detail:
        'Citation-surfacing judgments require at least one section with a citation; received zero sections.',
      sectionHeading: '(no sections)',
    });
  }
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

  if (densityViolations.length === 0) {
    return { ok: true, classification: 'clinical-safe', violations: [] };
  }
  return {
    ok: false,
    classification: 'rejected',
    violations: densityViolations,
  };
}

/**
 * Collect every forbidden-phrase match in `text`, one violation per match.
 * Callers reuse this on the compile-time annotation merge path so a drug
 * mention inside `ScribeAnnotation.content` is caught by the same rule-set
 * that scans the raw `output` text. Patterns without the `g` flag are
 * cloned with `g` added — `String.prototype.match(non-global)` would
 * return only the first hit, causing stacked violations to under-count.
 */
export function scanForbiddenPhrases(
  text: string,
  patterns: readonly RegExp[],
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const pattern of patterns) {
    const global = pattern.flags.includes('g')
      ? pattern
      : new RegExp(pattern.source, pattern.flags + 'g');
    for (const match of Array.from(text.matchAll(global))) {
      violations.push({
        kind: 'forbidden-phrase',
        detail: `Text contains a forbidden phrase pattern (${pattern.source}).`,
        match: match[0],
      });
    }
  }
  return violations;
}
