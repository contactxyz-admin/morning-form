/**
 * Forbidden-phrase patterns shared across every per-topic policy.
 *
 * Three families:
 *   1. Drug-name tripwires — common OTC / prescription compounds a scribe
 *      must not name in an answer. The list is deliberately short; expanding
 *      requires product + clinical review. When a real drug name is needed
 *      (e.g., in a definition-lookup citation-surfacing), a different
 *      judgmentKind must be used and the scribe must route out-of-scope.
 *   2. Dose strings — bare numeric-with-unit patterns. Used to catch
 *      "take 65mg X" and "200 mcg Y" phrasings even when the drug name
 *      itself slips the tripwire list.
 *   3. Imperative treatment verbs — second-person directive phrasings a
 *      specialist GP in conversation with a patient would avoid in favour
 *      of "you could discuss with your GP whether …".
 *
 * All three are rejected at the phrase level regardless of `judgmentKind`.
 * A scribe that needs to narrate a user's *existing* medication would surface
 * it via `citation-surfacing` pointing to a SourceChunk — not by re-writing
 * the phrase itself.
 */

const DRUG_TRIPWIRES: readonly RegExp[] = [
  /\bferrous\s+sulfate\b/i,
  /\bferrous\s+fumarate\b/i,
  /\bferrous\s+gluconate\b/i,
  /\biron\s+bisglycinate\b/i,
  /\bmagnesium\s+(l-threonate|glycinate|citrate|oxide)\b/i,
  /\bapigenin\b/i,
  /\bmelatonin\b/i,
  /\bl-?theanine\b/i,
  /\bl-?tyrosine\b/i,
  /\balpha-?gpc\b/i,
  /\bmodafinil\b/i,
  /\bsertraline\b/i,
  /\bfluoxetine\b/i,
  /\blevothyroxine\b/i,
  /\bpropranolol\b/i,
];

// Dose tripwire — "take 65mg", "200 mcg" — but NOT concentration readings
// like "ferritin 12 μg/L". The `(?!\/)` negative lookahead excludes any
// number-unit followed by `/` (the lab-value idiom: µg/L, mg/dL, mmol/L).
// Both `µ` (micro sign U+00B5) and `μ` (Greek mu U+03BC) are accepted — the
// two are indistinguishable by eye and show up interchangeably in lab PDFs.
const DOSE_PATTERN: RegExp = /\b\d+\s?(mg|mcg|µg|μg|g|iu|ml)\b(?!\/)/i;

const IMPERATIVE_VERB_PATTERNS: readonly RegExp[] = [
  /\byou\s+should\s+take\b/i,
  /\byou\s+should\s+stop\s+taking\b/i,
  /\byou\s+should\s+start\s+taking\b/i,
  /\bstop\s+taking\s+(your|the)\b/i,
  /\bstart\s+taking\s+(your|the|this)\b/i,
  /\bincrease\s+your\s+dose\b/i,
  /\bdecrease\s+your\s+dose\b/i,
  /\bdouble\s+your\s+dose\b/i,
  /\btaper\s+off\b/i,
];

export const FORBIDDEN_PHRASE_PATTERNS: readonly RegExp[] = Object.freeze([
  ...DRUG_TRIPWIRES,
  DOSE_PATTERN,
  ...IMPERATIVE_VERB_PATTERNS,
]);
