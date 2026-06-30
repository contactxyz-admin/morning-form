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
      // Scan-clean on-topic text so this isolates the judgment-kind gate.
      // (A product-form phrase like "iron supplements" would now be caught by
      // the shared medication denylist first and classify 'rejected'.)
      output: 'How should I interpret this iron result?',
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

describe('enforce — investigation-avenues structural citation rule', () => {
  it('accepts an investigation-avenues answer with a citation on every avenue section', () => {
    const candidate = makeCandidate({
      judgmentKind: 'investigation-avenues',
      output: 'Your fatigue could stem from several sources. First, your low ferritin… Next, your sleep HRV pattern…',
      sections: [
        { heading: 'Iron status', paragraphCount: 2, citationCount: 1 },
        { heading: 'Sleep recovery', paragraphCount: 1, citationCount: 1 },
      ],
    });
    const result = enforce(getPolicy('energy-fatigue')!, candidate);
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('clinical-safe');
  });

  it('rejects an investigation-avenues answer with an uncited investigation section', () => {
    const candidate = makeCandidate({
      judgmentKind: 'investigation-avenues',
      output: 'Your fatigue could stem from several sources. First, your low ferritin… Next, your sleep pattern…',
      sections: [
        { heading: 'Iron status', paragraphCount: 1, citationCount: 1 },
        { heading: 'Sleep recovery', paragraphCount: 2, citationCount: 0 },
      ],
    });
    const result = enforce(getPolicy('energy-fatigue')!, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'insufficient-citation-density' && v.sectionHeading === 'Sleep recovery')).toBe(true);
  });

  it('rejects an investigation-avenues answer with zero sections', () => {
    const candidate = makeCandidate({
      judgmentKind: 'investigation-avenues',
      output: 'Several factors may explain your tiredness.',
      sections: [],
    });
    const result = enforce(getPolicy('energy-fatigue')!, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.kind === 'insufficient-citation-density')).toBe(true);
  });

  it('rejects an investigation-avenues section with paragraphCount 0 AND citationCount 0 (vacuous-pass guard)', () => {
    // The generic density loop skips zero-paragraph sections, which would
    // vacuously pass an uncited avenue. The structural branch must catch a
    // section that is both empty and uncited.
    const candidate = makeCandidate({
      judgmentKind: 'investigation-avenues',
      output: 'Your tiredness may have several causes worth investigating.',
      sections: [
        { heading: 'Iron status', paragraphCount: 0, citationCount: 0 },
      ],
    });
    const result = enforce(getPolicy('energy-fatigue')!, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(
      result.violations.some(
        (v) =>
          v.kind === 'insufficient-citation-density' &&
          v.sectionHeading === 'Iron status',
      ),
    ).toBe(true);
  });
});

