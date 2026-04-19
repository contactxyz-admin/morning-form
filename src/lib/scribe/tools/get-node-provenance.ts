/**
 * `get_node_provenance` — return the SourceChunk excerpts that support a given
 * graph node, for the current user only. Thin adapter over
 * `src/lib/graph/queries.ts::getProvenanceForNode`, which already performs
 * defence-in-depth userId filtering at two layers (graphEdge + SourceDocument).
 *
 * Why we still ownership-check the node here: `getProvenanceForNode` filters
 * by userId on the edge side, but a stray cross-user nodeId would still return
 * an empty list rather than an explicit "not found". Surfacing ownership as a
 * `found: false` response makes the semantics unambiguous to the LLM.
 */
import { z } from 'zod';
import { getNode, getProvenanceForNode } from '@/lib/graph/queries';
import type { ToolContext, ToolHandler } from './types';

export const getNodeProvenanceSchema = z.object({
  nodeId: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
});

export type GetNodeProvenanceArgs = z.infer<typeof getNodeProvenanceSchema>;

export interface ProvenanceCitation {
  chunkId: string;
  documentId: string;
  documentKind: string;
  excerpt: string;
  pageNumber: number | null;
  capturedAt: string;
}

export interface GetNodeProvenanceResult {
  found: boolean;
  citations: ProvenanceCitation[];
  truncated: boolean;
}

export const getNodeProvenanceHandler: ToolHandler<
  GetNodeProvenanceArgs,
  GetNodeProvenanceResult
> = {
  name: 'get_node_provenance',
  description:
    'Return the source-document excerpts that support a graph node. Every scribe judgment should resolve to one of these citations.',
  parameters: getNodeProvenanceSchema,
  async execute(ctx: ToolContext, args: GetNodeProvenanceArgs) {
    const node = await getNode(ctx.db, args.nodeId);
    if (!node || node.userId !== ctx.userId) {
      return { found: false, citations: [], truncated: false };
    }

    const items = await getProvenanceForNode(ctx.db, args.nodeId, ctx.userId);
    const limit = args.limit ?? 5;
    const truncated = items.length > limit;
    const citations: ProvenanceCitation[] = items.slice(0, limit).map((p) => ({
      chunkId: p.chunkId,
      documentId: p.documentId,
      documentKind: p.documentKind,
      excerpt: p.text,
      pageNumber: p.pageNumber,
      capturedAt: p.capturedAt.toISOString(),
    }));

    return { found: true, citations, truncated };
  },
};
