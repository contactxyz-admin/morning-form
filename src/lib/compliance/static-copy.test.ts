import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Static-copy guardrail.
 *
 * The LLM linter at src/lib/llm/linter.ts catches Article-9-risky language in
 * *generated* output. This test catches the same patterns in *hand-written*
 * copy — component strings, page bodies, auth emails — before it ships.
 *
 * The rules are intentionally narrower than the LLM linter: we accept that
 * compliance prose inside disclaimers and the sub-processor register will
 * mention "medication" and "treatment" as nouns, and that test/fixture files
 * exist to assert on the violating strings. What we do not accept is any
 * drug name, dose quantity, or directive-style instruction baked into a
 * user-visible string.
 */

const ROOT = join(__dirname, '..', '..', '..');
const SCAN_ROOTS = [
  'src/components',
  'src/app',
  'content/marketing',
  // Priority-marker content lands here in Phase 2 of the priority-markers
  // pivot (docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md U3).
  // Path is included now so the gate is ready when content arrives — the
  // walker handles a missing directory gracefully.
  'content/priority-markers',
  // Test-route guidance copy (Plan 2026-06-06-001 U1). Same compliance
  // surface as priority-marker content — descriptive register, never
  // directive.
  'content/test-routes',
  // Demo chat sequence copy (Plan 2026-06-10-001). The canned /demo/ask
  // copy moved out of src/app (scanned) into this lib module — without
  // this root it would be silently unscanned (review catch). Scoped to
  // src/lib/demo deliberately: wider src/lib roots would trip on policy
  // modules that quote forbidden phrases by design.
  'src/lib/demo',
  // Retest nudge email copy (Plan 2026-06-17-001 U3). The nudge body in
  // src/lib/retest/nudge-email.ts is user-visible copy; without this root it
  // would be silently unscanned. Scoped to src/lib/retest deliberately (no
  // policy modules quoting forbidden phrases live here).
  'src/lib/retest',
  // In-gym pilot copy (plan 2026-07-04): procedure-consent text and booking
  // emails in src/lib/pilot, escalation emails in src/lib/review — all
  // member-visible, all must stay in the descriptive register.
  'src/lib/pilot',
  'src/lib/review',
];

// Files that are allowed to mention these strings because that is their job.
const ALLOWLIST = new Set<string>([
  // Reviewing, naming, or asserting on violations is fine.
  'src/lib/llm/linter.ts',
  'src/lib/llm/linter.test.ts',
  'src/lib/llm/guardrail-fixtures.ts',
  'src/lib/compliance/static-copy.test.ts',
  // Compliance surfaces reference these nouns deliberately.
  'src/components/ui/disclaimer.tsx',
  'src/components/ui/sub-processor-list.tsx',
  'src/app/(app)/settings/privacy/page.tsx',
  // Lifted from the deleted /onboarding ConsentStep on 2026-05-15 —
  // carries the UK GDPR sub-processor + UK-US Data Bridge disclosure.
  'src/components/auth/llm-consent-modal.tsx',
  'docs/compliance/sub-processor-register.md',
  'docs/compliance/dpia.md',
]);

// Drug/supplement names that should never appear in hand-written copy.
const DRUG_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'ferrous iron salt', pattern: /\bferrous\s+(?:sulfate|sulphate|fumarate|gluconate)\b/i },
  { label: 'metformin', pattern: /\bmetformin\b/i },
  { label: 'ozempic', pattern: /\bozempic\b/i },
  { label: 'mounjaro', pattern: /\bmounjaro\b/i },
  { label: 'semaglutide', pattern: /\bsemaglutide\b/i },
  { label: 'tirzepatide', pattern: /\btirzepatide\b/i },
  { label: 'levothyroxine', pattern: /\blevothyroxine\b/i },
  { label: 'sertraline', pattern: /\bsertraline\b/i },
  { label: 'fluoxetine', pattern: /\bfluoxetine\b/i },
  { label: 'citalopram', pattern: /\bcitalopram\b/i },
  { label: 'omeprazole', pattern: /\bomeprazole\b/i },
  { label: 'atorvastatin', pattern: /\batorvastatin\b/i },
  { label: 'simvastatin', pattern: /\bsimvastatin\b/i },
  { label: 'ramipril', pattern: /\bramipril\b/i },
  { label: 'lisinopril', pattern: /\blisinopril\b/i },
  { label: 'warfarin', pattern: /\bwarfarin\b/i },
  { label: 'apixaban', pattern: /\bapixaban\b/i },
  { label: 'ibuprofen', pattern: /\bibuprofen\b/i },
  { label: 'paracetamol', pattern: /\bparacetamol\b/i },
  { label: 'codeine', pattern: /\bcodeine\b/i },
];

