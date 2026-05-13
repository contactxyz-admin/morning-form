/**
 * `list_graph_index` — return the user's whole-graph index for agents that
 * need to browse before drilling in.
 *
 * Closes the agent-native gap surfaced by the PR #102 review: the existing
 * scribe tools are topic-scoped (every handler reads `ctx.topicKey`), so an
 * external agent has no way to "list everything I can see" without already
 * knowing a topicKey. This tool exposes the same shape `/api/record` returns
 * to the vault UI — topics, recent activity, importance-scored nodes (capped
 * at 200), edges, type counts — so an MCP caller can discover what's there
 * before calling `search_graph_nodes` / `get_node_detail` / etc.
 *
 * User-scoping is the only access boundary: `ctx.userId` filters every
 * read. `ctx.topicKey` is intentionally ignored — this is a whole-graph
 * tool. The required-on-ctx invariant survives because the MCP adapter
 * (Phase 2) passes a sentinel topicKey when invoking whole-graph tools.
 */
import { z } from 'zod';
import {
  getFullGraphForUser,
  getLatestSupportCapturedAt,
} from '@/lib/graph/queries';
import { aggregateRecord } from '@/lib/record/aggregate';
import type { RecordIndex } from '@/lib/record/types';
import type { ToolContext, ToolHandler } from './types';

export const listGraphIndexSchema = z.object({});
export type ListGraphIndexArgs = z.infer<typeof listGraphIndexSchema>;

/**
 * Wire shape mirrors `RecordIndex` — same response the vault surface reads
 * from `/api/record`. Single source of truth keeps the UI and external
 * agents seeing the same vault.
 */
export type ListGraphIndexResult = RecordIndex;

export const listGraphIndexHandler: ToolHandler<
  ListGraphIndexArgs,
  ListGraphIndexResult
> = {
  name: 'list_graph_index',
  description:
    "Return the user's whole-graph index: topics with status, recent activity, importance-scored nodes (top 200), edges, and per-type counts. Call this first to discover what's in the vault before drilling into specific topics or nodes.",
  parameters: listGraphIndexSchema,
  async execute(ctx: ToolContext) {
    const [{ nodes, edges }, sources, topics] = await Promise.all([
      getFullGraphForUser(ctx.db, ctx.userId),
      ctx.db.sourceDocument.findMany({
        where: { userId: ctx.userId },
        select: { id: true, kind: true, capturedAt: true, createdAt: true },
      }),
      ctx.db.topicPage.findMany({
        where: { userId: ctx.userId },
        select: { topicKey: true, status: true, updatedAt: true },
      }),
    ]);

    const recencyMap =
      nodes.length > 0
        ? await getLatestSupportCapturedAt(
            ctx.db,
            ctx.userId,
            nodes.map((n) => n.id),
          )
        : undefined;

    return aggregateRecord({ topics, nodes, sources, edges, recencyMap });
  },
};
