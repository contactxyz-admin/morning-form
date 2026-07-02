/**
 * `search_graph_nodes` — return nodes in the topic subgraph matching the
 * query. PR5 keeps the public wire shape stable while routing through hybrid
 * retrieval when a user already has embeddings; otherwise it falls back to the
 * legacy lexical-in-subgraph path.
 *
 * Scope:
 *   - User-scoping is enforced by `getSubgraphForTopic(..., userId, ...)`.
 *   - Topic-scoping is enforced by the registry lookup — an unknown topicKey
 *     returns an empty result, never a cross-topic leak.
 */
import { z } from 'zod';
import { getRecentChunkVectors, getSubgraphForTopic } from '@/lib/graph/queries';
import { hybridRetrieveNodes } from '@/lib/graph/hybrid-retrieval';
import { isHybridRetrievalEnabled } from '@/lib/embeddings/compat';
import { logHybridRetrievalGroundingScore } from '@/lib/metrics/hybrid-retrieval-grounding';
import { getTopicConfig } from '@/lib/topics/registry';
import type { GraphNodeRecord, TopicSubgraphSpec } from '@/lib/graph/types';
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

    const topicSpec: TopicSubgraphSpec = {
      types: topic.relevantNodeTypes,
      canonicalKeyPatterns: topic.canonicalKeyPatterns,
      depth: topic.depth,
    };

    const limit = args.limit ?? 10;

    if (isHybridRetrievalEnabled()) {
      let loggedGroundingMetric = false;
      const existingVectors = await getRecentChunkVectors(ctx.db, ctx.userId, 1);
      if (existingVectors.length > 0) {
        try {
          const hybrid = await hybridRetrieveNodes(ctx.db, ctx.userId, args.query, {
            topicKey: ctx.topicKey,
            limit: limit + 1,
            requireQueryArmMatch: true,
          });
          // Log unconditionally (compute first); only the sink push is optional,
          // so an absent groundingSink (e.g. the MCP path) can't short-circuit
          // the metric log via optional-call argument elision.
          const metric = logHybridRetrievalGroundingScore({
            userId: ctx.userId,
            topicKey: ctx.topicKey,
            toolName: 'search_graph_nodes',
            query: args.query,
            results: hybrid.slice(0, limit),
          });
          ctx.groundingSink?.(metric);
          loggedGroundingMetric = true;
          if (hybrid.length > 0) {
            const truncated = hybrid.length > limit;
            return {
              matches: toResultItems(hybrid.slice(0, limit).map((item) => item.node)),
              topicKey: ctx.topicKey,
              truncated,
            };
          }
        } catch {
          // Hybrid retrieval is an implementation detail. Provider/network/raw
          // query failures fall back to the legacy path so MCP/tool contracts
          // and existing scribe flows remain stable.
        }
      }
      if (!loggedGroundingMetric) {
        const metric = logHybridRetrievalGroundingScore({
          userId: ctx.userId,
          topicKey: ctx.topicKey,
          toolName: 'search_graph_nodes',
          query: args.query,
          results: [],
        });
        ctx.groundingSink?.(metric);
      }
    }

    const filtered = await legacyLexicalSearch(ctx, args.query, topicSpec);
    const truncated = filtered.length > limit;
    const matches = toResultItems(filtered.slice(0, limit));

    return { matches, topicKey: ctx.topicKey, truncated };
  },
};

async function legacyLexicalSearch(
  ctx: ToolContext,
  query: string,
  topicSpec: TopicSubgraphSpec,
): Promise<GraphNodeRecord[]> {
  const subgraph = await getSubgraphForTopic(ctx.db, ctx.userId, topicSpec);
  const q = query.toLowerCase();
  return subgraph.nodes.filter((n) => {
    return (
      n.displayName.toLowerCase().includes(q) ||
      n.canonicalKey.toLowerCase().includes(q)
    );
  });
}

function toResultItems(nodes: GraphNodeRecord[]): SearchGraphNodesResultItem[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    canonicalKey: n.canonicalKey,
    displayName: n.displayName,
  }));
}