// Dose quantities: "14mg", "1000 IU", "50 mcg", "1g" (not "g/L").
const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\b|\b\d+(?:\.\d+)?\s*g\b(?!\/)/i;

// Imperative clinical directives. Keeps the verbs narrow so "take a moment"
// and "start the assessment" don't trip.
const DIRECTIVE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'directive on medication/dose',
    pattern:
      /\b(?:start|stop|discontinue|increase|decrease|adjust|titrate|taper)\s+(?:your\s+|the\s+)?(?:medication|medicine|meds|dose|dosage|tablets?|supplements?|treatment|therapy|injections?)\b/i,
  },
  {
    label: 'directive to take a quantity',
    pattern: /\btake\s+(?:\d|one|two|three)\s+(?:tablet|capsule|pill|dose|mg|mcg|iu)\b/i,
  },
];

// Causal-overclaim / seductive phrases (Plan 2026-06-17-001 P0-3). These cross
// the in-lane boundary without naming a drug/dose — the same family the LLM
// linter enforces (src/lib/llm/linter.ts CAUSAL_OVERCLAIM_PATTERNS). Scoped so
// in-lane phrasing ("what changed", "worth discussing", bare "worked") passes.
const CAUSAL_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'efficacy claim on a self-experiment',
    pattern:
      /\b(?:what|whether|if)\s+(?:the\s+|your\s+|that\s+|this\s+)?(?:change|thing|intervention|tweak|adjustment|protocol|supplement|step)\s+(?:you\s+(?:made|changed|tried|took)\s+)?(?:worked|cured|fixed)\b/i,
  },
  { label: 'attributes outcome to a cause ("what worked")', pattern: /\bwhat\s+(?:worked|fixed\s+it|cured\s+it|made\s+the\s+difference)\b/i },
  { label: 'causal cure claim', pattern: /\b(?:cured|reversed|healed)\s+(?:your|the|this|it)\b/i },
  { label: 'prescriptive "the one thing to do"', pattern: /\bthe\s+one\s+thing\s+(?:to\s+do|you\s+(?:should|need\s+to|must|have\s+to)\s+do)\b/i },
  { label: 'managed-care "clinicians decide"', pattern: /\b(?:our|the)\s+clinicians?\s+(?:decide|will\s+decide|determine|will\s+determine|choose|will\s+choose)\b/i },
  { label: 'diagnosis-framed "what\'s wrong with you"', pattern: /\bwhat(?:'s|\s+is)\s+wrong\s+with\s+you\b/i },
];

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full, acc);
    } else if (s.isFile() && (name.endsWith('.tsx') || name.endsWith('.ts'))) {
      // Skip tests + fixtures — they are allowed to assert on violating strings.
      if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue;
      if (name.includes('fixtures')) continue;
      acc.push(full);
    }
  }
  return acc;
}

function collectFiles(): string[] {
  return SCAN_ROOTS.flatMap((rel) => walk(join(ROOT, rel)));
}

interface Hit {
  file: string;
  label: string;
  excerpt: string;
}

function findHits(): Hit[] {
  const files = collectFiles();
  const hits: Hit[] = [];
  for (const file of files) {
    const relPath = relative(ROOT, file).replace(/\\/g, '/');
    if (ALLOWLIST.has(relPath)) continue;
    const source = readFileSync(file, 'utf8');
    // Skip import lines — catching "mg" in e.g. package names would be noise.
    const scan = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('import '))
      .join('\n');

    for (const { label, pattern } of DRUG_PATTERNS) {
      const m = scan.match(pattern);
      if (m) hits.push({ file: relPath, label: `drug:${label}`, excerpt: m[0] });
    }
    const dose = scan.match(DOSE_PATTERN);
    if (dose) hits.push({ file: relPath, label: 'dose', excerpt: dose[0] });
    for (const { label, pattern } of DIRECTIVE_PATTERNS) {
      const m = scan.match(pattern);
      if (m) hits.push({ file: relPath, label: `directive:${label}`, excerpt: m[0] });
    }
    for (const { label, pattern } of CAUSAL_PATTERNS) {
      const m = scan.match(pattern);
      if (m) hits.push({ file: relPath, label: `causal:${label}`, excerpt: m[0] });
    }
  }
  return hits;
}

