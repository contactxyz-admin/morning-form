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
import {
  parseScribeAnnotations,
  targetSectionFor,
  type ScribeAnnotation,
} from '@/lib/scribe/annotations';
import {
  execute as executeScribe,
  type ScribeExecuteResult,
  type ScribeLLMClient,
} from '@/lib/scribe/execute';
import { getOrCreateScribeForTopic, SCRIBE_MODEL_VERSION_PENDING } from '@/lib/scribe/repo';
import { getPolicy } from '@/lib/scribe/policy/registry';
import { scanForbiddenPhrases } from '@/lib/scribe/policy/enforce';
import type { JudgmentKind, SafetyPolicy } from '@/lib/scribe/policy/types';
import { getTopicConfig } from './registry';
import {
  TopicCompileLintError,
  TopicCompiledOutputSchema,
  type Section,
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
  /**
   * Optional scribe LLM client. When provided, the compile pipeline runs a
   * post-narrative scribe pass (U4) that produces inline annotations +
   * out-of-scope routing, writes `ScribeAudit` with `mode: 'compile'`, and
   * busts the cache on model-version drift. Omit to keep the pre-U4 shape
   * (narrative-only, no annotations, no scribe audit row).
   */
  scribeLlm?: ScribeLLMClient;
  /** Test seam — pin a requestId for the scribe's audit row. */
  scribeRequestIdForTest?: string;
}

