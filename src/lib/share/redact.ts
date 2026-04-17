/**
 * Redaction helpers for shared topic + graph views.
 *
 * Filtering happens at the edge of the share-render pipeline, once, after
 * the topic has been compiled but before it ships to the /share page. We
 * don't mutate the DB — the owner's full view is untouched — and we don't
 * re-run the LLM.
 *
 * The earlier cite-keyed approach (scrub only sections whose citations
 * reference a hidden node) was unsound. The LLM can mention a hidden
 * node's values in prose without citing that node in the same section
 * ("Your haemoglobin is 11.5 g/dL" in the understanding body while the
 * n-haemoglobin citation lives in discussWithClinician), and headings
 * like "Ferritin 8 ng/mL — borderline" bypass citation filtering
 * entirely. When any node is hidden we conservatively scrub every
 * section's heading + bodyMarkdown, filter citations, and wholesale
 * scrub gpPrep. Surviving citations are kept so the reader can still
 * navigate to non-hidden nodes; if every citation in a section is
 * hidden we stamp a placeholder citation to keep the schema valid.
 */

import type { GPPrep, Section, TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphEdgeRecord, GraphNodeRecord, SubgraphResult } from '@/lib/graph/types';
import type { ShareRedactions } from './tokens';

const REDACTED_HEADING_PLACEHOLDER = 'Section details hidden';
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

  const understanding = redactSection(output.understanding, hide);
  if (understanding.removed > 0) affected.push('understanding');

  const whatYouCanDoNow = redactSection(output.whatYouCanDoNow, hide);
  if (whatYouCanDoNow.removed > 0) affected.push('whatYouCanDoNow');

  const discussWithClinician = redactSection(output.discussWithClinician, hide);
  if (discussWithClinician.removed > 0) affected.push('discussWithClinician');

  return {
    output: {
      ...output,
      understanding: understanding.section,
      whatYouCanDoNow: whatYouCanDoNow.section,
      discussWithClinician: discussWithClinician.section,
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

  return {
    section: {
      heading: REDACTED_HEADING_PLACEHOLDER,
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
