/**
 * `search_graph_nodes` — return nodes in the topic subgraph whose displayName
 * or canonicalKey match the query. Thin adapter over
 * `src/lib/graph/queries.ts::getSubgraphForTopic` + a local case-insensitive
 * substring filter. Stays inside the topic subgraph by construction: we never
 * hand the LLM a node that isn't reachable from the topic's seed patterns.
 *
 * Scope:
 *   - User-scoping is enforced by `getSubgraphForTopic(..., userId, ...)`.
 *   - Topic-scoping is enforced by the registry lookup — an unknown topicKey
 *     returns an empty result, never a cross-topic leak.
 */
import { z } from 'zod';
import { getSubgraphForTopic } from '@/lib/graph/queries';
import { getTopicConfig } from '@/lib/topics/registry';
import type { ToolContext, ToolHandler } from './types';

export const searchGraphNodesSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchGraphNodesArgs = z.infer<typeof searchGraphNodesSchema>;

export interface SearchGraphNodesResultItem {
  id: string;
  type: string;
  canonicalKey: string;
  displayName: string;
}

export interface SearchGraphNodesResult {
  matches: SearchGraphNodesResultItem[];
  topicKey: string;
  truncated: boolean;
}

export const searchGraphNodesHandler: ToolHandler<
  SearchGraphNodesArgs,
  SearchGraphNodesResult
> = {
  name: 'search_graph_nodes',
  description:
    'Find graph nodes inside the current topic subgraph whose display name or canonical key contains the query. Returns at most `limit` results.',
  parameters: searchGraphNodesSchema,
  async execute(ctx: ToolContext, args: SearchGraphNodesArgs) {
    const topic = getTopicConfig(ctx.topicKey);
    if (!topic) {
      return { matches: [], topicKey: ctx.topicKey, truncated: false };
    }

    const subgraph = await getSubgraphForTopic(ctx.db, ctx.userId, {
      types: topic.relevantNodeTypes,
      canonicalKeyPatterns: topic.canonicalKeyPatterns,
      depth: topic.depth,
    });

    const q = args.query.toLowerCase();
    const filtered = subgraph.nodes.filter((n) => {
      return (
        n.displayName.toLowerCase().includes(q) ||
        n.canonicalKey.toLowerCase().includes(q)
      );
    });

    const limit = args.limit ?? 10;
    const truncated = filtered.length > limit;
    const matches: SearchGraphNodesResultItem[] = filtered.slice(0, limit).map((n) => ({
      id: n.id,
      type: n.type,
      canonicalKey: n.canonicalKey,
      displayName: n.displayName,
    }));

    return { matches, topicKey: ctx.topicKey, truncated };
  },
};
