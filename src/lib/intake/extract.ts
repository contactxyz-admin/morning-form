/**
 * Intake extraction pipeline (Unit 5 of the Health Graph pivot).
 *
 * Flow:
 *   intake payload (history text + essentials + staged doc names)
 *   → chunks (deterministic, with offsets)
 *   → LLM structured-output call (Claude Opus 4.6)
 *   → Zod-validated ExtractedGraph
 *   → IngestExtractionInput (shape consumed by graph mutations)
 *
 * The caller (src/app/api/intake/submit/route.ts) wraps `extractFromIntake`
 * and hands the result to `ingestExtraction` from src/lib/graph/mutations.ts.
 * Extraction does not touch the database — it only reads existing-node hints
 * for the prompt. All writes happen inside the caller's single transaction.
 *
 * Mock mode: the LLMClient handles MOCK_LLM=true itself. Tests register
 * handlers via `setMockHandlers` so we never stub @anthropic-ai/sdk directly.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { LLMClient } from '../llm/client';
import { NODE_TYPES, EDGE_TYPES, type NodeType } from '../graph/types';
import type {
  AddNodeInput,
  AddSourceChunkInput,
  IngestExtractionInput,
} from '../graph/types';
import { contentHashFor } from '../graph/mutations';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildIntakeExtractionPrompt,
  type ExistingNodeHint,
} from './prompts';
import type { EssentialsForm } from './types';

const NODE_TYPE_ENUM = z.enum(NODE_TYPES as unknown as [NodeType, ...NodeType[]]);
// Intake is a user-asserted text payload — the three relational edge types
// it can emit are ASSOCIATED_WITH / CAUSES / CONTRADICTS. SUPPORTS is
// provenance (derived from supportingChunkIndices) and TEMPORAL_SUCCEEDS is
// reserved for time-series ingestion (checkins, windows), not free-text.
const INTAKE_EDGE_TYPES = ['ASSOCIATED_WITH', 'CAUSES', 'CONTRADICTS'] as const;
type IntakeEdgeType = (typeof INTAKE_EDGE_TYPES)[number];
const EDGE_TYPE_ENUM = z.enum(INTAKE_EDGE_TYPES);
// Reference EDGE_TYPES so unused-import lint stays happy while making it
// explicit that we intentionally narrow the set.
void EDGE_TYPES;

const CANONICAL_KEY_RE = /^[a-z0-9][a-z0-9_]*$/;

export const ExtractedNodeSchema = z.object({
  type: NODE_TYPE_ENUM,
  canonicalKey: z
    .string()
    .min(1)
    .max(80)
    .regex(CANONICAL_KEY_RE, 'canonicalKey must be lowercase snake_case'),
  displayName: z.string().min(1).max(200),
  attributes: z.record(z.unknown()).optional(),
  supportingChunkIndices: z.array(z.number().int().nonnegative()).min(1, 'every node must cite ≥1 chunk'),
});
export type ExtractedNode = z.infer<typeof ExtractedNodeSchema>;

export const ExtractedEdgeSchema = z.object({
  type: EDGE_TYPE_ENUM,
  fromType: NODE_TYPE_ENUM,
  fromCanonicalKey: z.string().regex(CANONICAL_KEY_RE),
  toType: NODE_TYPE_ENUM,
  toCanonicalKey: z.string().regex(CANONICAL_KEY_RE),
});
export type ExtractedEdge = z.infer<typeof ExtractedEdgeSchema>;

export const ExtractedGraphSchema = z.object({
  nodes: z.array(ExtractedNodeSchema),
  edges: z.array(ExtractedEdgeSchema),
});
export type ExtractedGraph = z.infer<typeof ExtractedGraphSchema>;

/**
 * Tentative topic stub rules. A `TopicPage(status: stub)` row is created
 * for topics where the extracted graph contains ≥1 matching node. U8 will
 * replace this inline registry with a proper topic module.
 */
