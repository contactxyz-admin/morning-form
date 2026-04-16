import { describe, expect, it } from 'vitest';
import { buildRemedialPrompt, lint, type LintContext } from './linter';
import {
  ALL_FIXTURES,
  CLEAN_FIXTURES,
  CLINICAL_DIRECTIVE_VIOLATIONS,
  DIAGNOSTIC_CLAIM_VIOLATIONS,
  DOSAGE_VIOLATIONS,
  DRUG_NAME_VIOLATIONS,
  TIER_MISMATCH_VIOLATIONS,
} from './guardrail-fixtures';

const TOPIC_CONTEXT: LintContext = { surface: 'topic', topicKey: 'iron' };
const BRIEF_CONTEXT: LintContext = { surface: 'brief' };

describe('lint — drug_name rule', () => {
  it.each(DRUG_NAME_VIOLATIONS)('catches $id', (fx) => {
    const result = lint(fx.text, TOPIC_CONTEXT);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'drug_name')).toBe(true);
  });
});

describe('lint — dosage_unit rule', () => {
  it.each(DOSAGE_VIOLATIONS)('catches $id', (fx) => {
    const result = lint(fx.text, TOPIC_CONTEXT);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'dosage_unit')).toBe(true);
  });

  it('does NOT flag lab concentration units like g/L or ug/L', () => {
    // Both of these look "dosey" to a naive regex.
    const r1 = lint('Haemoglobin 135 g/L is in the normal range.', TOPIC_CONTEXT);
    expect(r1.violations.filter((v) => v.rule === 'dosage_unit')).toHaveLength(0);
    const r2 = lint('Ferritin 42 ug/L is typical.', TOPIC_CONTEXT);
    expect(r2.violations.filter((v) => v.rule === 'dosage_unit')).toHaveLength(0);
  });
});

describe('lint — clinical_directive rule', () => {
  it.each(CLINICAL_DIRECTIVE_VIOLATIONS)('catches $id', (fx) => {
    const result = lint(fx.text, TOPIC_CONTEXT);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'clinical_directive')).toBe(true);
  });

  it('does NOT flag "take a walk" (non-medication take)', () => {
    const result = lint('Take a walk after your main meal.', TOPIC_CONTEXT);
    expect(result.violations.filter((v) => v.rule === 'clinical_directive')).toHaveLength(0);
  });
});

describe('lint — diagnostic_claim rule', () => {
  it.each(DIAGNOSTIC_CLAIM_VIOLATIONS)('catches $id', (fx) => {
    const result = lint(fx.text, TOPIC_CONTEXT);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'diagnostic_claim')).toBe(true);
  });

  it('fires on brief surface too', () => {
    const result = lint('You have hypothyroidism.', BRIEF_CONTEXT);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'diagnostic_claim')).toBe(true);
  });
});

describe('lint — tier_mismatch rule', () => {
  it('flags "ask your GP" inside "What you can do now"', () => {
    const result = lint('…', {
      surface: 'topic',
      sections: {
        whatYouCanDoNow: 'Ask your GP about follow-up testing.',
      },
    });
    expect(result.violations.some((v) => v.rule === 'tier_mismatch')).toBe(true);
  });

  it('flags lifestyle bullet inside "Discuss with a clinician"', () => {
    const result = lint('…', {
      surface: 'topic',
      sections: {
        discussWithClinician: 'Try more dark leafy greens.',
      },
    });
    expect(result.violations.some((v) => v.rule === 'tier_mismatch')).toBe(true);
  });

  it('does not fire when sections are well-aligned', () => {
    const result = lint('…', {
      surface: 'topic',
      sections: {
        whatYouCanDoNow: 'Move dinner a little earlier.',
        discussWithClinician: 'A GP could investigate possible causes.',
      },
    });
    expect(result.violations.filter((v) => v.rule === 'tier_mismatch')).toHaveLength(0);
  });
});

