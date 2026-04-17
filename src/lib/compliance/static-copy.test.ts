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
const SCAN_ROOTS = ['src/components', 'src/app'];

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
  'src/app/onboarding/page.tsx',
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
          'privacy page, onboarding). Everything else must not name drugs, doses, ' +
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
});