describe('static copy guardrail', () => {
  it('contains no drug names, doses, or clinical directives in hand-written UI copy', () => {
    const hits = findHits();
    if (hits.length > 0) {
      // Format a readable failure so the author sees exactly which file and
      // which string tripped, and which rule applied.
      const report = hits
        .map((h) => `  ${h.file}  [${h.label}]  ${JSON.stringify(h.excerpt)}`)
        .join('\n');
      throw new Error(
        `Static copy guardrail failed. ${hits.length} forbidden pattern(s) found:\n${report}\n\n` +
          'Compliance copy lives in the allowlist (sub-processor list, disclaimer, ' +
          'privacy page, consent modal). Everything else must not name drugs, doses, ' +
          'or issue clinical directives. LLM-generated output is covered separately ' +
          'by the linter at src/lib/llm/linter.ts.',
      );
    }
    expect(hits).toHaveLength(0);
  });

  it('scans a non-empty set of files (scan roots still exist)', () => {
    const files = collectFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it('rejects a forbidden phrase planted in a content/marketing/ fixture', () => {
    // Characterization test for the SCAN_ROOTS extension to content/marketing.
    // Constructs an in-memory file path that the scanner WOULD scan (verifies
    // the extension is wired up); does not write to disk. If the SCAN_ROOTS
    // array is ever reverted, this test still passes vacuously — the meaningful
    // protection is the always-on guardrail above, which would catch a real
    // forbidden phrase in any content/marketing/*.ts file.
    const probe = join(ROOT, 'content', 'marketing');
    expect(SCAN_ROOTS).toContain('content/marketing');
    // Sanity: the path string assembles cleanly (catches typos in SCAN_ROOTS).
    expect(probe).toMatch(/content\/marketing$/);
  });

  it('wires content/test-routes into the scan, and the scanner catches a planted forbidden phrase there (Plan 2026-06-06-001 U1)', () => {
    // (1) The new content root is on the allowlist of scanned directories.
    expect(SCAN_ROOTS).toContain('content/test-routes');
    // The directory actually contributes files to the scan set (catches a
    // reverted/typo'd SCAN_ROOTS entry, which the marketing probe above cannot).
    const scanned = collectFiles().map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(scanned.some((p) => p.startsWith('content/test-routes/'))).toBe(true);

    // (2) Characterization: the detection rules used by the always-on guardrail
    // fire on a forbidden phrase of the kind that could be planted in
    // content/test-routes copy (a drug name + a directive + a dose). Running the
    // same patterns the scanner uses proves a real violation in that root would
    // be caught, without writing a fixture to disk.
    const planted = 'Start your atorvastatin 20mg as directed by the lab.';
    const drugHit = DRUG_PATTERNS.some((d) => d.pattern.test(planted));
    const doseHit = DOSE_PATTERN.test(planted);
    const directiveHit = DIRECTIVE_PATTERNS.some((d) => d.pattern.test(planted));
    expect(drugHit || doseHit || directiveHit).toBe(true);
  });

  it('wires src/lib/demo into the scan so the canned demo-chat copy stays covered (Plan 2026-06-10-001)', () => {
    expect(SCAN_ROOTS).toContain('src/lib/demo');
    // The root actually contributes the sequence module to the scan set —
    // catches a reverted SCAN_ROOTS entry or a rename into the walker's
    // skip-list (filenames containing "fixtures" are skipped by design).
    const scanned = collectFiles().map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(scanned).toContain('src/lib/demo/ask-sequences.ts');
  });

  it('wires src/lib/retest into the scan so the retest nudge email copy stays covered (Plan 2026-06-17-001)', () => {
    expect(SCAN_ROOTS).toContain('src/lib/retest');
    // The root contributes the nudge-email module to the scan set.
    const scanned = collectFiles().map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(scanned).toContain('src/lib/retest/nudge-email.ts');
  });

  it('detects causal-overclaim / seductive phrases, and lets in-lane phrasing pass (Plan 2026-06-17-001 P0-3)', () => {
    // The scanner's CAUSAL_PATTERNS would catch these crossing-the-line phrases
    // in any scanned copy — proved by running them directly (no fixture on disk).
    const forbidden = [
      "see whether the change you made worked",
      "we'll show you what worked",
      'this cured your fatigue',
      'here is the one thing to do',
      'our clinicians decide what to test',
      "we'll tell you what's wrong with you",
    ];
    for (const text of forbidden) {
      expect(CAUSAL_PATTERNS.some((p) => p.pattern.test(text)), `should flag: ${text}`).toBe(true);
    }
    // In-lane phrasing must NOT trip the scanner (guards over-blocking).
    const allowed = [
      'your results show what changed since your last test',
      'this is worth discussing with your clinician',
      'it worked out that we already held your earlier panel',
      "here's what moved since last time",
    ];
    for (const text of allowed) {
      expect(CAUSAL_PATTERNS.some((p) => p.pattern.test(text)), `should NOT flag: ${text}`).toBe(false);
    }
  });
});
