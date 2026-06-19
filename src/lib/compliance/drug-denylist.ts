/**
 * Canonical medication & supplement denylist — the single source of truth for
 * named drugs/supplements that must not appear in ANY user-facing output.
 *
 * Two surfaces consume this (Plan 2026-06-19 fast-follow — closes the scanner
 * divergence the multi-agent review of PR #183 found):
 *   - the chat / referral path, via `FORBIDDEN_PHRASE_PATTERNS`
 *     (src/lib/scribe/policy/forbidden-phrases.ts → enforce())
 *   - the topic-page compile path, via the linter
 *     (src/lib/llm/linter.ts → DRUG_DENYLIST)
 *
 * Before this module the two kept separate lists and drifted: prescription
 * names (metformin, ozempic, statins) and product-form supplements
 * ("magnesium supplement", "iron tablets") were blocked on the topic page but
 * slipped through on chat. Sharing one list means a name added here blocks on
 * both surfaces, and a parity test pins that they can't diverge again.
 *
 * Deliberately NOT here: bare nutrient nouns ("magnesium", "iron", "vitamin
 * D"). The clinician-mediated supplement design (Plan 2026-06-19-001) needs the
 * agent to name a CATEGORY in a "worth discussing with your clinician" frame;
 * only the specific salt / brand / product form ("magnesium glycinate",
 * "magnesium supplement", "iron tablets") and dose strings are forbidden. The
 * clinician names the specific product — not the agent.
 *
 * Expanding the list is a product + clinical review decision.
 */

export interface DenylistEntry {
  /** Human-facing name used in the linter's violation message. */
  readonly name: string;
  /** Case-insensitive word-boundary pattern. */
  readonly pattern: RegExp;
}

export const MEDICATION_DENYLIST: readonly DenylistEntry[] = Object.freeze([
  // Iron & blood
  { name: 'ferrous sulfate', pattern: /\bferrous\s+sulfate\b/i },
  { name: 'ferrous sulphate', pattern: /\bferrous\s+sulphate\b/i },
  { name: 'ferrous fumarate', pattern: /\bferrous\s+fumarate\b/i },
  { name: 'ferrous gluconate', pattern: /\bferrous\s+gluconate\b/i },
  { name: 'ferric maltol', pattern: /\bferric\s+maltol\b/i },
  { name: 'iron bisglycinate', pattern: /\biron\s+bisglycinate\b/i },
  { name: 'spatone', pattern: /\bspatone\b/i },
  { name: 'iron tablets', pattern: /\biron\s+tablets?\b/i },
  { name: 'iron supplement', pattern: /\biron\s+supplements?\b/i },
  // Diabetes & metabolic
  { name: 'metformin', pattern: /\bmetformin\b/i },
  { name: 'gliclazide', pattern: /\bgliclazide\b/i },
  { name: 'ozempic', pattern: /\bozempic\b/i },
  { name: 'mounjaro', pattern: /\bmounjaro\b/i },
  { name: 'semaglutide', pattern: /\bsemaglutide\b/i },
  { name: 'tirzepatide', pattern: /\btirzepatide\b/i },
  // Thyroid & hormone
  { name: 'levothyroxine', pattern: /\blevothyroxine\b/i },
  { name: 'liothyronine', pattern: /\bliothyronine\b/i },
  // Mental health
  { name: 'sertraline', pattern: /\bsertraline\b/i },
  { name: 'fluoxetine', pattern: /\bfluoxetine\b/i },
  { name: 'citalopram', pattern: /\bcitalopram\b/i },
  { name: 'mirtazapine', pattern: /\bmirtazapine\b/i },
  // GI
  { name: 'omeprazole', pattern: /\bomeprazole\b/i },
  { name: 'lansoprazole', pattern: /\blansoprazole\b/i },
  // Cardiovascular
  { name: 'atorvastatin', pattern: /\batorvastatin\b/i },
  { name: 'simvastatin', pattern: /\bsimvastatin\b/i },
  { name: 'ramipril', pattern: /\bramipril\b/i },
  { name: 'lisinopril', pattern: /\blisinopril\b/i },
  { name: 'amlodipine', pattern: /\bamlodipine\b/i },
  { name: 'bisoprolol', pattern: /\bbisoprolol\b/i },
  { name: 'propranolol', pattern: /\bpropranolol\b/i },
  { name: 'atenolol', pattern: /\batenolol\b/i },
  { name: 'warfarin', pattern: /\bwarfarin\b/i },
  { name: 'apixaban', pattern: /\bapixaban\b/i },
  // Pain / OTC that still carries dose advice we should not give
  { name: 'ibuprofen', pattern: /\bibuprofen\b/i },
  { name: 'paracetamol', pattern: /\bparacetamol\b/i },
  { name: 'codeine', pattern: /\bcodeine\b/i },
  // Sleep / nootropic / stimulant compounds
  { name: 'melatonin', pattern: /\bmelatonin\b/i },
  { name: 'apigenin', pattern: /\bapigenin\b/i },
  { name: 'l-theanine', pattern: /\bl-?theanine\b/i },
  { name: 'l-tyrosine', pattern: /\bl-?tyrosine\b/i },
  { name: 'alpha-GPC', pattern: /\balpha-?gpc\b/i },
  { name: 'modafinil', pattern: /\bmodafinil\b/i },
  // Named supplement salts / product forms — the specific form only, never the
  // bare nutrient noun (see the module header).
  { name: 'magnesium salt', pattern: /\bmagnesium\s+(l-threonate|glycinate|citrate|oxide)\b/i },
  { name: 'magnesium supplement', pattern: /\bmagnesium\s+supplements?\b/i },
  { name: 'vitamin D3 supplement', pattern: /\bvitamin\s*d3\b/i },
  { name: 'vitamin B12 injection', pattern: /\bb12\s+injection(s)?\b/i },
]);

/** Just the patterns — for the phrase-scan path (forbidden-phrases.ts). */
export const MEDICATION_DENYLIST_PATTERNS: readonly RegExp[] = Object.freeze(
  MEDICATION_DENYLIST.map((d) => d.pattern),
);
