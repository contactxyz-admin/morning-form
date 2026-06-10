import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import {
  getFullGraphForUser,
  getLatestSupportCapturedAt,
} from '@/lib/graph/queries';
import { aggregateRecord } from '@/lib/record/aggregate';
import { diffLatestPanels } from '@/lib/markers/panel-diff';
import { applyChangesToWireNodes } from '@/lib/markers/node-change-map';

/**
 * GET /api/record
 *
 * Unified endpoint powering the vault surface — the merged shape that used
 * to require two round-trips against `/api/record/index` and `/api/graph`.
 * Returns topics, recent activity, graph summary, importance-scored nodes
 * (capped at 200), edges filtered to the kept-nodes set, per-type counts,
 * and truncation metadata.
 *
 * Replaces:
 *  - `/api/record/index` (deleted in Phase 2 U6 of the vault unification plan)
 *  - `/api/graph` (deleted in Phase 2 U6)
 *
 * Response is `no-store` — the underlying rows change on every ingest.
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

    // Recency map is computed only when there are nodes — otherwise the IN ()
    // would round-trip for nothing. Importance scoring still works without
    // it (recency component contributes 0), but the recency lift is the
    // signal that surfaces "freshly-cited" entities.
    const recencyMap =
      nodes.length > 0
        ? await getLatestSupportCapturedAt(
            prisma,
            user.id,
            nodes.map((n) => n.id),
          )
        : undefined;

    // Hybrid retrieval now powers drill-down search (`search_graph_nodes`).
    // Keep the vault index importance-first for PR7; a future semantic boost
    // belongs here behind a separate rollout flag after grounding + latency
    // canary gates are met.
    const index = aggregateRecord({ topics, nodes, sources, edges, recencyMap });

    // "What changed since last panel" decoration on biomarker nodes
    // (longitudinal plan 2026-06-10-003 U1). Flag-gated; runs after the cap
    // so it only decorates rendered nodes. A diff failure must not 500 the
    // vault — degrade to no decoration (flag-off → the payload is untouched).
    if (env.LONGITUDINAL_GRAPH_ENABLED === 'true') {
      try {
        const diff = await diffLatestPanels(prisma, user.id);
        if (diff && diff.previousPanelAt) {
          applyChangesToWireNodes(index.nodes, diff.changes);
        }
      } catch (diffErr) {
        const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
        console.error(`[API] record panel-diff decoration failed (non-fatal): ${msg}`);
      }
    }

    return NextResponse.json(index, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] record error:', err);
    return NextResponse.json({ error: 'Failed to load record.' }, { status: 500 });
  }
}
