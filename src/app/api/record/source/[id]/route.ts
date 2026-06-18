import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { parseJsonField } from '@/lib/graph/queries';
import { buildSourceView } from '@/lib/record/source-view';
import { enrichGroundedNodes } from '@/lib/record/source-enrichment';
import { diffLatestPanels } from '@/lib/markers/panel-diff';

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

    // The panel diff depends only on the user, so run it in parallel with the
    // source load (flag-gated + NON-FATAL — mirrors /api/record: a diff failure
    // or flag-off → name-only markers, never a 500). It short-circuits cheaply
    // for users with <2 lab panels.
    const longitudinal = env.LONGITUDINAL_GRAPH_ENABLED === 'true';
    const [source, diff] = await Promise.all([
      prisma.sourceDocument.findFirst({
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
      }),
      longitudinal
        ? diffLatestPanels(prisma, user.id).catch((diffErr: unknown) => {
            const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
            console.error(`[API] source panel-diff failed (non-fatal): ${msg}`);
            return null;
          })
        : Promise.resolve(null),
    ]);

    if (!source) {
      return NextResponse.json({ error: 'Source not found.' }, { status: 404 });
    }

    const referencedNodeIds = Array.from(new Set(source.edges.map((e) => e.toNodeId)));
    const nodes = referencedNodeIds.length
      ? await prisma.graphNode.findMany({
          where: { id: { in: referencedNodeIds }, userId: user.id },
          // `attributes` (a JSON string column) carries `registryKey` — the marker
          // join key the enrichment matches on; it MUST be parsed (not cast) or the
          // join silently falls back to canonicalKey (ce:review BLOCKER).
          select: { id: true, type: true, displayName: true, canonicalKey: true, attributes: true },
        })
      : [];

    // Enrich grounded markers with their "what changed" + interpretation so the
    // source page reaches demo parity (value + flag). Pure, node-tested helper;
    // `change` is the user's latest-vs-previous panel move (the section reads
    // "what this report established → where it stands now").
    const nodeRows = enrichGroundedNodes(
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        displayName: n.displayName,
        canonicalKey: n.canonicalKey,
        attributes: parseJsonField(n.attributes),
      })),
      diff,
    );

    const view = buildSourceView({
      id: source.id,
      kind: source.kind,
      sourceRef: source.sourceRef,
      capturedAt: source.capturedAt,
      createdAt: source.createdAt,
      chunks: source.chunks,
      edges: source.edges,
      nodes: nodeRows,
    });

    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] record source error:', err);
    return NextResponse.json({ error: 'Failed to load source.' }, { status: 500 });
  }
}
