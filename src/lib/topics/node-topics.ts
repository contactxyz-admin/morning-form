/**
 * Which topics does a graph node "belong to"?
 *
 * Powers the "Appears in" cross-reference list in `NodeDetailSheet` and the
 * `GET /api/graph/nodes/[id]/topics` endpoint. Deliberately uses the same
 * canonical-key-pattern logic that seeds topic subgraphs during compile —
 * so a node appears in a topic iff that topic's registry config would
 * include it as seed material, independent of whether the LLM happened to
 * cite it in any currently compiled prose.
 */

import type { GraphNodeRecord, NodeType } from '@/lib/graph/types';
import type { TopicConfig } from './types';

export interface TopicReference {
  topicKey: string;
  displayName: string;
}

export interface NodeLike {
  type: NodeType;
  canonicalKey: string;
}

export function findTopicsForNode(
  node: NodeLike,
  configs: TopicConfig[],
): TopicReference[] {
  const key = node.canonicalKey.toLowerCase();
  const refs: TopicReference[] = [];

  for (const config of configs) {
    if (!config.relevantNodeTypes.includes(node.type)) continue;
    const patterns = config.canonicalKeyPatterns.map((p) => p.toLowerCase());
    if (patterns.length > 0 && !patterns.some((p) => key.includes(p))) continue;
    refs.push({ topicKey: config.topicKey, displayName: config.displayName });
  }

  refs.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return refs;
}

/**
 * Adapter that accepts a full `GraphNodeRecord` (what `getNode` returns).
 * Kept separate from `findTopicsForNode` so call sites with minimal row
 * shapes don't need to fabricate unused fields.
 */
export function findTopicsForGraphNode(
  node: Pick<GraphNodeRecord, 'type' | 'canonicalKey'>,
  configs: TopicConfig[],
): TopicReference[] {
  return findTopicsForNode(node, configs);
}
