import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { getTopicConfig } from '@/lib/topics/registry';
import { deriveTopicLog } from '@/lib/record/log';

/**
 * GET /api/topics/[topicKey]/log
 *
 * Lightweight, no-LLM endpoint that powers `<TopicLogFooter />`. Returns a
 * reverse-chronological stream of the ingest + compile events that shaped
 * this topic for the authenticated user, plus a summary row (last compile
 * timestamp, source/node counts, stale-since-compile flag).
 *
 * 401 if unauthenticated, 404 for unknown topic keys.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { topicKey: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const config = getTopicConfig(params.topicKey);
    if (!config) {
      return NextResponse.json({ error: 'Unknown topic.' }, { status: 404 });
    }

    const lowerPatterns = config.canonicalKeyPatterns.map((p) => p.toLowerCase());

    const [candidateNodes, topicPage] = await Promise.all([
      prisma.graphNode.findMany({
        where: { userId: user.id, type: { in: config.relevantNodeTypes } },
        select: { id: true, displayName: true, canonicalKey: true, createdAt: true },
      }),
      prisma.topicPage.findUnique({
        where: { userId_topicKey: { userId: user.id, topicKey: params.topicKey } },
        select: { updatedAt: true, status: true },
      }),
    ]);

    const matchingNodes = candidateNodes.filter((n) => {
      if (lowerPatterns.length === 0) return true;
      const key = n.canonicalKey.toLowerCase();
      return lowerPatterns.some((p) => key.includes(p));
    });

    let sources: Array<{ id: string; kind: string; createdAt: Date }> = [];
    if (matchingNodes.length > 0) {
      const nodeIds = matchingNodes.map((n) => n.id);
      const sourceEdges = await prisma.graphEdge.findMany({
        where: {
          userId: user.id,
          fromDocumentId: { not: null },
          OR: [{ toNodeId: { in: nodeIds } }, { fromNodeId: { in: nodeIds } }],
        },
        select: { fromDocumentId: true },
      });
      const sourceIds = Array.from(
        new Set(
          sourceEdges
            .map((e) => e.fromDocumentId)
            .filter((id): id is string => id !== null),
        ),
      );
      if (sourceIds.length > 0) {
        sources = await prisma.sourceDocument.findMany({
          where: { id: { in: sourceIds }, userId: user.id },
          select: { id: true, kind: true, createdAt: true },
        });
      }
    }

    const lastCompiledAt =
      topicPage && topicPage.status === 'full' ? topicPage.updatedAt : null;

    const log = deriveTopicLog({
      topicKey: params.topicKey,
      lastCompiledAt,
      sources,
      nodes: matchingNodes.map((n) => ({
        id: n.id,
        displayName: n.displayName,
        createdAt: n.createdAt,
      })),
    });

    return NextResponse.json(log, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] topic log error:', err);
    return NextResponse.json({ error: 'Failed to load topic log.' }, { status: 500 });
  }
}
