/**
 * `get_node_detail` — fetch a single graph node by id, scoped to the current
 * user. Returns `null` if the node doesn't exist OR belongs to a different
 * user. "Doesn't exist" and "isn't yours" collapse to the same response so
 * cross-user leakage cannot be probed via id guessing.
 *
 * Defence-in-depth: `getNode` fetches by id alone, so we explicitly compare
 * `userId` here. Handlers that rely on implicit scoping from upstream queries
 * are one refactor away from leaking; a local ownership check is cheap.
 */
import { z } from 'zod';
import { getNode } from '@/lib/graph/queries';
import type { ToolContext, ToolHandler } from './types';

export const getNodeDetailSchema = z.object({
  nodeId: z.string().min(1),
});

export type GetNodeDetailArgs = z.infer<typeof getNodeDetailSchema>;

export interface GetNodeDetailResult {
  found: boolean;
  node: {
    id: string;
    type: string;
    canonicalKey: string;
    displayName: string;
    attributes: Record<string, unknown>;
    confidence: number;
  } | null;
}

export const getNodeDetailHandler: ToolHandler<GetNodeDetailArgs, GetNodeDetailResult> = {
  name: 'get_node_detail',
  description:
    'Fetch the full record for a graph node by id. Returns `found: false` when the node does not exist or does not belong to the current user.',
  parameters: getNodeDetailSchema,
  async execute(ctx: ToolContext, args: GetNodeDetailArgs) {
    const node = await getNode(ctx.db, args.nodeId);
    if (!node || node.userId !== ctx.userId) {
      return { found: false, node: null };
    }
    return {
      found: true,
      node: {
        id: node.id,
        type: node.type,
        canonicalKey: node.canonicalKey,
        displayName: node.displayName,
        attributes: node.attributes,
        confidence: node.confidence,
      },
    };
  },
};
