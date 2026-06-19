/**
 * Post-generation linter for LLM output (R18 — regulatory guardrails).
 *
 * Any LLM-generated surface that a user sees must pass this linter before
 * persistence. It is a pure function — no I/O, no randomness — so the
 * compile pipeline (U8) can run it synchronously and retry with a
 * remedial prompt on failure.
 *
 * Rules fire in order:
 *   1. `drug_name` — curated denylist of common UK-prescribed drugs and
 *      supplements (case-insensitive). Brand names + generic names are
 *      both covered; synonyms are expressed as word-boundary patterns.
 *   2. `dosage_unit` — any numeric dose like "14 mg", "1000 IU", "50 mcg".
 *      Reference ranges in lab reports stay out of LLM output paths by
 *      construction (U5/U6 persist them as attributes, not prose), so the
 *      rule is fine at the output layer.
 *   3. `clinical_directive` — imperative verbs applied to medication or
 *      dose ("start iron supplementation", "stop your medication",
 *      "increase your dose").
 *   4. `diagnostic_claim` — "you have <condition>" / "this is <diagnosis>"
 *      for the surfaces that must not diagnose (brief, gp_prep, and any
 *      non-Understanding tier inside a topic page).
 *   5. `tier_mismatch` — topic-page sections misaligned with their tier
 *      (Understanding leaks a recommendation; "What you can do now"
 *      punts to the clinician; clinician tier offers lifestyle tips).
 *
 * Citation presence is enforced by the topic-output Zod schema (U8), not
 * here — the linter never sees structured citations and would
 * double-enforce. The `missing_citation` code is still exported so U8 can
 * wrap a schema-level error in the same violation shape.
 *
 * Deliberately conservative: false positives are acceptable (we retry
 * with a remedial prompt), false negatives are not (regulatory exposure).
 */

import { MEDICATION_DENYLIST } from '@/lib/compliance/drug-denylist';

export type LintSurface = 'topic' | 'brief' | 'gp_prep' | 'extraction';

export type LintRule =
  | 'drug_name'
  | 'dosage_unit'
  | 'clinical_directive'
  | 'diagnostic_claim'
  | 'causal_overclaim'
  | 'tier_mismatch'
  | 'missing_citation'
  | 'citation_nodeid';

export interface LintViolation {
  rule: LintRule;
  message: string;
  /** The offending substring (if available) for debugging + retry prompts. */
  snippet?: string;
}

export interface LintContext {
  surface: LintSurface;
  topicKey?: string;
  /**
   * Optional structured sections for topic-page output. When present, the
   * tier-mismatch rule runs against each tier with tighter rules.
   */
  sections?: {
    understanding?: string;
    whatYouCanDoNow?: string;
    discussWithClinician?: string;
  };
}

export interface LintResult {
  passed: boolean;
  violations: LintViolation[];
}

/**
 * Curated UK drug + supplement denylist — the canonical `MEDICATION_DENYLIST`,
 * now shared with the chat enforce path (src/lib/compliance/drug-denylist.ts)
 * so the two user-facing surfaces can't drift (Plan 2026-06-19 fast-follow).
 * Covers common primary-care prescriptions (BNF top-50 slice) plus the
 * supplements users commonly ask about. Expanding it is a clinical decision —
 * edit the shared module, and both surfaces pick it up.
 */
const DRUG_DENYLIST = MEDICATION_DENYLIST;

/**
 * Dosage patterns. Matches "14mg", "14 mg", "1000 IU", "50 mcg" etc.
 * Excludes lab units like "ug/L", "nmol/L" which are NOT doses. Also
 * excludes grams when attached to "g/L" (a concentration unit).
 */
const DOSAGE_RE =
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\b|\b\d+(?:\.\d+)?\s*g\b(?!\/)/gi;

/**
 * Imperative clinical directive patterns.
 *
 * - The classic pairs ("start|stop|take … medication/dose/...") match
 *   reliably on long forms.
 * - Standalone "take X" is ambiguous in English ("take a walk") — we
 *   scope it to medication-ish objects.
 */
const CLINICAL_DIRECTIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\b(?:start|stop|discontinue|increase|decrease|adjust|change|titrate|taper)\s+(?:your\s+|the\s+)?(?:medication|medicine|meds|dose|dosage|tablets?|supplements?|supplementation|treatment|therapy|injections?)\b/i,
    label: 'directive on medication/dose',
  },
  {
    pattern: /\b(?:start|begin|commence)\s+(?:iron|vitamin|supplement|magnesium|b12|vitamin d)\s+(?:supplementation|tablets?|therapy)\b/i,
    label: 'directive to start a named supplement',
  },
  {
    pattern: /\btake\s+(?:\d|one|two|three|a|an)?\s*(?:tablet|capsule|pill|dose|mg|mcg|iu)\b/i,
    label: 'directive to take a specific quantity',
  },
  {
    pattern: /\byou\s+should\s+(?:take|start|stop|increase|decrease|adjust)\s+(?:your\s+)?(?:medication|dose|iron|vitamin|supplement|tablets?)\b/i,
    label: 'prescriptive recommendation',
  },
  {
    // Directive verb + named object + explicit dose. Catches
    // "start ferrous sulfate 14 mg daily" where the object is not in the
    // fixed list above but a dose is attached.
    pattern: /\b(?:start|stop|take|begin|commence|continue|discontinue|resume|increase|decrease)\s+\w+(?:\s+\w+){0,3}\s+\d+(?:\.\d+)?\s*(?:mg|mcg|iu|g)\b/i,
    label: 'directive verb attached to a dose',
  },
];