export const TENTATIVE_TOPIC_RULES: Array<{
  topicKey: string;
  matches: (node: Pick<AddNodeInput, 'type' | 'canonicalKey' | 'displayName'>) => boolean;
}> = [
  {
    topicKey: 'iron',
    matches: (n) => {
      const k = n.canonicalKey.toLowerCase();
      return (
        k.includes('iron') ||
        k.includes('ferritin') ||
        k.includes('haemoglobin') ||
        k.includes('hemoglobin') ||
        k.includes('anemia') ||
        k.includes('anaemia')
      );
    },
  },
  {
    topicKey: 'sleep',
    matches: (n) => {
      const k = n.canonicalKey.toLowerCase();
      return (
        k.includes('sleep') ||
        k.includes('insomnia') ||
        k.includes('wake') ||
        k.includes('rested') ||
        k.includes('nap')
      );
    },
  },
  {
    topicKey: 'energy',
    matches: (n) => {
      const k = n.canonicalKey.toLowerCase();
      return (
        k.includes('energy') ||
        k.includes('fatigue') ||
        k.includes('tired') ||
        k.includes('exhaust')
      );
    },
  },
];

export function computeTentativeTopicStubs(
  nodes: Array<Pick<AddNodeInput, 'type' | 'canonicalKey' | 'displayName'>>,
): string[] {
  const matches = new Set<string>();
  for (const rule of TENTATIVE_TOPIC_RULES) {
    if (nodes.some((n) => rule.matches(n))) matches.add(rule.topicKey);
  }
  return Array.from(matches);
}

export interface ChunkedIntake {
  chunks: AddSourceChunkInput[];
  combinedText: string;
}

/**
 * Deterministic chunker. Emits one chunk per essentials field that has
 * content plus one chunk per non-empty paragraph of historyText. Paragraph =
 * blank-line-separated block. Offsets are relative to `combinedText` so the
 * provenance UI can later highlight exact spans from the stored document.
 */
export function chunkIntake(
  historyText: string,
  essentials: EssentialsForm,
  documentNames: string[],
): ChunkedIntake {
  const parts: Array<{ label: string; text: string }> = [];

  const pushIfContent = (label: string, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length > 0) parts.push({ label, text: trimmed });
  };

  pushIfContent('GOALS', essentials.goals);
  pushIfContent('MEDICATIONS', essentials.currentMedications);
  pushIfContent('DIAGNOSES', essentials.currentDiagnoses);
  pushIfContent('ALLERGIES', essentials.allergies);

  const historyParagraphs = historyText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (let i = 0; i < historyParagraphs.length; i++) {
    parts.push({ label: `HISTORY_${i + 1}`, text: historyParagraphs[i] });
  }

  if (documentNames.length > 0) {
    parts.push({
      label: 'DOCUMENT_NAMES',
      text: documentNames.map((n) => `- ${n}`).join('\n'),
    });
  }

  // Assemble combinedText with section markers so offsets are stable and
  // human-inspectable when rendered in the provenance UI.
  let combinedText = '';
  const chunks: AddSourceChunkInput[] = [];
  for (let i = 0; i < parts.length; i++) {
    const { label, text } = parts[i];
    const prefix = combinedText.length === 0 ? '' : '\n\n';
    const header = `## ${label}\n`;
    combinedText += prefix + header;
    const offsetStart = combinedText.length;
    combinedText += text;
    const offsetEnd = combinedText.length;
    chunks.push({
      index: i,
      text,
      offsetStart,
      offsetEnd,
      metadata: { label },
    });
  }

  return { chunks, combinedText };
}

export interface ExtractFromIntakeInput {
  historyText: string;
  essentials: EssentialsForm;
  documentNames: string[];
}

export interface ExtractFromIntakeResult {
  ingestInput: IngestExtractionInput;
  extracted: ExtractedGraph;
  tentativeTopicStubs: string[];
}

export interface ExtractDeps {
  client: LLMClient;
  prisma: PrismaClient;
}

/**
 * End-to-end extraction: chunk → prompt → LLM → validated graph →
 * IngestExtractionInput. Does not write to the DB.
 *
 * Idempotency: callers pass a content-hashed SourceDocument input; the graph
 * mutation layer (`ingestExtraction` → `addSourceDocument`) dedups on
 * (userId, contentHash).
 */
