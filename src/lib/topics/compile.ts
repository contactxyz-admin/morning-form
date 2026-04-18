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
  getProvenanceForNodes,
  getSubgraphForTopic,
} from '@/lib/graph/queries';
import type { SubgraphResult } from '@/lib/graph/types';
import type { LLMClient } from '@/lib/llm/client';
import {
  buildRemedialPrompt,
  lint,
  type LintContext,
  type LintResult,
  type LintViolation,
} from '@/lib/llm/linter';
import { getTopicConfig } from './registry';
import {
  TopicCompileLintError,
  TopicCompiledOutputSchema,
  type TopicCompileResult,
  type TopicCompiledOutput,
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
      const parsed = safeParseRendered(cached.rendered);
      if (parsed) {
        return {
          topicKey,
          status: 'full',
          graphRevisionHash: revision.hash,
          cached: true,
          output: parsed,
        };
      }
      console.warn(
        `[compileTopic] cached rendered JSON failed schema validation for ${topicKey}/${userId} — recompiling.`,
      );
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

  const provenanceByNode = await getProvenanceForNodes(
    db,
    subgraph.nodes.map((n) => n.id),
    userId,
  );
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
      maxTokens: 8192,
    });
    lintResult = runFullLint(output, topicKey, subgraph);

    if (!lintResult.passed) {
      const remedial = buildRemedialPrompt(lintResult);
      output = await llm.generate({
        prompt: `${userPrompt}\n\n${remedial}`,
        system: systemPrompt,
        schema: TopicCompiledOutputSchema,
        schemaDescription: `Three-tier topic page for ${config.topicKey} (remedial retry)`,
        maxTokens: 8192,
      });
      lintResult = runFullLint(output, topicKey, subgraph);
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

  const renderedJson = JSON.stringify(output);
  await db.topicPage.upsert({
    where: { userId_topicKey: { userId, topicKey } },
    update: {
      status: 'full',
      rendered: renderedJson,
      graphRevisionHash: revision.hash,
      compileError: null,
    },
    create: {
      userId,
      topicKey,
      status: 'full',
      rendered: renderedJson,
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
      status: 'error',
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

/**
 * Validate that every citation references a node that appears in the
 * fetched subgraph. Hallucinated nodeIds are a load-bearing failure: the
 * UI renders citations as links back to graph nodes, so a bad id becomes
 * a broken link. Runs alongside the regulatory linter so both classes of
 * violation share the same retry-with-remedial-prompt loop.
 */
function validateCitations(output: TopicCompiledOutput, subgraph: SubgraphResult): LintViolation[] {
  const validIds = new Set(subgraph.nodes.map((n) => n.id));
  const violations: LintViolation[] = [];
  const sections = [
    { name: 'understanding', citations: output.understanding.citations },
    { name: 'whatYouCanDoNow', citations: output.whatYouCanDoNow.citations },
    { name: 'discussWithClinician', citations: output.discussWithClinician.citations },
  ];
  for (const { name, citations } of sections) {
    for (const citation of citations) {
      if (!validIds.has(citation.nodeId)) {
        violations.push({
          rule: 'citation_nodeid',
          message: `Citation in "${name}" references nodeId "${citation.nodeId}" which is not in the subgraph.`,
          snippet: citation.nodeId,
        });
      }
    }
  }
  return violations;
}

/**
 * Regulatory lint + citation-id validation combined. Both classes of
 * failure share one remedial retry cycle.
 */
function runFullLint(
  output: TopicCompiledOutput,
  topicKey: string,
  subgraph: SubgraphResult,
): LintResult {
  const regulatory = lintTopicOutput(output, topicKey);
  const citation = validateCitations(output, subgraph);
  if (citation.length === 0) return regulatory;
  return {
    passed: regulatory.passed && citation.length === 0,
    violations: [...regulatory.violations, ...citation],
  };
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

