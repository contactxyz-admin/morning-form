import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import {
  getFullGraphForUser,
  getLatestSupportCapturedAt,
} from '@/lib/graph/queries';
import { computeImportance } from '@/lib/graph/importance';
import type { NodeType } from '@/lib/graph/types';

/**
 * GET /api/graph
 *
 * Returns the user's full graph with per-node importance tier + tier-aware
 * node cap (200). SUPPORTS edges are kept in the result so the client can
 * render provenance affordances without a second round-trip, but they do
 * not count toward degree scoring (see computeImportance).
 *
 * Response shape:
 *   {
 *     nodes: Array<Node & { tier: 1|2|3, score: number }>,
 *     edges: GraphEdgeRecord[],
 *     nodeTypeCounts: Record<NodeType, number>,
 *     truncated: boolean,
 *     totalNodes: number,
 *   }
 */

export const dynamic = 'force-dynamic';

const NODE_CAP = 200;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { nodes, edges } = await getFullGraphForUser(prisma, user.id);

    if (nodes.length === 0) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        nodeTypeCounts: {},
        truncated: false,
        totalNodes: 0,
      });
    }

    const recencyMap = await getLatestSupportCapturedAt(
      prisma,
      user.id,
      nodes.map((n) => n.id),
    );

    const scores = computeImportance({ nodes, edges, recencyMap });

    const scoredNodes = nodes.map((n) => {
      const s = scores.get(n.id)!;
      return { ...n, tier: s.tier, score: s.score };
    });

    scoredNodes.sort((a, b) => b.score - a.score);

    const truncated = scoredNodes.length > NODE_CAP;
    const keptNodes = truncated ? scoredNodes.slice(0, NODE_CAP) : scoredNodes;
    const keptIds = new Set(keptNodes.map((n) => n.id));

    const keptEdges = edges.filter(
      (e) => keptIds.has(e.fromNodeId) && keptIds.has(e.toNodeId),
    );

    const nodeTypeCounts: Record<string, number> = {};
    for (const n of keptNodes) {
      nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;
    }

    return NextResponse.json({
      nodes: keptNodes,
      edges: keptEdges,
      nodeTypeCounts: nodeTypeCounts as Record<NodeType, number>,
      truncated,
      totalNodes: nodes.length,
    });
  } catch (error) {
    console.error('[API] Graph fetch error:', error);
    return NextResponse.json({ error: 'Failed to load graph' }, { status: 500 });
  }
}
