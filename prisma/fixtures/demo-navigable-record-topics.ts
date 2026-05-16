/**
 * Loader for the committed compiled-topic fixture used to seed the
 * `/r/demo-navigable-record` page.
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
import {
  TopicCompiledOutputSchema,
  type TopicCompiledOutput,
} from '../../src/lib/topics/types';

const FIXTURE_PATH = join(__dirname, 'demo-navigable-record-topics.json');

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
   */
  generatedAt: string;
  topics: DemoTopicFixtureRow[];
}

/**
 * Read + parse the committed fixture. Validates every entry against the
 * current `TopicCompiledOutputSchema` so a schema change that the fixture
 * hasn't been regenerated against fails loudly at seed time (rather than
 * surfacing as a malformed render in the browser).
 */
export function loadDemoTopicFixture(): DemoTopicFixture {
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as DemoTopicFixture;

  if (!parsed.generatedAt || !Array.isArray(parsed.topics)) {
    throw new Error(
      `demo-navigable-record-topics.json is malformed (missing generatedAt or topics array). Re-run pnpm tsx scripts/demo/regenerate-topic-fixture.ts.`,
    );
  }

  for (const entry of parsed.topics) {
    const result = TopicCompiledOutputSchema.safeParse(entry.output);
    if (!result.success) {
      throw new Error(
        `Fixture entry for '${entry.topicKey}' failed TopicCompiledOutputSchema validation. ` +
          `Schema likely drifted; re-run pnpm tsx scripts/demo/regenerate-topic-fixture.ts. ` +
          `Issues: ${JSON.stringify(result.error.issues)}`,
      );
    }
  }

  return parsed;
}