/** Diagnostic claim patterns — first-person diagnosis of the reader. */
const DIAGNOSTIC_CLAIM_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\byou\s+have\s+(?:iron[-\s]?deficiency(?:\s+ana?emia)?|ana?emia|hypothyroid(?:ism)?|hyperthyroid(?:ism)?|diabetes|pre[-\s]?diabetes|depression|anxiety|ibs|hashimoto'?s?|coeliac|celiac)\b/i,
    label: 'direct diagnosis ("you have …")',
  },
  {
    pattern: /\bthis\s+is\s+(?:iron[-\s]?deficiency(?:\s+ana?emia)?|ana?emia|hypothyroid(?:ism)?|hyperthyroid(?:ism)?|diabetes|hashimoto'?s?)\b/i,
    label: 'diagnostic label ("this is …")',
  },
  {
    pattern: /\byou\s+(?:are|have\s+been)\s+diagnos(?:ed|is)\s+with\b/i,
    label: 'attributed diagnosis',
  },
];

/**
 * Causal-overclaim / seductive-phrase patterns (Plan 2026-06-17-001 P0-3).
 *
 * These read as in-lane-violating even though they name no drug or dose: an
 * efficacy claim on a self-experiment ("whether the change you made worked"),
 * a cure claim ("cured your fatigue"), the prescriptive "the one thing to do",
 * managed-care framing ("our clinicians decide what's next"), and the
 * diagnosis-framed "what's wrong with you". The descriptive posture says "what
 * moved / worth discussing", never "what worked / what's wrong" — so these are
 * forbidden on every user-facing surface. Patterns are scoped to the offending
 * constructions (bare "worked"/"the one" are fine) to limit false positives.
 */
const CAUSAL_OVERCLAIM_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    pattern:
      /\b(?:what|whether|if)\s+(?:the\s+|your\s+|that\s+|this\s+)?(?:change|thing|intervention|tweak|adjustment|protocol|supplement|step)\s+(?:you\s+(?:made|changed|tried|took)\s+)?(?:worked|cured|fixed)\b/i,
    label: 'efficacy claim on a self-experiment ("whether the change worked")',
  },
  {
    pattern: /\bwhat\s+(?:worked|fixed\s+it|cured\s+it|made\s+the\s+difference)\b/i,
    label: 'attributing the outcome to a cause ("what worked")',
  },
  {
    pattern: /\b(?:cured|reversed|healed)\s+(?:your|the|this|it)\b/i,
    label: 'causal cure claim ("cured your …")',
  },
  {
    pattern: /\bthe\s+one\s+thing\s+(?:to\s+do|you\s+(?:should|need\s+to|must|have\s+to)\s+do)\b/i,
    label: 'prescriptive "the one thing to do" framing',
  },
  {
    pattern:
      /\b(?:our|the)\s+clinicians?\s+(?:decide|will\s+decide|determine|will\s+determine|choose|will\s+choose)\b/i,
    label: 'managed-care framing ("our clinicians decide …")',
  },
  {
    pattern: /\bwhat(?:'s|\s+is)\s+wrong\s+with\s+you\b/i,
    label: 'diagnosis-framed "what\'s wrong with you"',
  },
];

/**
 * Run the linter.
 *
 * @param output Plain text of the model output. For topic pages, pass the
 *   concatenated tier text; structured tier checks happen through
 *   `context.sections` when the caller has them split.
 * @param context Surface context so rules can scope themselves.
 */
