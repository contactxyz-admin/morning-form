/**
 * Fixtures of real-shape UK clinical prose — each labelled with whether
 * the linter MUST catch it or MUST let it pass.
 *
 * These are used in the linter test suite and are re-exported so U8's
 * compile tests can cross-check the linter against the same corpus.
 *
 * Sourcing: examples are paraphrased from NHS patient info leaflets,
 * BNF entries, Medichecks/Thriva result prose, and common GP-handout
 * language. No identifying content.
 */

export interface GuardrailFixture {
  id: string;
  text: string;
  /** Expected linter decision. */
  expected: 'violation' | 'clean';
  /** If violation, which rule is expected to fire first. */
  expectedRule?:
    | 'drug_name'
    | 'dosage_unit'
    | 'clinical_directive'
    | 'diagnostic_claim'
    | 'tier_mismatch';
  /** Why the fixture is shaped this way — helps future readers. */
  why: string;
}

export const DRUG_NAME_VIOLATIONS: readonly GuardrailFixture[] = [
  {
    id: 'drug-ferrous-sulfate',
    text: 'Low iron stores are often treated with ferrous sulfate prescribed by your GP.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: 'Ferrous sulfate is the canonical NHS first-line iron supplement — must never appear in LLM output.',
  },
  {
    id: 'drug-ferrous-sulphate-uk-spelling',
    text: 'A short course of ferrous sulphate is common in primary care.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: 'UK spelling variant — must match.',
  },
  {
    id: 'drug-levothyroxine',
    text: 'Patients with hypothyroid results are sometimes started on levothyroxine.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: 'Common thyroid replacement. Must not be named.',
  },
  {
    id: 'drug-metformin',
    text: 'Metformin is the most common first-line option for this.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: 'Diabetes — must never appear.',
  },
  {
    id: 'drug-vitamin-d3',
    text: 'Some people take a vitamin D3 supplement daily through winter.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: 'Named supplement — our tier says discuss with GP, not name products.',
  },
  {
    id: 'drug-iron-tablets',
    text: 'Iron tablets can help once the cause is known.',
    expected: 'violation',
    expectedRule: 'drug_name',
    why: '"Iron tablets" is product-specific and implies self-treatment.',
  },
];

export const DOSAGE_VIOLATIONS: readonly GuardrailFixture[] = [
  {
    id: 'dose-14mg',
    text: 'A common starting point is 14 mg daily.',
    expected: 'violation',
    expectedRule: 'dosage_unit',
    why: 'Explicit dose — classic SaMD trigger.',
  },
  {
    id: 'dose-no-space',
    text: 'Recommended 210mg tablets are prescribed.',
    expected: 'violation',
    expectedRule: 'dosage_unit',
    why: 'Dose with no whitespace between digit and unit.',
  },
  {
    id: 'dose-1000-iu',
    text: 'Typical dose is 1000 IU daily.',
    expected: 'violation',
    expectedRule: 'dosage_unit',
    why: 'IU is the vitamin-D dosing unit.',
  },
  {
    id: 'dose-50-mcg',
    text: 'Often 50 mcg a day is enough.',
    expected: 'violation',
    expectedRule: 'dosage_unit',
    why: 'Microgram dosing — levothyroxine shape.',
  },
];

export const CLINICAL_DIRECTIVE_VIOLATIONS: readonly GuardrailFixture[] = [
  {
    id: 'directive-start-iron-supplementation',
    text: 'You should start iron supplementation right away.',
    expected: 'violation',
    expectedRule: 'clinical_directive',
    why: 'Directive-to-supplement pattern.',
  },
  {
    id: 'directive-stop-medication',
    text: 'Stop your medication if this value drops further.',
    expected: 'violation',
    expectedRule: 'clinical_directive',
    why: 'Classic medication-stopping directive.',
  },
  {
    id: 'directive-increase-dose',
    text: 'Increase your dose to see if this improves.',
    expected: 'violation',
    expectedRule: 'clinical_directive',
    why: 'Dose adjustment directive.',
  },
  {
    id: 'directive-take-tablet',
    text: 'Take one tablet with breakfast.',
    expected: 'violation',
    expectedRule: 'clinical_directive',
    why: 'Specific dosing instruction.',
  },
];

