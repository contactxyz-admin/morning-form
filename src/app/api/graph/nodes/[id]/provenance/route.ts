import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { getNode, getProvenanceForNode } from '@/lib/graph/queries';

/**
 * GET /api/graph/nodes/[id]/provenance
 *
 * Returns the node's SUPPORTS chunks ordered by document then chunk index,
 * plus the raw node record for header rendering. Ownership is enforced:
 * 404 when the node belongs to a different user, not 403, so we don't leak
 * node-id existence to a probing attacker.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
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

    const provenance = await getProvenanceForNode(prisma, node.id);
    return NextResponse.json({ node, provenance });
  } catch (error) {
    console.error('[API] Provenance fetch error:', error);
    return NextResponse.json({ error: 'Failed to load provenance.' }, { status: 500 });
  }
}
