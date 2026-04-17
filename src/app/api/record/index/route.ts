import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { getFullGraphForUser } from '@/lib/graph/queries';
import { aggregateRecord } from '@/lib/record/aggregate';

/**
 * GET /api/record/index
 *
 * Single aggregate endpoint powering the `/record` surface. Returns topic
 * states (one entry per registered topic), recent activity across the full
 * graph, and a compact graph summary. Reads are bounded by a single user's
 * data — no pagination needed today.
 *
 * Response is `no-store` because the underlying rows change on every ingest.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const [{ nodes, edges }, sources, topics] = await Promise.all([
      getFullGraphForUser(prisma, user.id),
      prisma.sourceDocument.findMany({
        where: { userId: user.id },
        select: { id: true, kind: true, capturedAt: true, createdAt: true },
      }),
      prisma.topicPage.findMany({
        where: { userId: user.id },
        select: { topicKey: true, status: true, updatedAt: true },
      }),
    ]);

    const index = aggregateRecord({ topics, nodes, sources, edges });

    return NextResponse.json(index, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] record index error:', err);
    return NextResponse.json({ error: 'Failed to load record.' }, { status: 500 });
  }
}
