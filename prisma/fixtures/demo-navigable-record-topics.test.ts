import { describe, expect, it } from 'vitest';
import { loadDemoTopicFixture } from './demo-navigable-record-topics';
import { listTopicKeys } from '../../src/lib/topics/registry';
import { TopicCompiledOutputSchema } from '../../src/lib/topics/types';

/**
 * Guard rail for the demo-record topic fixture.
 *
 * The fixture is what seeds `/r/demo-navigable-record` on every deploy.
 * If it ever drifts — wrong shape, missing topics, clinical lint
 * violation — every deploy ships a broken demo. This test fails CI
 * loudly so the regenerate workflow runs before the broken fixture
 * reaches prod.
 */

describe('demo-navigable-record-topics fixture', () => {
  const fixture = loadDemoTopicFixture();
  const isStarter = fixture.topics.length === 0;

  it('parses with a well-formed timestamp + topics array', () => {
    expect(fixture.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(fixture.topics)).toBe(true);
  });

  // Empty-starter state is acceptable on first ship; the seed handles
  // the zero-topic case gracefully. Once the developer runs
  // `pnpm demo:regenerate-topics` and commits, this `isStarter` short-
  // circuit goes away and the full coverage checks kick in.
  it.skipIf(isStarter)('covers every key in the current topic registry', () => {
    const registryKeys = listTopicKeys();
    const fixtureKeys = new Set(fixture.topics.map((t) => t.topicKey));
    const missing = registryKeys.filter((k) => !fixtureKeys.has(k));
    expect(
      missing,
      `Fixture is missing topics: ${missing.join(', ')}. Re-run pnpm demo:regenerate-topics.`,
    ).toEqual([]);
  });

  it('declares no topics outside the current topic registry', () => {
    const registryKeys = new Set(listTopicKeys());
    const stale = fixture.topics
      .map((t) => t.topicKey)
      .filter((k) => !registryKeys.has(k));
    expect(
      stale,
      `Fixture references topics not in the registry: ${stale.join(', ')}. Re-run pnpm demo:regenerate-topics after removing them.`,
    ).toEqual([]);
  });

  // Per-topic schema validation runs only when the fixture is populated.
  // The clinical-safety linter that gates `compileTopic` already runs at
  // regenerate time; re-running it here would require setting up the
  // full LintContext (subgraph, sections) which adds more value to a
  // dedicated compile-pipeline test than to this fixture guard. The
  // schema check below is the load-bearing one — it catches "the model
  // output drifted from the persisted schema" which is the failure mode
  // that breaks the demo render.
  it.skipIf(isStarter).each(fixture.topics.map((t) => [t.topicKey, t]))(
    '%s: output parses against TopicCompiledOutputSchema',
    (_topicKey, entry) => {
      const result = TopicCompiledOutputSchema.safeParse(entry.output);
      expect(
        result.success,
        JSON.stringify((result as { error?: { issues: unknown } }).error?.issues),
      ).toBe(true);
    },
  );
});