describe('enforce — dietary directive forbidden phrases', () => {
  it('rejects "increase your intake of"', () => {
    const candidate = makeCandidate({
      judgmentKind: 'reference-range-comparison',
      output: 'You should increase your intake of iron-rich foods.',
      sections: [{ heading: 'Advice', paragraphCount: 1, citationCount: 1 }],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
    expect(result.violations.some((v) => v.match?.includes('increase your intake of'))).toBe(true);
  });

  it('rejects "eat more iron-rich foods"', () => {
    const candidate = makeCandidate({
      judgmentKind: 'pattern-vs-own-history',
      output: 'Eat more iron-rich foods like spinach and red meat.',
      sections: [{ heading: 'Diet', paragraphCount: 1, citationCount: 1 }],
    });
    const result = enforce(IRON_POLICY, candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classification).toBe('rejected');
  });

  // Cover the remaining dietary-directive patterns (those not already exercised
  // by the two cases above) — every pattern in DIETARY_DIRECTIVE_PATTERNS must
  // have a rejecting fixture so a regex regression can't silently widen the net.
  const DIETARY_DIRECTIVE_FIXTURES: Array<[string, string]> = [
    ['you should eat more', 'You should eat more to recover your energy.'],
    ['you should eat less', 'You should eat less in the evenings.'],
    ['you should consume more', 'You should consume more during training blocks.'],
    ['you should consume less', 'You should consume less caffeine at night.'],
    ['consume more protein', 'Consume more protein after your workouts.'],
    ['you need to eat more', 'You need to eat more to hit your targets.'],
    ['you need to consume more', 'You need to consume more during your taper.'],
    ['add more X to your diet', 'Add more spinach to your diet this week.'],
    ['cut out X from your diet', 'Cut out sugar from your diet entirely.'],
    ['reduce your intake of', 'Reduce your intake of red meat going forward.'],
  ];

  it.each(DIETARY_DIRECTIVE_FIXTURES)(
    'rejects the dietary directive: %s',
    (_label, output) => {
      const candidate = makeCandidate({
        judgmentKind: 'pattern-vs-own-history',
        output,
        sections: [{ heading: 'Advice', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('rejected');
      expect(result.violations.some((v) => v.kind === 'forbidden-phrase')).toBe(true);
    },
  );

  // A broad set of legitimate descriptive / non-directive sentences mentioning
  // diet or intake that MUST pass — a single-example net is too thin for a
  // global filter.
  const DESCRIPTIVE_NON_DIRECTIVE: string[] = [
    'Dietary iron intake can influence ferritin levels over time.',
    'Your GP note mentions low dietary iron intake as a contributing factor.',
    'Leafy greens are a common dietary source of folate in the general population.',
    'Red meat is a dietary source of heme iron, which is absorbed efficiently.',
    'Your recent intake of caffeine may correlate with the disrupted sleep onset in your log.',
    'A balanced diet typically includes a range of protein sources.',
  ];

  it.each(DESCRIPTIVE_NON_DIRECTIVE)(
    'accepts the descriptive non-directive sentence: %s',
    (output) => {
      const candidate = makeCandidate({
        judgmentKind: 'reference-range-comparison',
        output,
        sections: [{ heading: 'Iron status', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(true);
    },
  );
});

// False-causality enforcement (longitudinal-trajectory plan 2026-06-30-001 U14).
// Once trends are visible, "X caused Y" is newly tempting; these patterns block
// proven-cause over-claims while the ALLOWED temporal-association vocabulary
// (the design doc §5.3 ✅ examples) must still pass.
describe('enforce — false-causality forbidden phrases', () => {
  // One rejecting fixture per FALSE_CAUSALITY pattern so a regex regression
  // can't silently narrow the net.
  const FALSE_CAUSALITY_FIXTURES: Array<[string, string]> = [
    ['fixed your', 'That change fixed your ferritin in under three months.'],
    ['cured the', 'The new routine cured the fatigue you reported.'],
    ['caused your', 'The change caused your ferritin to fall this quarter.'],
    ['is caused by', 'Your fatigue is caused by the deficiency seen here.'],
    ['made <marker> rise', 'The action made your ferritin rise sharply.'],
    ['because you started', 'Your ferritin rose because you started the new routine.'],
    ['due to your treatment', 'The improvement is due to your treatment over the spring.'],
    ['thanks to your routine', 'Thanks to your new routine, ferritin improved markedly.'],
    // Transitive causal verbs acting on a marker (the common over-claim shapes).
    ['raised your', 'The iron raised your ferritin over the spring.'],
    ['lowered your', 'The supplement lowered your ferritin this quarter.'],
    ['reduced your', 'The change reduced your inflammation markedly.'],
    ['boosted your', 'The protocol boosted your levels within weeks.'],
    ['improved your', 'The supplement improved your ferritin substantially.'],
    ['drove your', 'The routine drove your ferritin up over the quarter.'],
    ['led to a rise', 'The iron led to a rise in your ferritin.'],
    ['responsible for the', 'The supplement is responsible for the rise you see.'],
    ['explains why ... rose', 'This explains why your ferritin rose so sharply.'],
  ];

  it.each(FALSE_CAUSALITY_FIXTURES)(
    'rejects the causal over-claim: %s',
    (_label, output) => {
      const candidate = makeCandidate({
        judgmentKind: 'pattern-vs-own-history',
        output,
        sections: [{ heading: 'Trend', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('rejected');
      expect(result.violations.some((v) => v.kind === 'forbidden-phrase')).toBe(true);
    },
  );

  // Safe temporal-association + retest phrasing (design doc §5.3 ✅) that MUST
  // pass — including the OUTCOME_CHANGED edge rationale template (plan U2).
  const SAFE_ASSOCIATION: string[] = [
    'Your ferritin has risen across your last three tests, moving from below to within the reference range.',
    'This improvement followed the action you started in February; the two coincide in time, and other factors may also contribute.',
    'After you started that change, your ferritin moved upward — a temporal association, not a proven cause.',
    'You have a single reading for vitamin D; a repeat test would confirm whether this is a trend.',
    'A repeat test would confirm this direction.',
    'After the "Track morning sunlight" action, your HRV moved from 40 to 55 over this window. This is a temporal association, not a proven cause; other factors may also contribute.',
    // Precision guards — these MUST pass (regression for the tuned patterns):
    // crediting a PERSON/source is not an intervention-causality over-claim,
    // and "made your decision to improve" is not "made <marker> rise".
    'Thanks to your clinician, we have the GP note for context.',
    'You made your decision to improve your sleep routine, which is recorded here.',
    'Your ferritin improved across the last three readings, now within range.',
  ];

  it.each(SAFE_ASSOCIATION)(
    'accepts the safe association/retest phrasing: %s',
    (output) => {
      const candidate = makeCandidate({
        judgmentKind: 'pattern-vs-own-history',
        output,
        sections: [{ heading: 'Trend', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(true);
    },
  );
});

describe('enforce — regression: existing 4 judgment kinds unaffected', () => {
  const OLD_KINDS = ['reference-range-comparison', 'pattern-vs-own-history', 'citation-surfacing', 'definition-lookup'];

  it('old judgment kinds still pass/fail as before on iron policy', () => {
    for (const kind of OLD_KINDS) {
      const isAllowed = IRON_POLICY.allowedJudgmentKinds.includes(kind as never);
      const candidate = makeCandidate({
        judgmentKind: kind as never,
        output: 'Test output.',
        sections: isAllowed
          ? [{ heading: 'Test', paragraphCount: 1, citationCount: 1 }]
          : [{ heading: 'Test', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      if (isAllowed) {
        expect(result.ok).toBe(true);
      } else {
        expect(result.ok).toBe(false);
      }
    }
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
    expect(getPolicy('not-a-real-topic' as string)).toBeUndefined();
  });

  describe('trend-description judgment kind (plan 2026-06-30-001 U13)', () => {
    const GENERAL_POLICY = getPolicy('general')!;

    it('accepts a cited trend statement on a topic that allows it (iron)', () => {
      const candidate = makeCandidate({
        judgmentKind: 'trend-description',
        output:
          'Your ferritin has risen across your last three tests, moving from below to within the reference range.',
        sections: [{ heading: 'Ferritin trend', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(true);
      expect(result.classification).toBe('clinical-safe');
    });

    it('rejects a trend statement with an UNCITED section (must cite the dated values)', () => {
      const candidate = makeCandidate({
        judgmentKind: 'trend-description',
        output: 'Your ferritin has been rising over the last three readings.',
        sections: [{ heading: 'Ferritin trend', paragraphCount: 1, citationCount: 0 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('rejected');
      expect(result.violations.some((v) => v.kind === 'insufficient-citation-density')).toBe(true);
    });

    it('rejects a trend statement with zero sections (cannot vacuously pass)', () => {
      const candidate = makeCandidate({
        judgmentKind: 'trend-description',
        output: 'Things are trending up.',
        sections: [],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('rejected');
    });

    it('routes out-of-scope on a topic that does NOT allow trend-description (general)', () => {
      const candidate = makeCandidate({
        judgmentKind: 'trend-description',
        output: 'Your marker has risen across your last three tests.',
        sections: [{ heading: 'Trend', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(GENERAL_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('out-of-scope-routed');
      expect(result.violations.some((v) => v.kind === 'judgment-kind-not-allowed')).toBe(true);
    });

    it('a causal over-claim in a trend statement is still rejected (forbidden-phrase dominates)', () => {
      const candidate = makeCandidate({
        judgmentKind: 'trend-description',
        output: 'Your ferritin rose because you started the new supplement.',
        sections: [{ heading: 'Ferritin trend', paragraphCount: 1, citationCount: 1 }],
      });
      const result = enforce(IRON_POLICY, candidate);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.classification).toBe('rejected');
      expect(result.violations.some((v) => v.kind === 'forbidden-phrase')).toBe(true);
    });
  });

  it('lists exactly the policy keys backing every registered scribe persona', () => {
    // Plan 2026-04-25-001 expanded the set: 3 v1 topics + the specialty safety
    // policies (general, cardiometabolic, sleep-recovery is shared with v1,
    // hormonal-endocrine). Plan 2026-06-19-001 Unit 3 adds the clinician-prep
    // `medication-supplement` specialist. `iron` and `energy-fatigue` stay so
    // existing scribe rows keep routing to a real policy (R9 back-compat).
    expect(new Set(listTopicPolicyKeys())).toEqual(
      new Set([
        'general',
        'cardiometabolic',
        'sleep-recovery',
        'hormonal-endocrine',
        'medication-supplement',
        'iron',
        'energy-fatigue',
      ]),
    );
  });
});