describe('lint — clean output', () => {
  it.each(CLEAN_FIXTURES)('$id passes', (fx) => {
    const result = lint(fx.text, TOPIC_CONTEXT);
    if (!result.passed) {
      // Surface which rule fires so regressions are debuggable.
      throw new Error(
        `Expected clean, got violations: ${JSON.stringify(result.violations, null, 2)}`,
      );
    }
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('lint — surface scoping', () => {
  it('extraction surface never emits violations (internal-only)', () => {
    // Extraction output is persisted as graph nodes, never shown. Don't
    // block on prose heuristics that were built for user-facing copy.
    const result = lint(
      'You have iron-deficiency anaemia — start ferrous sulfate 14 mg.',
      { surface: 'extraction' },
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('gp_prep surface still blocks drug names and directives', () => {
    // GP prep is patient-facing even though it's *about* clinicians.
    const result = lint(
      'Start metformin if your GP agrees.',
      { surface: 'gp_prep' },
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'drug_name')).toBe(true);
  });
});

describe('lint — result shape', () => {
  it('returns passed=true + empty violations on clean text', () => {
    const result = lint('A GP could help investigate.', TOPIC_CONTEXT);
    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('violations carry rule, message, and snippet', () => {
    const result = lint('A 14 mg starting dose is common.', TOPIC_CONTEXT);
    expect(result.passed).toBe(false);
    const dose = result.violations.find((v) => v.rule === 'dosage_unit');
    expect(dose).toBeDefined();
    expect(dose?.message).toMatch(/not permitted/);
    expect(dose?.snippet).toMatch(/14\s?mg/);
  });

  it('accumulates multiple violations from one sentence', () => {
    const result = lint(
      'You should start ferrous sulfate 14 mg daily.',
      TOPIC_CONTEXT,
    );
    expect(result.passed).toBe(false);
    const kinds = new Set(result.violations.map((v) => v.rule));
    expect(kinds.has('drug_name')).toBe(true);
    expect(kinds.has('dosage_unit')).toBe(true);
    expect(kinds.has('clinical_directive')).toBe(true);
  });
});

describe('ALL_FIXTURES coverage', () => {
  it('every fixture either passes or is caught, as declared', () => {
    for (const fx of ALL_FIXTURES) {
      const ctx: LintContext =
        fx.expectedRule === 'tier_mismatch'
          ? {
              surface: 'topic',
              sections:
                fx.id === 'tier-what-you-can-do-punts'
                  ? { whatYouCanDoNow: fx.text }
                  : { discussWithClinician: fx.text },
            }
          : TOPIC_CONTEXT;
      const result = lint(fx.text, ctx);
      if (fx.expected === 'violation') {
        expect(
          result.passed,
          `fixture ${fx.id} should have failed`,
        ).toBe(false);
        if (fx.expectedRule) {
          expect(
            result.violations.some((v) => v.rule === fx.expectedRule),
            `fixture ${fx.id} expected rule ${fx.expectedRule} — got ${JSON.stringify(result.violations)}`,
          ).toBe(true);
        }
      } else {
        if (!result.passed) {
          throw new Error(
            `fixture ${fx.id} should have passed, got ${JSON.stringify(result.violations)}`,
          );
        }
        expect(result.passed).toBe(true);
      }
    }
  });
});

describe('TIER_MISMATCH_VIOLATIONS', () => {
  // The dedicated describe catches these with purpose-built contexts —
  // the generic loop above walks them too but this keeps the spec
  // legible when TIER_MISMATCH_VIOLATIONS grows.
  it.each(TIER_MISMATCH_VIOLATIONS)('$id catalogued', (fx) => {
    expect(fx.expected).toBe('violation');
    expect(fx.expectedRule).toBe('tier_mismatch');
  });
});

describe('buildRemedialPrompt', () => {
  it('returns empty string when the lint passed', () => {
    const result = lint('A GP could help.', TOPIC_CONTEXT);
    expect(buildRemedialPrompt(result)).toBe('');
  });

  it('summarises violations into actionable bullets', () => {
    const result = lint(
      'You should start ferrous sulfate 14 mg daily.',
      TOPIC_CONTEXT,
    );
    const remedial = buildRemedialPrompt(result);
    expect(remedial).toMatch(/regulatory linter/i);
    expect(remedial).toMatch(/drug_name/);
    expect(remedial).toMatch(/dosage_unit/);
    expect(remedial).toMatch(/clinical_directive/);
    expect(remedial).toMatch(/No drug or supplement is named/);
  });
});
