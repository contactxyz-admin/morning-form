import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { buildSourceView } from '@/lib/record/source-view';
import { diffLatestPanels, type MarkerChange } from '@/lib/markers/panel-diff';
import { buildChangeByJoinKey } from '@/lib/markers/node-change-map';
import { markerJoinKey } from '@/lib/markers/marker-key';
import { interpret } from '@/lib/markers/clinical-interpretation';
import type { NodeChangeWire } from '@/types/graph';

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
          // `attributes` carries `registryKey` — the marker join key for the
          // change/interpretation enrichment below (plan 2026-06-17-003).
          select: { id: true, type: true, displayName: true, canonicalKey: true, attributes: true },
        })
      : [];

    // Enrich grounded markers with their "what changed" + interpretation so the
    // source page reaches demo parity (value + flag). Flag-gated and NON-FATAL
    // (mirrors /api/record): a diff failure or flag-off → name-only markers,
    // never a 500. `change` is the user's latest-vs-previous panel move; the
    // section reads "what this report established → where it stands now".
    const longitudinal = env.LONGITUDINAL_GRAPH_ENABLED === 'true';
    const diff =
      longitudinal && referencedNodeIds.length > 0
        ? await diffLatestPanels(prisma, user.id).catch((diffErr: unknown) => {
            const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
            console.error(`[API] source panel-diff failed (non-fatal): ${msg}`);
            return null;
          })
        : null;
    const wireByKey: Map<string, NodeChangeWire> = diff
      ? buildChangeByJoinKey(diff.changes)
      : new Map();
    const mcByKey = new Map<string, MarkerChange>();
    if (diff) for (const c of diff.changes) mcByKey.set(c.joinKey, c);

    const nodeRows = nodes.map((n) => {
      const attrs = (n.attributes ?? {}) as Record<string, unknown>;
      const joinKey = markerJoinKey(n.canonicalKey, attrs.registryKey);
      // Only biomarker nodes carry a panel change (matches applyChangesToWireNodes).
      const change = n.type === 'biomarker' ? wireByKey.get(joinKey) : undefined;
      const mc = change ? mcByKey.get(joinKey) : undefined;
      const interpretation =
        change && mc
          ? interpret(n.canonicalKey, change, {
              value: mc.afterValue,
              low: mc.referenceLow,
              high: mc.referenceHigh,
            })
          : undefined;
      return {
        id: n.id,
        type: n.type,
        displayName: n.displayName,
        canonicalKey: n.canonicalKey,
        ...(change ? { change } : {}),
        ...(interpretation ? { interpretation } : {}),
      };
    });

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