export const DIAGNOSTIC_CLAIM_VIOLATIONS: readonly GuardrailFixture[] = [
  {
    id: 'diag-iron-deficiency-anaemia',
    text: 'Based on these numbers, you have iron-deficiency anaemia.',
    expected: 'violation',
    expectedRule: 'diagnostic_claim',
    why: 'Direct UK-spelling diagnosis.',
  },
  {
    id: 'diag-anemia-us-spelling',
    text: 'You have anemia and should act on it.',
    expected: 'violation',
    expectedRule: 'diagnostic_claim',
    why: 'US spelling — must still match.',
  },
  {
    id: 'diag-hypothyroid',
    text: 'You have hypothyroidism — this explains the fatigue.',
    expected: 'violation',
    expectedRule: 'diagnostic_claim',
    why: 'Labelling the user with a diagnosis.',
  },
  {
    id: 'diag-this-is',
    text: 'This is hypothyroidism, plain and simple.',
    expected: 'violation',
    expectedRule: 'diagnostic_claim',
    why: 'Alternative diagnostic phrasing.',
  },
];

export const TIER_MISMATCH_VIOLATIONS: readonly GuardrailFixture[] = [
  {
    id: 'tier-what-you-can-do-punts',
    text: 'Ask your GP about follow-up testing.',
    expected: 'violation',
    expectedRule: 'tier_mismatch',
    why: 'Belongs under "Discuss with a clinician", not "What you can do now".',
  },
  {
    id: 'tier-clinician-section-lifestyle',
    text: 'Try more dark leafy greens in your next meal.',
    expected: 'violation',
    expectedRule: 'tier_mismatch',
    why: 'Lifestyle bullet — belongs in "What you can do now", not the clinician tier.',
  },
];

/**
 * Clean prose — exercises the common false-positive traps. These must
 * all pass.
 */
export const CLEAN_FIXTURES: readonly GuardrailFixture[] = [
  {
    id: 'clean-low-ferritin-explainer',
    text: 'Low ferritin often reflects low iron stores. Your result sits below the printed reference range on this panel.',
    expected: 'clean',
    why: 'Explanatory Understanding-tier prose with no dose, drug, or directive.',
  },
  {
    id: 'clean-lifestyle-bullet',
    text: 'Moving dinner a little earlier tends to support overnight recovery for many people.',
    expected: 'clean',
    why: 'Lifestyle bullet that neither names a drug nor prescribes a dose.',
  },
  {
    id: 'clean-lab-values-in-prose',
    text: 'Your haemoglobin is 121 g/L. That sits under the typical UK reference band.',
    expected: 'clean',
    why: 'g/L is a concentration unit — the dosage rule excludes "g/..." prefixes.',
  },
  {
    id: 'clean-lab-ug-per-L',
    text: 'A ferritin result of 18 ug/L is in the lower range of what we see.',
    expected: 'clean',
    why: 'ug/L is a lab unit, not a dose.',
  },
  {
    id: 'clean-open-question',
    text: 'A GP could help investigate possible causes of this pattern.',
    expected: 'clean',
    why: 'Discusses clinician role without dispensing prescriptive directives.',
  },
  {
    id: 'clean-take-a-walk',
    text: 'Take a walk after your main meal if you can.',
    expected: 'clean',
    why: '"Take a walk" is not a medication directive. The directive rule must not fire.',
  },
];

export const ALL_FIXTURES: readonly GuardrailFixture[] = [
  ...DRUG_NAME_VIOLATIONS,
  ...DOSAGE_VIOLATIONS,
  ...CLINICAL_DIRECTIVE_VIOLATIONS,
  ...DIAGNOSTIC_CLAIM_VIOLATIONS,
  ...TIER_MISMATCH_VIOLATIONS,
  ...CLEAN_FIXTURES,
];
