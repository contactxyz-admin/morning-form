import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import {
  getFullGraphForUser,
  getLatestSupportCapturedAt,
} from '@/lib/graph/queries';
import { aggregateRecord } from '@/lib/record/aggregate';
import { diffLatestPanels, type PanelDiff } from '@/lib/markers/panel-diff';
import {
  applyChangesToWireNodes,
  applyEscalationsToWireNodes,
  applyInterpretationsToWireNodes,
  changedNodeIds,
  escalatedNodeIds,
  meaningfulMoves,
} from '@/lib/markers/node-change-map';
import { isClinicianReviewEnabled } from '@/lib/review/config';
import { loadEscalatedMarkerKeys } from '@/lib/review/overrides';

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

    // "What changed since last panel" diff (longitudinal plan 2026-06-10-003).
    // Computed IN the parallel batch (not serially after aggregate) so it adds
    // no latency to the hot vault path; it short-circuits cheaply for users
    // with <2 lab panels. Flag-off → never runs. A diff failure degrades to
    // null (no lift, no decoration) — it must never 500 the vault.
    const longitudinal = env.LONGITUDINAL_GRAPH_ENABLED === 'true';
    // Clinician-escalation override set (pilot MVP plan 2026-07-04): loaded in
    // the same parallel batch. Degrades to an empty set on failure — the vault
    // must never 500 over review bookkeeping; the escalation email is the
    // primary notification channel, this decoration is reinforcement.
    const [{ nodes, edges }, sources, topics, diff, escalatedKeys] = await Promise.all([
      getFullGraphForUser(prisma, user.id),
      prisma.sourceDocument.findMany({
        where: { userId: user.id },
        select: { id: true, kind: true, capturedAt: true, createdAt: true },
      }),
      prisma.topicPage.findMany({
        where: { userId: user.id },
        select: { topicKey: true, status: true, updatedAt: true },
      }),
      longitudinal
        ? diffLatestPanels(prisma, user.id).catch((diffErr: unknown) => {
            const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
            console.error(`[API] record panel-diff failed (non-fatal): ${msg}`);
            return null as PanelDiff | null;
          })
        : Promise.resolve(null as PanelDiff | null),
      isClinicianReviewEnabled()
        ? loadEscalatedMarkerKeys(prisma, user.id).catch((esclErr: unknown) => {
            const msg = esclErr instanceof Error ? esclErr.message : String(esclErr);
            console.error(`[API] record escalation-override load failed (non-fatal): ${msg}`);
            return new Set<string>();
          })
        : Promise.resolve(new Set<string>()),
    ]);

    // Lift markers that MEANINGFULLY moved (excl. `stable`) BEFORE the cap so
    // a freshly-moved marker can't be dropped from the rendered set — without
    // promoting every re-tested-but-unchanged marker to tier 1.
    const changed =
      diff && diff.previousPanelAt
        ? changedNodeIds(nodes, meaningfulMoves(diff.changes))
        : undefined;

    // Escalated markers get the same pre-cap lift: the decoration below runs
    // over cap-survivors only, so without this a >cap graph could drop the
    // very node the clinician flagged.
    const escalated = escalatedNodeIds(nodes, escalatedKeys);
    let lifted = changed;
    if (escalated.size > 0) {
      const merged = new Set<string>(changed ?? []);
      escalated.forEach((id) => merged.add(id));
      lifted = merged;
    }

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
    const index = aggregateRecord({ topics, nodes, sources, edges, recencyMap, liftedNodeIds: lifted });

    // Decorate the (now cap-surviving) biomarker nodes with their change, plus
    // the consumer-facing clinical interpretation for CMO-authored markers
    // (longitudinal-trajectory plan 2026-06-30-001 U8) — the same enrichment
    // the source-detail page already does, lifted onto the live record map.
    // Flag-gated by this block (only runs when the diff has a real before/after),
    // so flag-off emits neither `change` nor `interpretation`.
    if (diff && diff.previousPanelAt) {
      applyChangesToWireNodes(index.nodes, diff.changes);
      applyInterpretationsToWireNodes(index.nodes, diff.changes);
    }

    // Clinician escalation LAST and OUTSIDE the diff gate: a human decision
    // overrides any authored interpretation, and must render on a baseline
    // (first) panel where no diff exists — see applyEscalationsToWireNodes.
    applyEscalationsToWireNodes(index.nodes, escalatedKeys);

    return NextResponse.json(index, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API] record error:', err);
    return NextResponse.json({ error: 'Failed to load record.' }, { status: 500 });
  }
}