export async function extractFromIntake(
  deps: ExtractDeps,
  userId: string,
  input: ExtractFromIntakeInput,
): Promise<ExtractFromIntakeResult> {
  const { client, prisma } = deps;
  const { historyText, essentials, documentNames } = input;

  const { chunks, combinedText } = chunkIntake(historyText, essentials, documentNames);

  // Existing-node dedup hints. Keep the list bounded — 300 nodes at 80 chars
  // each is ~24KB, well inside the prompt budget. If the user ever exceeds
  // that the hint list is still useful as a random sample; we just prioritise
  // the most recently-touched ones so repeated re-submissions converge.
  const existing = await prisma.graphNode.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    select: { type: true, canonicalKey: true, displayName: true },
  });
  const existingHints: ExistingNodeHint[] = existing.map((n) => ({
    type: n.type as NodeType,
    canonicalKey: n.canonicalKey,
    displayName: n.displayName,
  }));

  const prompt = buildIntakeExtractionPrompt({
    chunks: chunks.map((c) => ({ index: c.index, text: c.text })),
    essentials,
    documentNames,
    existingNodes: existingHints,
  });

  const extracted = await client.generate({
    prompt,
    system: EXTRACTION_SYSTEM_PROMPT,
    schema: ExtractedGraphSchema,
    schemaDescription: 'Emit the extracted health-graph nodes and associative edges.',
  });

  // Defense-in-depth: reject chunk indices the LLM invented that lie outside
  // the range we sent. The schema already enforces non-negative integers;
  // this catches "chunk 47" when we only sent 5.
  for (const node of extracted.nodes) {
    for (const idx of node.supportingChunkIndices) {
      if (idx >= chunks.length) {
        throw new Error(
          `extractFromIntake: node ${node.type}::${node.canonicalKey} cites chunk ${idx} but only ${chunks.length} chunks were provided`,
        );
      }
    }
  }

  // Dedup nodes by (type, canonicalKey) in case the model emits the same
  // node twice (happens on longer inputs). Merge attributes shallow-first-
  // write-wins and union chunk citations.
  const nodeMap = new Map<string, AddNodeInput & { supportingChunkIndices?: number[] }>();
  for (const n of extracted.nodes) {
    const key = `${n.type}::${n.canonicalKey}`;
    const existing = nodeMap.get(key);
    if (!existing) {
      nodeMap.set(key, {
        type: n.type,
        canonicalKey: n.canonicalKey,
        displayName: n.displayName,
        attributes: n.attributes,
        supportingChunkIndices: [...n.supportingChunkIndices],
      });
      continue;
    }
    // merge
    const mergedAttrs: Record<string, unknown> = { ...(existing.attributes ?? {}) };
    for (const [k, v] of Object.entries(n.attributes ?? {})) {
      if (mergedAttrs[k] === undefined) mergedAttrs[k] = v;
    }
    existing.attributes = Object.keys(mergedAttrs).length > 0 ? mergedAttrs : undefined;
    const union = new Set([...(existing.supportingChunkIndices ?? []), ...n.supportingChunkIndices]);
    existing.supportingChunkIndices = Array.from(union).sort((a, b) => a - b);
  }
  const dedupedNodes = Array.from(nodeMap.values());

  const ingestInput: IngestExtractionInput = {
    document: {
      kind: 'intake_text',
      capturedAt: new Date(),
      contentHash: contentHashFor(combinedText),
      metadata: {
        historyLength: historyText.length,
        essentialsFields: Object.entries(essentials)
          .filter(([, v]) => v.trim().length > 0)
          .map(([k]) => k),
        documentCount: documentNames.length,
      },
    },
    chunks,
    nodes: dedupedNodes,
    edges: extracted.edges.map((e) => ({
      type: e.type as IntakeEdgeType,
      fromType: e.fromType,
      fromCanonicalKey: e.fromCanonicalKey,
      toType: e.toType,
      toCanonicalKey: e.toCanonicalKey,
    })),
  };

  const tentativeTopicStubs = computeTentativeTopicStubs(dedupedNodes);

  return { ingestInput, extracted, tentativeTopicStubs };
}