export async function compileTopic(args: CompileTopicArgs): Promise<TopicCompileResult> {
  const { db, llm, userId, topicKey, force, scribeLlm, scribeRequestIdForTest } = args;
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
      // Model-version drift (D9): even with an unchanged graph-revision hash,
      // bust the cache if the scribe's pinned model version has moved since
      // the last compile audit. Operators update `Scribe.modelVersion` to
      // roll forward to a new provider version; the last ScribeAudit row for
      // this (scribe, mode='compile') captures what was actually used to
      // produce the cached render. Drift => recompile so the trail matches.
      const drifted = scribeLlm
        ? await hasScribeModelDrift(db, userId, topicKey)
        : false;
      if (!drifted) {
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

  if (scribeLlm) {
    try {
      output = await runScribePass({
        db,
        userId,
        topicKey,
        output,
        subgraph,
        scribeLlm,
        requestIdForTest: scribeRequestIdForTest,
      });
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : 'unknown scribe error';
      await writeError(db, userId, topicKey, revision.hash, message);
      throw err;
    }
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

/**
 * D9 model-version drift check. Returns true when the last compile audit
 * for this user+topic used a modelVersion that no longer matches the
 * Scribe's pinned version.
 *
 * The sentinel `'pending'` is the value `execute()` seeds into Scribe on
 * lazy-create when no upstream version is known. It is NOT an operator
 * pin, so we treat it as "no baseline" and skip the drift check — drift
 * requires an explicit operator-driven change to `Scribe.modelVersion`.
 *
 * No audit yet = no drift (first compile hasn't run under the scribe).
 * No scribe row yet = no drift (nothing pinned).
 */
async function hasScribeModelDrift(
  db: PrismaClient,
  userId: string,
  topicKey: string,
): Promise<boolean> {
  const scribe = await db.scribe.findUnique({
    where: { userId_topicKey: { userId, topicKey } },
  });
  if (!scribe) return false;
  if (scribe.modelVersion === SCRIBE_MODEL_VERSION_PENDING) return false;
  const lastAudit = await db.scribeAudit.findFirst({
    where: { scribeId: scribe.id, mode: 'compile' },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastAudit) return false;
  return lastAudit.modelVersion !== scribe.modelVersion;
}

interface RunScribePassArgs {
  db: PrismaClient;
  userId: string;
  topicKey: string;
  output: TopicCompiledOutput;
  /** Subgraph fetched for the narrative — used to validate annotation citation nodeIds. */
  subgraph: SubgraphResult;
  scribeLlm: ScribeLLMClient;
  requestIdForTest?: string;
}

/**
 * U4 compile-time scribe integration. Runs exactly one `scribe/execute`
 * multi-turn loop, merges resulting annotations into the narrative sections,
 * and routes any `outOfScopeRoute: 'gpPrep'` annotation into
 * `gpPrep.questionsToAsk` so the UI surfaces it as a prompt-worthy handoff
 * rather than silently dropping the judgment.
 *
 * Retry: on `classification === 'rejected'` we run one remedial retry with
 * a focused correction hint built from the returned audit. A second
 * rejection throws `ScribeRejectedError`, which is caught upstream and
 * recorded as `compileError` so the prior good render is preserved.
 *
 * The call to `scribe/execute` is itself D11-compliant: the audit row is
 * persisted *before* the policy gate, so a thrown/rejected path still
 * lands. We only need to surface the classification here.
 */
async function runScribePass(args: RunScribePassArgs): Promise<TopicCompiledOutput> {
  const { db, userId, topicKey, output, subgraph, scribeLlm, requestIdForTest } = args;
  const policy = getPolicy(topicKey);
  if (!policy) {
    // No policy = no scribe surface. Narrative ships untouched.
    return output;
  }

  await getOrCreateScribeForTopic(db, userId, topicKey, {
    modelVersion: SCRIBE_MODEL_VERSION_PENDING,
  });

  const userMessage = buildScribeUserMessage(output, policy.allowedJudgmentKinds);
  const sectionsForPolicy = [
    asPolicySection(output.understanding),
    asPolicySection(output.whatYouCanDoNow),
    asPolicySection(output.discussWithClinician),
  ];
  const declared = pickDeclaredJudgmentKind(policy.allowedJudgmentKinds);
  const validNodeIds = new Set(subgraph.nodes.map((n) => n.id));

  const first = await executeScribe({
    db,
    userId,
    topicKey,
    mode: 'compile',
    userMessage,
    declaredJudgmentKind: declared,
    sections: sectionsForPolicy,
    llm: scribeLlm,
    requestId: requestIdForTest,
  });

  if (first.classification !== 'rejected') {
    return mergeAnnotations(output, first, policy, validNodeIds);
  }

  // One remedial retry. Supply the prior output + classification so the
  // scribe knows what triggered the rejection. No requestId override — the
  // retry gets a fresh UUIDv4 so it writes a DISTINCT audit row (the prior
  // row has already landed under its own requestId before the rejection).
  const retry = await executeScribe({
    db,
    userId,
    topicKey,
    mode: 'compile',
    userMessage: `${userMessage}\n\n---\nYour previous attempt was rejected by the safety policy (classification: rejected). Re-emit annotations that stay inside allowed judgment kinds, cite graph-node ids only, and avoid the forbidden phrase patterns for this topic.`,
    declaredJudgmentKind: declared,
    sections: sectionsForPolicy,
    llm: scribeLlm,
  });

  if (retry.classification === 'rejected') {
    throw new ScribeRejectedError(
      `Scribe remained 'rejected' after one remedial retry for ${topicKey}/${userId}. Prior render preserved.`,
    );
  }

  return mergeAnnotations(output, retry, policy, validNodeIds);
}

export class ScribeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScribeRejectedError';
  }
}

function buildScribeUserMessage(
  output: TopicCompiledOutput,
  allowed: readonly JudgmentKind[],
): string {
  return [
    `Here is the compiled topic narrative. Produce scribe annotations anchored to spans of this prose.`,
    `Allowed judgment kinds: ${allowed.join(', ')}.`,
    `Use the scribe tool palette to surface evidence before emitting an annotation.`,
    `When a claim is outside your scope of practice, emit an annotation with "outOfScopeRoute": "gpPrep" instead of answering inline.`,
    ``,
    `### UNDERSTANDING`,
    output.understanding.bodyMarkdown,
    ``,
    `### WHAT YOU CAN DO NOW`,
    output.whatYouCanDoNow.bodyMarkdown,
    ``,
    `### DISCUSS WITH CLINICIAN`,
    output.discussWithClinician.bodyMarkdown,
    ``,
    `End your final turn with an ANNOTATIONS_JSON: block — a JSON array of annotations ({ spanAnchor, judgmentKind, content, citations, outOfScopeRoute? }). Emit an empty array [] when you have no clinically-safe annotation to make.`,
  ].join('\n');
}

function asPolicySection(section: Section): {
  heading: string;
  paragraphCount: number;
  citationCount: number;
} {
  const paragraphs = section.bodyMarkdown.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return {
    heading: section.heading,
    paragraphCount: Math.max(paragraphs.length, 1),
    citationCount: section.citations.length,
  };
}

/**
 * The scribe's `declaredJudgmentKind` seeds the policy candidate; in the
 * compile path the scribe may produce many annotations of varying kinds,
 * so we pick a representative one from the allow-list. The per-annotation
 * `judgmentKind` on each `ScribeAnnotation` is what actually lands in the
 * page; this value only feeds `enforce()` for the compile pass as a whole.
 */
function pickDeclaredJudgmentKind(
  allowed: readonly JudgmentKind[],
): JudgmentKind | null {
  if (allowed.includes('citation-surfacing')) return 'citation-surfacing';
  return allowed[0] ?? null;
}

/**
 * Merges parsed `ScribeAnnotation[]` back into the narrative. Applies three
 * filters between parse and merge that the scribe's LLM loop cannot
 * self-enforce:
 *
 *   1. Forbidden-phrase scan on `annotation.content` — a drug name inside
 *      an annotation pill bypasses the enforce() scan at the executor
 *      level, which only sees the raw prose output.
 *   2. Per-annotation `judgmentKind` ∈ `policy.allowedJudgmentKinds` —
 *      `enforce()` only checks the single declared kind for the whole
 *      invocation; individual annotations may carry a disallowed kind and
 *      must not land inline. Those are routed to gpPrep instead.
 *   3. Citation `nodeId` ∈ subgraph — the main pipeline runs
 *      `validateCitations` for section citations but not for annotation
 *      citations. A hallucinated nodeId renders as a broken pill in the
 *      UI. Unknown ids are filtered; annotations left with zero citations
 *      are dropped (the schema requires ≥1).
 *
 * Out-of-scope annotations become `gpPrep.questionsToAsk` entries (deduped
 * against existing entries). In-scope annotations land on whichever
 * section's `bodyMarkdown` substring-matches the `spanAnchor` — unmatched
 * anchors fall through to `discussWithClinician` so the judgment is
 * surfaced somewhere rather than dropped.
 */
function mergeAnnotations(
  output: TopicCompiledOutput,
  scribeResult: ScribeExecuteResult,
  policy: SafetyPolicy,
  validNodeIds: ReadonlySet<string>,
): TopicCompiledOutput {
  const { annotations } = parseScribeAnnotations(scribeResult.output);
  if (annotations.length === 0) {
    return { ...output, gpPrep: { ...output.gpPrep } };
  }

  const sectionsText = {
    understanding: output.understanding.bodyMarkdown,
    whatYouCanDoNow: output.whatYouCanDoNow.bodyMarkdown,
    discussWithClinician: output.discussWithClinician.bodyMarkdown,
  };

  const bySection: Record<'understanding' | 'whatYouCanDoNow' | 'discussWithClinician', ScribeAnnotation[]> =
    {
      understanding: [],
      whatYouCanDoNow: [],
      discussWithClinician: [],
    };
  const routed: ScribeAnnotation[] = [];
  const allowedKinds = new Set<JudgmentKind>(policy.allowedJudgmentKinds);

  for (const ann of annotations) {
    // (1) Forbidden-phrase scan — drop silently rather than route, since
    //     gpPrep is user-visible and we cannot launder a drug mention
    //     through the handoff path either.
    if (scanForbiddenPhrases(ann.content, policy.forbiddenPhrasePatterns).length > 0) {
      continue;
    }

    // (3) Citation nodeId validation — drop citations that reference ids
    //     not in the subgraph. If the filter leaves an annotation with no
    //     citations, drop the whole annotation (schema requires ≥1).
    const validCitations = ann.citations.filter((c) => validNodeIds.has(c.nodeId));
    if (validCitations.length === 0) {
      continue;
    }
    const cleaned: ScribeAnnotation = { ...ann, citations: validCitations };

    // (2) Per-annotation judgmentKind — a disallowed kind must route to
    //     gpPrep regardless of the explicit outOfScopeRoute flag.
    const explicitOOS = cleaned.outOfScopeRoute === 'gpPrep';
    const disallowedKind = !allowedKinds.has(cleaned.judgmentKind);
    if (explicitOOS || disallowedKind) {
      routed.push(cleaned);
      continue;
    }

    const target = targetSectionFor(cleaned, sectionsText);
    if (target === 'gpPrep') routed.push(cleaned);
    else bySection[target].push(cleaned);
  }

  const addAnnotations = (section: Section, toAdd: ScribeAnnotation[]): Section =>
    toAdd.length === 0 ? section : { ...section, scribeAnnotations: toAdd };

  const existingQs = new Set(output.gpPrep.questionsToAsk);
  const newQs = routed
    .map((ann) => ann.content.trim())
    .filter((q) => q.length > 0 && !existingQs.has(q));

  return {
    ...output,
    understanding: addAnnotations(output.understanding, bySection.understanding),
    whatYouCanDoNow: addAnnotations(output.whatYouCanDoNow, bySection.whatYouCanDoNow),
    discussWithClinician: addAnnotations(output.discussWithClinician, bySection.discussWithClinician),
    gpPrep: {
      ...output.gpPrep,
      questionsToAsk: [...output.gpPrep.questionsToAsk, ...newQs].slice(0, 8),
    },
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