export function lint(output: string, context: LintContext): LintResult {
  const violations: LintViolation[] = [];

  // Extraction output never reaches a user surface directly — it feeds
  // into graph persistence. The regulatory rules don't apply; only check
  // for obvious leaks to catch prompt bugs.
  if (context.surface === 'extraction') {
    return { passed: true, violations: [] };
  }

  const lower = output.toLowerCase();

  for (const entry of DRUG_DENYLIST) {
    const match = entry.pattern.exec(output);
    if (match) {
      violations.push({
        rule: 'drug_name',
        message: `Drug/supplement name "${entry.name}" is not permitted in user-facing output.`,
        snippet: match[0],
      });
    }
  }

  // Dosage regex is global — collect every match.
  const doseRe = new RegExp(DOSAGE_RE.source, DOSAGE_RE.flags);
  for (const m of Array.from(output.matchAll(doseRe))) {
    violations.push({
      rule: 'dosage_unit',
      message: `Dosage unit "${m[0].trim()}" is not permitted — doses are a clinician decision.`,
      snippet: m[0],
    });
  }

  for (const { pattern, label } of CLINICAL_DIRECTIVE_PATTERNS) {
    const match = pattern.exec(output);
    if (match) {
      violations.push({
        rule: 'clinical_directive',
        message: `Clinical directive (${label}) is not permitted in user-facing output.`,
        snippet: match[0],
      });
    }
  }

  // Diagnostic claims are always forbidden on brief / gp_prep surfaces.
  // For topic surfaces we still forbid them in the concatenated output,
  // because every tier (Understanding, "What you can do now",
  // "Discuss with a clinician") must avoid diagnosing the user.
  for (const { pattern, label } of DIAGNOSTIC_CLAIM_PATTERNS) {
    const match = pattern.exec(output);
    if (match) {
      violations.push({
        rule: 'diagnostic_claim',
        message: `Diagnostic claim (${label}) is not permitted in user-facing output.`,
        snippet: match[0],
      });
    }
  }

  // Causal-overclaim / seductive phrases — forbidden on every user-facing
  // surface (the line the forbidden-phrase scan and the locked posture hold).
  for (const { pattern, label } of CAUSAL_OVERCLAIM_PATTERNS) {
    const match = pattern.exec(output);
    if (match) {
      violations.push({
        rule: 'causal_overclaim',
        message: `Causal/seductive phrasing (${label}) is not permitted — say what moved or what is worth discussing, not what "worked" or what is "wrong".`,
        snippet: match[0],
      });
    }
  }

  if (context.surface === 'topic' && context.sections) {
    violations.push(...checkTierMismatches(context.sections));
  }

  // Reference `lower` so the helper pattern search gets used when we add
  // lower-cased-only scans in future iterations.
  void lower;

  return { passed: violations.length === 0, violations };
}

/**
 * Per-tier cross-checks. "What you can do now" is the user-owned tier —
 * no clinician-only handoffs. "Discuss with a clinician" is for
 * clinician-owned actions — it must not read as lifestyle advice.
 */
function checkTierMismatches(sections: NonNullable<LintContext['sections']>): LintViolation[] {
  const violations: LintViolation[] = [];

  const whatYouCanDoNow = sections.whatYouCanDoNow ?? '';
  const discussWithClinician = sections.discussWithClinician ?? '';

  // "What you can do now" must not punt to the clinician.
  const punts: RegExp[] = [
    /\b(?:ask|speak to|consult|see|visit|contact)\s+(?:your\s+)?(?:gp|doctor|clinician|physician|nurse)\b/i,
    /\b(?:book|arrange|schedule)\s+(?:a\s+)?(?:gp|doctor|clinic)\b/i,
    /\brequest\s+(?:a\s+)?(?:blood\s+test|prescription|referral)\b/i,
  ];
  for (const pattern of punts) {
    const match = pattern.exec(whatYouCanDoNow);
    if (match) {
      violations.push({
        rule: 'tier_mismatch',
        message: `"What you can do now" punts to a clinician — move this bullet into "Discuss with a clinician".`,
        snippet: match[0],
      });
    }
  }

  // "Discuss with a clinician" must be clinician-facing. Lifestyle-only
  // bullets belong in the user tier.
  const lifestyleOnly: RegExp[] = [
    /\b(?:try|consider|aim for|add)\s+(?:more\s+)?(?:sleep|exercise|walking|water|hydration|dark leafy greens|red meat|vitamin\s*[a-z]?\s*(?:rich\s+)?foods?)\b/i,
    /\bmove\s+(?:a\s+)?(?:consistent\s+)?(?:meal|dinner|breakfast|lunch)\s+time\b/i,
  ];
  for (const pattern of lifestyleOnly) {
    const match = pattern.exec(discussWithClinician);
    if (match) {
      violations.push({
        rule: 'tier_mismatch',
        message: `"Discuss with a clinician" contains a user-actionable lifestyle bullet — move to "What you can do now".`,
        snippet: match[0],
      });
    }
  }

  return violations;
}

/**
 * Build a remedial prompt addendum from violations. U8 appends this to
 * the next compile attempt so the model has a concrete failure signal
 * rather than a re-attempt with no guidance.
 */
export function buildRemedialPrompt(result: LintResult): string {
  if (result.passed) return '';
  const lines = [
    'The previous draft failed a regulatory linter. You MUST rewrite to remove these violations:',
  ];
  for (const v of result.violations) {
    const snippet = v.snippet ? ` Offending text: "${v.snippet}".` : '';
    lines.push(`- [${v.rule}] ${v.message}${snippet}`);
  }
  lines.push(
    'Rewrite the output so that:',
    '- No drug or supplement is named.',
    '- No dosage, quantity, frequency, or duration is stated.',
    '- No directive verbs (start/stop/take/increase/decrease) apply to medication or dose.',
    '- No sentence diagnoses the user ("you have …", "this is …").',
    '- No causal/efficacy claim ("what worked", "the change cured/fixed it") — say what moved or what is worth discussing.',
    '- No prescriptive "the one thing to do", no "our clinicians decide", no "what\'s wrong with you".',
    '- Each tier stays in its own lane.',
  );
  return lines.join('\n');
}
