/**
 * Loader for the committed compiled-topic fixture used to seed the
 * authed `demo@morningform.com` user's TopicPages (consumed by the
 * authed `/record` and `/topics/[topicKey]` views in dev/E2E). The
 * public-facing demo at `/demo/record` is fixture-direct and does not
 * touch this loader.
 *
 * Why this exists: the demo's topic content used to be compiled at seed
 * time via the Anthropic API. That created a dependency on LLM
 * availability, rate limits, API-key freshness, and lint stability —
 * every one of which has blocked demo content in the past.
 *
 * The fix: capture the compiled output once, commit it as JSON, and
 * have the seed insert from the fixture. The demo becomes byte-
 * identical across environments, free at deploy time, and immune to
 * upstream LLM weather.
 *
 * To regenerate the fixture when topic content or the underlying
 * graph changes, run:
 *
 *   pnpm tsx scripts/demo/regenerate-topic-fixture.ts
 *
 * That script runs `compileTopic` against any DB the developer owns,
 * reads the result back, validates each payload, and writes the JSON.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  TopicCompiledOutputSchema,
  type TopicCompiledOutput,
} from '../../src/lib/topics/types';

/**
 * Path to the committed fixture file.
 *
 * We use `process.cwd()` rather than `join(__dirname, ...)` so this loader
 * works in two contexts:
 *   1. Seed scripts run via tsx — `__dirname` resolves to source.
 *   2. Bundled Next.js Lambdas (the /api/health/demo route imports this
 *      loader) — webpack rewrites `__dirname` to the chunk output dir,
 *      and the fixture file would be missing from `/var/task/...`.
 *      `outputFileTracingIncludes` in `next.config.mjs` traces files
 *      addressed from the project root.
 *
 * Same failure pattern as the scribe specialty-prompt loader (see
 * docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md).
 */
const FIXTURE_PATH = join(
  process.cwd(),
  'prisma/fixtures/demo-navigable-record-topics.json',
);

/**
 * Zod schema for the full fixture envelope. Replaces a hand-rolled
 * top-level type check that only validated `generatedAt` truthiness +
 * `topics` array-ness and left per-row fields (`topicKey`,
 * `graphRevisionHash`) unvalidated. A typed array element shape is the
 * load-bearing contract — the seed downstream reads `topicKey` to drive
 * upserts. With the previous cast, malformed rows would have produced
 * `undefined` topicKey errors at insert time, far from the source.
 */
const DemoTopicFixtureSchema = z.object({
  generatedAt: z.string().min(1),
  topics: z.array(
    z.object({
      topicKey: z.string().min(1),
      graphRevisionHash: z.string().nullable(),
      // `output` is validated separately below using the live
      // TopicCompiledOutputSchema so the loader's failure message can
      // surface schema-drift remediation specifically.
      output: z.unknown(),
    }),
  ),
});

export interface DemoTopicFixtureRow {
  topicKey: string;
  /**
   * Stable hash of the graph state used to compile this topic. Stored on
   * TopicPage.graphRevisionHash so the compile-cache logic in
   * `src/lib/topics/compile.ts` treats the seeded row as fresh when the
   * graph state matches.
   */
  graphRevisionHash: string | null;
  /** Three-tier compiled output ready to write to TopicPage.rendered. */
  output: TopicCompiledOutput;
}

export interface DemoTopicFixture {
  /**
   * ISO timestamp captured when this fixture was regenerated. Surfaces
   * the fixture's age in the validation test and the optional health
   * endpoint at `/api/health/demo`, so a stale-by-months fixture is
   * visible at a glance.
   *
   * The starter fixture ships `'1970-01-01T00:00:00.000Z'` — that
   * epoch-zero value is the known-pending bootstrap signal, not an
   * error. Run `pnpm demo:regenerate-topics` to populate.
   */
  generatedAt: string;
  topics: DemoTopicFixtureRow[];
}

/**
 * Read + parse the committed fixture. Validates every entry against the
 * current `TopicCompiledOutputSchema` so a schema change that the fixture
 * hasn't been regenerated against fails loudly at seed time (rather than
 * surfacing as a malformed render in the browser).
 *
 * Failures all carry the remediation command in the error message so
 * the seed log makes the fix discoverable without a stack-trace dive.
 */
export function loadDemoTopicFixture(): DemoTopicFixture {
  let raw: string;
  try {
    raw = readFileSync(FIXTURE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read fixture at ${FIXTURE_PATH}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Ensure the file is committed and (in Vercel builds) traced via outputFileTracingIncludes in next.config.mjs.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `demo-navigable-record-topics.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}. ` +
        `Run pnpm demo:regenerate-topics to refresh.`,
    );
  }

  const envelope = DemoTopicFixtureSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new Error(
      `demo-navigable-record-topics.json envelope failed validation. ` +
        `Run pnpm demo:regenerate-topics to refresh. ` +
        `Issues: ${JSON.stringify(envelope.error.issues)}`,
    );
  }

  const rows: DemoTopicFixtureRow[] = [];
  for (const entry of envelope.data.topics) {
    const outputResult = TopicCompiledOutputSchema.safeParse(entry.output);
    if (!outputResult.success) {
      throw new Error(
        `Fixture entry for '${entry.topicKey}' failed TopicCompiledOutputSchema validation. ` +
          `Schema likely drifted; re-run pnpm demo:regenerate-topics. ` +
          `Issues: ${JSON.stringify(outputResult.error.issues)}`,
      );
    }
    rows.push({
      topicKey: entry.topicKey,
      graphRevisionHash: entry.graphRevisionHash,
      output: outputResult.data,
    });
  }

  return { generatedAt: envelope.data.generatedAt, topics: rows };
}
