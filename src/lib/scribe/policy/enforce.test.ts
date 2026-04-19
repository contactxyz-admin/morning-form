import { describe, expect, it } from 'vitest';
import { enforce } from './enforce';
import { getPolicy, listTopicPolicyKeys } from './registry';
import type { PolicyCandidate, SafetyPolicy } from './types';

const IRON_POLICY = getPolicy('iron')!;
const SLEEP_POLICY = getPolicy('sleep-recovery')!;

function makeCandidate(overrides: Partial<PolicyCandidate>): PolicyCandidate {
  return {
    judgmentKind: 'reference-range-comparison',
    output: '',
    sections: [],
    ...overrides,
  };
}

describe('enforce — happy paths (scope-appropriate, specialist-GP-voice statements)', () => {
  it('accepts a reference-range comparison with citations on the Iron scribe', () => {
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output:
        'Your ferritin of 12 μg/L is below the typical reference range of 15 to 150 μg/L.',
      sections: [
        { heading: 'Iron status', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('clinical-safe');
    expect(result.violations).toEqual([]);
  });

  it('accepts a pattern-vs-own-history judgment on the Sleep scribe', () => {
    const candidate = makeCandidate({
      judgmentKind: 'pattern-vs-own-history',
      output:
        'Your HRV has trended below your 30-day baseline on four of the last seven days.',
      sections: [
        { heading: 'Pattern', paragraphCount: 2, citationCount: 1 },
      ],
    });
    const result = enforce(SLEEP_POLICY, candidate);
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('clinical-safe');
  });

  it('accepts a citation-surfacing statement that points to a source chunk', () => {
    const candidate = makeCandidate({
      judgmentKind: 'citation-surfacing',
      output: 'Your GP note from 2025-11-14 recorded this as iron-deficiency anaemia.',
      sections: [
        { heading: 'From your notes', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('clinical-safe');
  });
});

describe('enforce — out-of-scope routing', () => {
  it('routes a definition-lookup on the Iron scribe out-of-scope (iron only allows range + history + citation)', () => {
    // Iron policy disallows definition-lookup — stays narrow, delegates to the
    // Energy/Fatigue scribe for general medical definitions.
    const candidate = makeCandidate({
      judgmentKind: 'definition-lookup',
      output: 'Iron-deficiency anaemia is defined as …',
      sections: [
        { heading: 'Definition', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('out-of-scope-routed');
    expect(result.violations.some((v) => v.kind === 'judgment-kind-not-allowed')).toBe(true);
  });

  it('routes a null / unknown judgmentKind out-of-scope', () => {
    const candidate = makeCandidate({
      judgmentKind: null,
      output: 'Should I start iron supplements?',
      sections: [
        { heading: 'Question', paragraphCount: 1, citationCount: 0 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('out-of-scope-routed');
    expect(result.violations.map((v) => v.kind)).toContain('unknown-judgment-kind');
  });
});

describe('enforce — forbidden phrases dominate judgment-kind routing', () => {
  it('rejects (not routes out-of-scope) when a null judgmentKind output mentions a drug', () => {
    // Regression: an "I cannot help" preamble that still names a drug must not
    // be laundered through the out-of-scope path. Phrase scan dominates.
    const candidate = makeCandidate({
      judgmentKind: null,
      output: 'I cannot advise on this, but ferrous sulfate is commonly prescribed.',
      sections: [],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.every((v) => v.kind === 'forbidden-phrase')).toBe(true);
  });

  it('rejects (not routes out-of-scope) when a disallowed judgmentKind output mentions a drug', () => {
    // definition-lookup is out-of-scope on Iron, but a drug name still lands
    // in the "rejected" bucket rather than "out-of-scope-routed".
    const candidate = makeCandidate({
      judgmentKind: 'definition-lookup',
      output: 'Iron-deficiency anaemia is treated with ferrous sulfate 65mg.',
      sections: [],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'forbidden-phrase')).toBe(true);
  });
});

describe('enforce — rejection on forbidden phrase patterns', () => {
  it('rejects output containing a drug name + dose (stacked violations)', () => {
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output:
        'Take 65mg ferrous sulfate with vitamin C to boost absorption.',
      sections: [
        { heading: 'Next step', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    const phraseViolations = result.violations.filter((v) => v.kind === 'forbidden-phrase');
    expect(phraseViolations.length).toBeGreaterThanOrEqual(2);
    const matches = phraseViolations.map((v) => v.match?.toLowerCase() ?? '');
    expect(matches.some((m) => m.includes('ferrous'))).toBe(true);
    expect(matches.some((m) => m.includes('65mg') || m.includes('65 mg'))).toBe(true);
  });

  it('rejects an imperative treatment verb ("you should stop taking …")', () => {
    const candidate = makeCandidate({
      judgmentKind: 'pattern-vs-own-history',
      output: 'You should stop taking your current supplement and switch approaches.',
      sections: [
        { heading: 'Advice', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'forbidden-phrase')).toBe(true);
  });
});

describe('enforce — citation density', () => {
  it('rejects a section whose citation density is below the policy floor', () => {
    // 1 citation across 3 paragraphs = 0.33; policy floor is 0.5.
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Ferritin 12 μg/L is below range. More context. Even more context.',
      sections: [
        { heading: 'Iron status', paragraphCount: 3, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(
      result.violations.some(
        (v) => v.kind === 'insufficient-citation-density' && v.sectionHeading === 'Iron status',
      ),
    ).toBe(true);
  });

  it('rejects a scope-appropriate judgment when no citations are present at all', () => {
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Your ferritin is below the reference range.',
      sections: [
        { heading: 'Iron status', paragraphCount: 1, citationCount: 0 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'insufficient-citation-density')).toBe(true);
  });

  it('rejects a citation-surfacing judgment with zero sections (vacuous-pass guard)', () => {
    // Regression: citation-surfacing means "point at your source" — an empty
    // sections array cannot be interpreted as "nothing to cite, therefore
    // passes." A zero-section citation-surfacing claim is always rejected.
    const candidate = makeCandidate({
      judgmentKind: 'citation-surfacing',
      output: 'Your GP note recorded this as iron-deficiency anaemia.',
      sections: [],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'insufficient-citation-density')).toBe(true);
  });

  it('accepts a non-citation-surfacing judgment with zero sections', () => {
    // Sibling of the guard above: an empty sections array is fine for other
    // judgment kinds — only citation-surfacing requires at least one section.
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Your ferritin of 12 ug/L is below the typical reference range.',
      sections: [],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(true);
  });

  it('accepts a section that exactly meets the density floor', () => {
    // 1 citation across 2 paragraphs = 0.5; policy floor is 0.5.
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Your ferritin of 12 μg/L is below the reference range. Context paragraph.',
      sections: [
        { heading: 'Iron status', paragraphCount: 2, citationCount: 1 },
      ],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(true);
  });
});

describe('enforce — purity and determinism', () => {
  it('is pure — the same inputs always produce structurally-equal results', () => {
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Your ferritin of 12 μg/L is below the reference range.',
      sections: [{ heading: 'Iron status', paragraphCount: 1, citationCount: 1 }],
    });
    const a = enforce(IRON_POLICY, candidate);
    const b = enforce(IRON_POLICY, candidate);
    expect(a).toEqual(b);
  });

  it('does not mutate the policy or the candidate', () => {
    const policyClone: SafetyPolicy = {
      topicKey: IRON_POLICY.topicKey,
      allowedJudgmentKinds: [...IRON_POLICY.allowedJudgmentKinds],
      forbiddenPhrasePatterns: [...IRON_POLICY.forbiddenPhrasePatterns],
      minCitationDensityPerSection: IRON_POLICY.minCitationDensityPerSection,
      outOfScopeRoute: IRON_POLICY.outOfScopeRoute,
    };
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'Your ferritin of 12 μg/L is below the reference range.',
      sections: [{ heading: 'Iron status', paragraphCount: 1, citationCount: 1 }],
    });
    enforce(IRON_POLICY, candidate);
    expect(IRON_POLICY.allowedJudgmentKinds).toEqual(policyClone.allowedJudgmentKinds);
    expect(IRON_POLICY.forbiddenPhrasePatterns.length).toBe(
      policyClone.forbiddenPhrasePatterns.length,
    );
    expect(candidate.sections[0].citationCount).toBe(1);
  });
});

describe('registry', () => {
  it('exposes a policy for each v1 topic', () => {
    expect(getPolicy('iron')?.topicKey).toBe('iron');
    expect(getPolicy('sleep-recovery')?.topicKey).toBe('sleep-recovery');
    expect(getPolicy('energy-fatigue')?.topicKey).toBe('energy-fatigue');
  });

  it('returns undefined for an unknown topic', () => {
    expect(getPolicy('cardiology' as string)).toBeUndefined();
  });

  it('lists exactly the three v1 topic keys', () => {
    expect(new Set(listTopicPolicyKeys())).toEqual(
      new Set(['iron', 'sleep-recovery', 'energy-fatigue']),
    );
  });
});
