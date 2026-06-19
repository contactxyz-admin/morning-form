/**
 * Forbidden-phrase patterns shared across every per-topic policy.
 *
 * Three families:
 *   1. Drug/supplement names — the canonical `MEDICATION_DENYLIST` shared with
 *      the topic-page linter (src/lib/compliance/drug-denylist.ts). One list,
 *      two surfaces: a name added there is blocked on chat AND on the topic
 *      page (Plan 2026-06-19 fast-follow — closes the scanner divergence). When
 *      a real drug name is needed (e.g., in a definition-lookup
 *      citation-surfacing), a different judgmentKind must be used and the scribe
 *      must route out-of-scope.
 *   2. Dose strings — bare numeric-with-unit patterns. Used to catch
 *      "take 65mg X" and "200 mcg Y" phrasings even when the drug name
 *      itself slips the denylist.
 *   3. Imperative treatment verbs — second-person directive phrasings a
 *      specialist GP in conversation with a patient would avoid in favour
 *      of "you could discuss with your GP whether …".
 *   4. Dietary directives — second-person imperatives about food intake
 *      (increase/eat/consume-more shapes). These are forbidden in answers
 *      AND action labels (Plan 2026-06-05-001 Phase A R4).
 *
 * All four are rejected at the phrase level regardless of `judgmentKind`.
 * A scribe that needs to narrate a user's *existing* medication would surface
 * it via `citation-surfacing` pointing to a SourceChunk — not by re-writing
 * the phrase itself.
 */

import { MEDICATION_DENYLIST_PATTERNS } from '@/lib/compliance/drug-denylist';

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

// Dietary directives — second-person imperatives about food/nutrient intake.
// These are forbidden in answers AND action labels. The plan (Phase A R4)
// permits "behavior" actions for sleep/training/routine only — never dietary
// quantity directives. Built with a broad fixture set of legitimate
// descriptive sentences that must NOT trigger (non-directive mentions of
// intake, third-person descriptions, clinical context statements).
const DIETARY_DIRECTIVE_PATTERNS: readonly RegExp[] = [
  /\byou\s+should\s+eat\s+more\b/i,
  /\byou\s+should\s+eat\s+less\b/i,
  /\byou\s+should\s+consume\s+more\b/i,
  /\byou\s+should\s+consume\s+less\b/i,
  /\beat\s+more\s+(red\s+meat|iron-rich|leafy|green|protein|calorie)/i,
  /\bconsume\s+more\s+(red\s+meat|iron-rich|leafy|green|protein|calorie)/i,
  /\bincrease\s+your\s+intake\s+of\b/i,
  /\breduce\s+your\s+intake\s+of\b/i,
  /\byou\s+need\s+to\s+eat\s+more\b/i,
  /\byou\s+need\s+to\s+consume\s+more\b/i,
  /\badd\s+more\s+\w+\s+to\s+your\s+diet\b/i,
  /\bcut\s+(out|down\s+on)\s+\w+\s+from\s+your\s+diet\b/i,
];

export const FORBIDDEN_PHRASE_PATTERNS: readonly RegExp[] = Object.freeze([
  ...MEDICATION_DENYLIST_PATTERNS,
  DOSE_PATTERN,
  ...IMPERATIVE_VERB_PATTERNS,
  ...DIETARY_DIRECTIVE_PATTERNS,
]);
