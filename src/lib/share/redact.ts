/**
 * Redaction helpers for shared topic + graph views.
 *
 * Filtering happens at the edge of the share-render pipeline, once, after
 * the topic has been compiled but before it ships to the /share page. We
 * don't mutate the DB — the owner's full view is untouched — and we don't
 * re-run the LLM: we replace body prose on any section whose citations
 * pointed at a hidden node (the prose almost certainly repeated the same
 * facts), and we scrub the GP-prep block wholesale whenever any node is
 * hidden because its narrative draws from the full subgraph and can't be
 * cleaned surgically.
 */

import type { GPPrep, Section, TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphEdgeRecord, GraphNodeRecord, SubgraphResult } from '@/lib/graph/types';
import type { ShareRedactions } from './tokens';

const REDACTED_BODY_PLACEHOLDER =
  '_Content from this section has been hidden from this shared view._';
const REDACTED_GPPREP_PLACEHOLDER =
  '_GP prep details have been hidden from this shared view._';
const REDACTED_CITATION = {
  nodeId: '__redacted__',
  excerpt: 'Redacted for this share.',
} as const;

export interface RedactedTopic {
  output: TopicCompiledOutput;
  hadRedactions: boolean;
  affectedSections: string[];
}

export function redactTopicOutput(
  output: TopicCompiledOutput,
  redactions: ShareRedactions,
): RedactedTopic {
  const hide = new Set(redactions.hideNodeIds ?? []);
  if (hide.size === 0) {
    return { output, hadRedactions: false, affectedSections: [] };
  }

  const affected: string[] = [];

  const redactedUnderstanding = redactSection(output.understanding, hide);
  if (redactedUnderstanding.removed > 0) affected.push('understanding');

  const redactedWhatYouCanDoNow = redactSection(output.whatYouCanDoNow, hide);
  if (redactedWhatYouCanDoNow.removed > 0) affected.push('whatYouCanDoNow');

  const redactedDiscuss = redactSection(output.discussWithClinician, hide);
  if (redactedDiscuss.removed > 0) affected.push('discussWithClinician');

  return {
    output: {
      ...output,
      understanding: redactedUnderstanding.section,
      whatYouCanDoNow: redactedWhatYouCanDoNow.section,
      discussWithClinician: redactedDiscuss.section,
      gpPrep: redactGPPrep(),
    },
    hadRedactions: true,
    affectedSections: affected,
  };
}

function redactSection(
  section: Section,
  hide: Set<string>,
): { section: Section; removed: number } {
  const keptCitations = section.citations.filter((c) => !hide.has(c.nodeId));
  const removed = section.citations.length - keptCitations.length;

  if (removed === 0) {
    return { section, removed };
  }

  // Any stripped citation means the prose likely referenced hidden data.
  // Replace the body; keep surviving citations so the reader knows which
  // other nodes the section touched. If nothing survived, stamp the
  // placeholder citation so the section still satisfies its schema.
  return {
    section: {
      ...section,
      bodyMarkdown: REDACTED_BODY_PLACEHOLDER,
      citations: keptCitations.length > 0 ? keptCitations : [REDACTED_CITATION],
    },
    removed,
  };
}

/**
 * GP-prep prose aggregates across the whole subgraph (questions, history,
 * tests, printable markdown), so there's no surgical way to strip refs to
 * hidden nodes. When any node is hidden we return a schema-shaped stub.
 */
function redactGPPrep(): GPPrep {
  return {
    questionsToAsk: [REDACTED_GPPREP_PLACEHOLDER],
    relevantHistory: [],
    testsToConsiderRequesting: [],
    printableMarkdown: REDACTED_GPPREP_PLACEHOLDER,
  };
}

/**
 * Strip hidden nodes (and edges incident to them) from a subgraph. Used by
 * the shared /api/share/graph endpoint so redacted views never leak node
 * metadata through the node-detail path.
 */
export function redactSubgraph(
  subgraph: SubgraphResult,
  redactions: ShareRedactions,
): SubgraphResult {
  const hide = new Set(redactions.hideNodeIds ?? []);
  if (hide.size === 0) return subgraph;
  const nodes: GraphNodeRecord[] = subgraph.nodes.filter((n) => !hide.has(n.id));
  const edges: GraphEdgeRecord[] = subgraph.edges.filter(
    (e) => !hide.has(e.fromNodeId) && !hide.has(e.toNodeId),
  );
  return { nodes, edges };
}
