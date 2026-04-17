/**
 * Redaction helpers for shared topic + graph views.
 *
 * Filtering happens at the edge of the share-render pipeline, once, after
 * the topic has been compiled but before it ships to the /share page. We
 * don't mutate the DB — the owner's full view is untouched — and we don't
 * re-run the LLM: we structurally strip citations + bullet lines that
 * reference hidden nodes, then validate the result still has at least one
 * citation per section. Sections that would otherwise go empty are
 * flagged in the returned metadata so the UI can show an honest "redacted"
 * indicator rather than pretending the section has nothing to say.
 */

import type { Section, TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphEdgeRecord, GraphNodeRecord, SubgraphResult } from '@/lib/graph/types';
import type { ShareRedactions } from './tokens';

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
    },
    hadRedactions: affected.length > 0,
    affectedSections: affected,
  };
}

function redactSection(
  section: Section,
  hide: Set<string>,
): { section: Section; removed: number } {
  const keptCitations = section.citations.filter((c) => !hide.has(c.nodeId));
  const removed = section.citations.length - keptCitations.length;

  if (keptCitations.length === 0) {
    return {
      section: {
        ...section,
        bodyMarkdown:
          '_Content from this section has been hidden from this shared view._',
        citations: [{ nodeId: '__redacted__', excerpt: 'Redacted for this share.' }],
      },
      removed,
    };
  }

  return { section: { ...section, citations: keptCitations }, removed };
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
