import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { buildSourceView } from '@/lib/record/source-view';

/**
 * GET /api/record/source/[id]
 *
 * Returns a single source document the authenticated user owns, with its
 * chunks in order and the set of graph nodes the source contributes edges
 * into. Used by `/record/source/[id]` and (later) by the ShareDialog preview.
 *
 * 401 if unauthenticated, 404 if the id is not owned by the caller (we
 * conflate "not found" and "not yours" on purpose — no enumeration oracle).
 */

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const source = await prisma.sourceDocument.findFirst({
      where: { id: params.id, userId: user.id },
      select: {
        id: true,
        kind: true,
        sourceRef: true,
        capturedAt: true,
        createdAt: true,
        chunks: {
          select: { id: true, index: true, text: true, pageNumber: true },
          orderBy: { index: 'asc' },
        },
        edges: {
          select: { toNodeId: true },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: 'Source not found.' }, { status: 404 });
    }

    const referencedNodeIds = Array.from(new Set(source.edges.map((e) => e.toNodeId)));
    const nodes = referencedNodeIds.length
      ? await prisma.graphNode.findMany({
          where: { id: { in: referencedNodeIds }, userId: user.id },
          select: { id: true, type: true, displayName: true, canonicalKey: true },
        })
      : [];

    const view = buildSourceView({
      id: source.id,
      kind: source.kind,
      sourceRef: source.sourceRef,
      capturedAt: source.capturedAt,
      createdAt: source.createdAt,
      chunks: source.chunks,
      edges: source.edges,
      nodes,
    });

    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] record source error:', err);
    return NextResponse.json({ error: 'Failed to load source.' }, { status: 500 });
  }
}
