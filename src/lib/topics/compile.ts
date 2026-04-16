/**
 * Per-topic compile pipeline (U8).
 *
 * Invariant: `TopicPage.rendered` is only ever written after the linter
 * passes. On linter rejection (even after one retry), we write
 * `compileError` but leave `rendered` alone — UI falls back to the
 * previous good render, not a broken one.
 *
 * Caching: graph-revision hash (U3) keyed per user. If the cache entry's
 * `graphRevisionHash` matches the current hash and `rendered` is present,
 * we short-circuit before any LLM call. Fresh ingest → new hash → miss →
 * recompile.
 *
 * Retry strategy: one remedial retry with `buildRemedialPrompt` appended
 * to the user message. Two linter failures = give up and record the
 * violation; surfaces as an error state in the UI. LLM-layer retries
 * (rate limits, timeouts) are handled inside `LLMClient`, not here.
 */
import type { PrismaClient } from '@prisma/client';
import {
  getGraphRevision,
  getProvenanceForNode,
  getSubgraphForTopic,
} from '@/lib/graph/queries';
import type { GraphNodeRecord, ProvenanceItem, SubgraphResult } from '@/lib/graph/types';
import type { LLMClient } from '@/lib/llm/client';
import {
  buildRemedialPrompt,
  lint,
  type LintContext,
  type LintResult,
} from '@/lib/llm/linter';
import { getTopicConfig } from './registry';
import {
  TopicCompileLintError,
  TopicCompiledOutputSchema,
  type TopicCompileResult,
  type TopicCompiledOutput,
  type TopicConfig,
} from './types';

export interface CompileTopicArgs {
  db: PrismaClient;
  llm: LLMClient;
  userId: string;
  topicKey: string;
  /** Bypass graph-revision cache. Used by the "Recompile" admin action. */
  force?: boolean;
}

export async function compileTopic(args: CompileTopicArgs): Promise<TopicCompileResult> {
  const { db, llm, userId, topicKey, force } = args;
  const config = getTopicConfig(topicKey);
  if (!config) {
    throw new Error(`Unknown topic: ${topicKey}`);
  }

  const revision = await getGraphRevision(db, userId);

  if (!force) {
    const cached = await db.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey } },
    });
    if (cached?.rendered && cached.graphRevisionHash === revision.hash) {
      return {
        topicKey,
        status: 'full',
        graphRevisionHash: revision.hash,
        cached: true,
        output: safeParseRendered(cached.rendered),
      };
    }
  }

  const subgraph = await getSubgraphForTopic(db, userId, {
    types: config.relevantNodeTypes,
    canonicalKeyPatterns: config.canonicalKeyPatterns,
    depth: config.depth,
  });

  if (!config.hasEvidenceForCompile(subgraph.nodes)) {
    await writeStub(db, userId, topicKey, revision.hash);
    return {
      topicKey,
      status: 'stub',
      graphRevisionHash: revision.hash,
      cached: false,
      output: null,
    };
  }

  const provenanceByNode = await loadProvenance(db, subgraph.nodes);
  const userPrompt = config.prompts.buildUserPrompt({ subgraph, provenanceByNode });
  const systemPrompt = config.prompts.systemPrompt;

  let output: TopicCompiledOutput;
  let lintResult: LintResult;
  try {
    output = await llm.generate({
      prompt: userPrompt,
      system: systemPrompt,
      schema: TopicCompiledOutputSchema,
      schemaDescription: `Three-tier topic page for ${config.topicKey} with per-section citations and embedded GP prep`,
    });
    lintResult = lintTopicOutput(output, topicKey);

    if (!lintResult.passed) {
      const remedial = buildRemedialPrompt(lintResult);
      output = await llm.generate({
        prompt: `${userPrompt}\n\n${remedial}`,
        system: systemPrompt,
        schema: TopicCompiledOutputSchema,
        schemaDescription: `Three-tier topic page for ${config.topicKey} (remedial retry)`,
      });
      lintResult = lintTopicOutput(output, topicKey);
      if (!lintResult.passed) {
        const err = new TopicCompileLintError(
          lintResult.violations.map((v) => ({
            rule: v.rule,
            message: v.message,
            snippet: v.snippet,
          })),
        );
        await writeError(db, userId, topicKey, revision.hash, err.message);
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof TopicCompileLintError) throw err;
    const message = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown compile error';
    await writeError(db, userId, topicKey, revision.hash, message);
    throw err;
  }

  await db.topicPage.upsert({
    where: { userId_topicKey: { userId, topicKey } },
    update: {
      status: 'full',
      rendered: JSON.stringify(output),
      graphRevisionHash: revision.hash,
      compileError: null,
    },
    create: {
      userId,
      topicKey,
      status: 'full',
      rendered: JSON.stringify(output),
      graphRevisionHash: revision.hash,
    },
  });

  return {
    topicKey,
    status: 'full',
    graphRevisionHash: revision.hash,
    cached: false,
    output,
  };
}

async function writeStub(
  db: PrismaClient,
  userId: string,
  topicKey: string,
  graphRevisionHash: string,
): Promise<void> {
  await db.topicPage.upsert({
    where: { userId_topicKey: { userId, topicKey } },
    update: {
      status: 'stub',
      rendered: null,
      graphRevisionHash,
      compileError: null,
    },
    create: { userId, topicKey, status: 'stub', graphRevisionHash },
  });
}

async function writeError(
  db: PrismaClient,
  userId: string,
  topicKey: string,
  graphRevisionHash: string,
  message: string,
): Promise<void> {
  await db.topicPage.upsert({
    where: { userId_topicKey: { userId, topicKey } },
    update: {
      graphRevisionHash,
      compileError: message,
    },
    create: {
      userId,
      topicKey,
      status: 'full',
      graphRevisionHash,
      compileError: message,
    },
  });
}

function safeParseRendered(rendered: string): TopicCompiledOutput | null {
  try {
    const parsed = JSON.parse(rendered);
    const result = TopicCompiledOutputSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function loadProvenance(
  db: PrismaClient,
  nodes: GraphNodeRecord[],
): Promise<Map<string, ProvenanceItem[]>> {
  const entries = await Promise.all(
    nodes.map(async (n) => [n.id, await getProvenanceForNode(db, n.id)] as const),
  );
  return new Map(entries);
}

/**
 * Concatenate topic sections into the linter's `topic` surface. Tier
 * assignment is structural — the linter's tier-mismatch rule needs
 * whatYouCanDoNow and discussWithClinician separately.
 */
export function lintTopicOutput(output: TopicCompiledOutput, topicKey: string): LintResult {
  const context: LintContext = {
    surface: 'topic',
    topicKey,
    sections: {
      understanding: output.understanding.bodyMarkdown,
      whatYouCanDoNow: output.whatYouCanDoNow.bodyMarkdown,
      discussWithClinician: output.discussWithClinician.bodyMarkdown,
    },
  };
  const concatenated = [
    output.understanding.bodyMarkdown,
    output.whatYouCanDoNow.bodyMarkdown,
    output.discussWithClinician.bodyMarkdown,
    output.gpPrep.printableMarkdown,
  ].join('\n\n');
  return lint(concatenated, context);
}

// Subgraph helper exported for tests that want to build a fake pipeline
// without re-running the graph-query layer.
export { type SubgraphResult } from '@/lib/graph/types';
