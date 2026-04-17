import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { getNode } from '@/lib/graph/queries';
import { listTopicConfigs } from '@/lib/topics/registry';
import { findTopicsForNode } from '@/lib/topics/node-topics';

/**
 * GET /api/graph/nodes/[id]/topics
 *
 * Returns the topics a graph node appears in — the same canonical-key-
 * pattern match used to seed topic subgraphs during compile. Powers the
 * "Appears in" cross-reference list in `NodeDetailSheet`.
 *
 * Ownership: 404 when the node belongs to a different user (not 403) so
 * we don't leak node-id existence to a probing attacker.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const node = await getNode(prisma, params.id);
    if (!node || node.userId !== user.id) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const topics = findTopicsForNode(node, listTopicConfigs());
    return NextResponse.json({ topics }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] node topics error:', err);
    return NextResponse.json({ error: 'Failed to load topics.' }, { status: 500 });
  }
}
