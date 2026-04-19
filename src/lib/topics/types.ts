/**
 * Shared types + Zod schemas for the topic compile pipeline (U8).
 *
 * The compiled output schema is the LLM contract — forced tool-use returns
 * this shape verbatim. Zod's `.min(1)` constraints double as the linter's
 * citation-presence rule (plan line 264: "section claims a fact with no
 * citations entry → linter fires" is handled by Zod rejection plumbed
 * through the compile pipeline).
 *
 * GP-prep output (U12) is embedded here rather than compiled separately so
 * a single LLM call produces the whole page. Splitting would double the
 * latency and risk a mismatched narrative between tiers.
 */
import { z } from 'zod';
import type { LintRule } from '@/lib/llm/linter';
import type { GraphNodeRecord, NodeType, ProvenanceItem, SubgraphResult } from '@/lib/graph/types';
import { JUDGMENT_KINDS } from '@/lib/scribe/policy/types';

export const CitationSchema = z.object({
  nodeId: z.string().min(1),
  chunkId: z.string().nullable().optional(),
  excerpt: z.string().min(1).max(500),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * Scribe annotation as it lives inside a section. This is the one Zod
 * source of truth — `src/lib/scribe/annotations.ts` re-exports it plus the
 * parsing helpers. Kept in topics/types to avoid a scribe↔topics cycle
 * (topics/types already owns `CitationSchema`, which annotations depend on).
 */
export const ScribeAnnotationSchema = z.object({
  spanAnchor: z.string().min(8).max(200),
  judgmentKind: z.enum(JUDGMENT_KINDS),
  content: z.string().min(1).max(800),
  citations: z.array(CitationSchema).min(1).max(6),
  outOfScopeRoute: z.literal('gpPrep').optional(),
});
export type ScribeAnnotation = z.infer<typeof ScribeAnnotationSchema>;

export const SectionSchema = z.object({
  heading: z.string().min(1).max(120),
  bodyMarkdown: z.string().min(1).max(4000),
  citations: z.array(CitationSchema).min(1).max(12),
  /**
   * Compile-time scribe annotations anchored to substrings of `bodyMarkdown`.
   * Optional so existing test fixtures (and the regulatory linter) see
   * today's schema unchanged when the scribe is disabled.
   */
  scribeAnnotations: z.array(ScribeAnnotationSchema).max(12).optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const GPPrepSchema = z.object({
  questionsToAsk: z.array(z.string().min(1).max(300)).min(1).max(8),
  relevantHistory: z.array(z.string().min(1).max(300)).max(8),
  testsToConsiderRequesting: z.array(z.string().min(1).max(300)).max(8),
  printableMarkdown: z.string().min(1).max(6000),
});
export type GPPrep = z.infer<typeof GPPrepSchema>;

export const TopicCompiledOutputSchema = z.object({
  understanding: SectionSchema,
  whatYouCanDoNow: SectionSchema,
  discussWithClinician: SectionSchema,
  gpPrep: GPPrepSchema,
});
export type TopicCompiledOutput = z.infer<typeof TopicCompiledOutputSchema>;

/**
 * Prompt inputs for a single topic compile. `provenanceByNode` is keyed by
 * node id; chunks are already ordered by document then chunk index.
 */
export interface BuildPromptArgs {
  subgraph: SubgraphResult;
  provenanceByNode: Map<string, ProvenanceItem[]>;
  userDisplayContext?: {
    /** Free-form captured from intake. Pass through so prompts can personalise tone. */
    sexAtBirth?: string | null;
    ageBand?: string | null;
  };
}

export interface TopicPromptModule {
  topicKey: string;
  systemPrompt: string;
  buildUserPrompt: (args: BuildPromptArgs) => string;
}

/**
 * Static config per topic. Kept plain-JSON-friendly (no closures) except
 * for the promotion predicate — the registry lives in this module and is
 * imported by the route layer, so closures are safe here.
 */
export interface TopicConfig {
  topicKey: string;
  displayName: string;
  relevantNodeTypes: NodeType[];
  canonicalKeyPatterns: string[];
  /** BFS hop depth. 2 is the U9 pilot default; energy-fatigue widens to 3. */
  depth: number;
  /** Seed-node predicate run after subgraph fetch — governs stub→full. */
  hasEvidenceForCompile: (nodes: GraphNodeRecord[]) => boolean;
  prompts: TopicPromptModule;
}

export type TopicCompileStatus = 'stub' | 'full' | 'error';

export interface TopicCompileResult {
  topicKey: string;
  status: TopicCompileStatus;
  graphRevisionHash: string;
  cached: boolean;
  /** Null when status !== 'full'. */
  output: TopicCompiledOutput | null;
  /** Populated only when status === 'error'. */
  errorMessage?: string;
}

export class TopicCompileLintError extends Error {
  readonly violations: ReadonlyArray<{ rule: LintRule; message: string; snippet?: string }>;
  constructor(violations: TopicCompileLintError['violations']) {
    super(`Topic compile linter rejected output after retry: ${violations.map((v) => v.rule).join(', ')}`);
    this.name = 'TopicCompileLintError';
    this.violations = violations;
  }
}
