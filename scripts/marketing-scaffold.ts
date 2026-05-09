#!/usr/bin/env tsx
/**
 * Marketing-page scaffolder.
 *
 * Usage:
 *   pnpm marketing:scaffold --cohort=fatigue --slug=ferritin-low --market=uk
 *
 * Generates `content/marketing/{market}/{slug}.ts` from the cohort
 * template. The file is a stub — editorial review fills in real prose.
 * The editorial-QA Vitest gate scans the resulting file on every CI run.
 *
 * The scaffolder does not write prose. It scaffolds the typed structure.
 * Phase 2 of the SEO/GEO plan (rolling content authoring) consumes this.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { COHORT_KEYS, type CohortKey } from '../src/lib/marketing/cohorts';
import { MARKETS, type Market } from '../src/lib/marketing/constants';
import { FATIGUE_TEMPLATE } from '../content/marketing/_templates/fatigue.template';

interface Args {
  cohort: CohortKey;
  slug: string;
  market: Market;
}

const TEMPLATES: Partial<Record<CohortKey, string>> = {
  fatigue: FATIGUE_TEMPLATE,
  // testosterone, longevity-40, recovery-hrv, metabolic, cardio, fertility,
  // executive: templates land as content workstream — add new entries here
  // when each cohort's editorial scaffold is ready.
};

const REPO_ROOT = resolve(__dirname, '..');

function parseArgs(argv: ReadonlyArray<string>): Args {
  const flags: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
  }

  const cohort = flags.cohort;
  const slug = flags.slug;
  const market = flags.market;

  if (!cohort || !slug || !market) {
    console.error(
      'Usage: pnpm marketing:scaffold --cohort=<key> --slug=<kebab-case> --market=<uk|us>',
    );
    console.error(`  Valid cohorts: ${COHORT_KEYS.join(', ')}`);
    console.error(`  Valid markets: ${MARKETS.join(', ')}`);
    process.exit(1);
  }

  if (!(COHORT_KEYS as readonly string[]).includes(cohort)) {
    console.error(`Invalid cohort "${cohort}". Valid: ${COHORT_KEYS.join(', ')}`);
    process.exit(1);
  }

  if (!(MARKETS as readonly string[]).includes(market)) {
    console.error(`Invalid market "${market}". Valid: ${MARKETS.join(', ')}`);
    process.exit(1);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    console.error(`Invalid slug "${slug}". Must be kebab-case lowercase.`);
    process.exit(1);
  }

  return {
    cohort: cohort as CohortKey,
    slug,
    market: market as Market,
  };
}

function main(): void {
  const { cohort, slug, market } = parseArgs(process.argv.slice(2));

  const template = TEMPLATES[cohort];
  if (!template) {
    console.error(
      `No template for cohort "${cohort}" yet. Add a template at content/marketing/_templates/${cohort}.template.ts and register it in scripts/marketing-scaffold.ts.`,
    );
    process.exit(1);
  }

  const outputPath = join(REPO_ROOT, 'content', 'marketing', market, `${slug}.ts`);
  if (existsSync(outputPath)) {
    console.error(`File already exists: ${outputPath.replace(`${REPO_ROOT}/`, '')}`);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const slugTitleCase = slug
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

  const rendered = template
    .replace(/__SLUG__/g, slug)
    .replace(/__MARKET__/g, market)
    .replace(/__SEO_TITLE__/g, `${slugTitleCase} — Morning Form`)
    .replace(
      /__META_DESCRIPTION__/g,
      `${slugTitleCase} — descriptive guide for men 30+. Replace this with the real meta description before shipping.`,
    )
    .replace(/__H1__/g, slugTitleCase)
    .replace(
      /__ABOVE_FOLD__/g,
      'Replace this with the above-the-fold direct answer. Two to three sentences that resolve the search intent.',
    )
    .replace(/__TODAY__/g, today);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered, 'utf8');

  const relPath = outputPath.replace(`${REPO_ROOT}/`, '');
  console.log(`Created ${relPath}`);
  console.log(`Next steps:`);
  console.log(`  1. Edit the file — fill in real seoTitle, h1, sections, faq, escalation.`);
  console.log(`  2. Add the import to src/lib/marketing/slug-allowlist.ts.`);
  console.log(`  3. pnpm vitest run src/lib/compliance — the editorial-QA gate scans the new file.`);
}

main();
