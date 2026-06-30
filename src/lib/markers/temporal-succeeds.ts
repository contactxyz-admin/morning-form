/**
 * `TEMPORAL_SUCCEEDS` edges over a biomarker's dated observation instances
 * (longitudinal-trajectory plan 2026-06-30-001 U1/U3).
 *
 * Dated `observation` instances are already written on lab ingest and linked
 * to their `biomarker` concept via `INSTANCE_OF`
 * (`src/lib/intake/lab-observations.ts`). This module makes the *succession*
 * between consecutive readings graph-native: for each marker with ≥2 dated
 * instances it links each reading to the reading that temporally succeeds it.
 *
 * Direction convention: the edge runs from the EARLIER observation to the
 * LATER one — i.e. the `to` node is the successor that `TEMPORAL_SUCCEEDS` the
 * `from` node. There are no readers of this edge type yet (it is drawn as a
 * neutral "agreement" line in `visual-encoding.ts`); the convention is
 * documented here so producers and any future reader agree.
 *
 * Idempotent: edges carry no `fromChunkId`, so `addEdge`'s composite dedup on
 * `(userId, type, fromNodeId, toNodeId, null)` makes re-ingest and re-backfill
 * no-ops. The writes are unconditional (additive, invisible until a read
 * surface renders them) — mirroring the observation-instance write posture in
 * `src/lib/env.ts`; both endpoints are lab-instance nodes, so the edge is
 * stripped from the concept-level canvas by `computeLabInstanceNodeIds`.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { addEdge } from '@/lib/graph/mutations';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ObservationForLink {
  id: string;
  measuredAt: string;
}

export interface TemporalEdgePair {
  fromNodeId: string;
  toNodeId: string;
}

/**
 * Pure core: given one marker's observation instances, return the consecutive
 * (earlier → later) pairs to link. Observations with an unparseable
 * `measuredAt` are dropped (an undated point has no place on the timeline).
 * Ties on the exact same instant collapse to a stable order by id so the
 * output is deterministic regardless of input order.
 */
export function orderObservationPairs(
  observations: readonly ObservationForLink[],
): TemporalEdgePair[] {
  const dated = observations
    .map((o) => ({ id: o.id, t: Date.parse(o.measuredAt) }))
    .filter((o) => !Number.isNaN(o.t))
    .sort((a, b) => (a.t === b.t ? a.id.localeCompare(b.id) : a.t - b.t));

  const pairs: TemporalEdgePair[] = [];
  for (let i = 0; i + 1 < dated.length; i++) {
    pairs.push({ fromNodeId: dated[i].id, toNodeId: dated[i + 1].id });
  }
  return pairs;
}

function readMeasuredAt(attributes: string | null): string | null {
  if (!attributes) return null;
  try {
    const parsed = JSON.parse(attributes) as { measuredAt?: unknown };
    return typeof parsed.measuredAt === 'string' ? parsed.measuredAt : null;
  } catch {
    return null;
  }
}

/**
 * Link consecutive observation instances of each biomarker concept with
 * `TEMPORAL_SUCCEEDS`. Scope to specific markers via
 * `opts.conceptCanonicalKeys` (the lab-ingest hot path passes the panel's
 * markers); omit to cover every biomarker (the backfill).
 *
 * Idempotent and safe to call post-commit; returns the number of edges newly
 * created (re-runs return 0). Never throws on a single marker — the caller's
 * non-fatal posture is preserved.
 */
export async function linkTemporalSucceedsForUser(
  db: Db,
  userId: string,
  opts: { conceptCanonicalKeys?: string[] } = {},
): Promise<{ created: number }> {
  const conceptWhere: Prisma.GraphNodeWhereInput = {
    userId,
    type: 'biomarker',
    ...(opts.conceptCanonicalKeys && opts.conceptCanonicalKeys.length > 0
      ? { canonicalKey: { in: opts.conceptCanonicalKeys } }
      : {}),
  };
  const concepts = await db.graphNode.findMany({ where: conceptWhere, select: { id: true } });
  if (concepts.length === 0) return { created: 0 };
  const conceptIds = concepts.map((c) => c.id);

  // INSTANCE_OF edges from observation instances to these concepts.
  const instanceEdges = await db.graphEdge.findMany({
    where: { userId, type: 'INSTANCE_OF', toNodeId: { in: conceptIds } },
    select: { fromNodeId: true, toNodeId: true },
  });
  if (instanceEdges.length === 0) return { created: 0 };

  const instanceIds = Array.from(new Set(instanceEdges.map((e) => e.fromNodeId)));
  const instances = await db.graphNode.findMany({
    where: { userId, id: { in: instanceIds }, type: 'observation' },
    select: { id: true, attributes: true },
  });
  const measuredAtById = new Map<string, string>();
  for (const inst of instances) {
    const at = readMeasuredAt(inst.attributes);
    if (at) measuredAtById.set(inst.id, at);
  }

  // Group observation instances by their concept.
  const byConcept = new Map<string, ObservationForLink[]>();
  for (const e of instanceEdges) {
    const at = measuredAtById.get(e.fromNodeId);
    if (!at) continue;
    const list = byConcept.get(e.toNodeId) ?? [];
    list.push({ id: e.fromNodeId, measuredAt: at });
    byConcept.set(e.toNodeId, list);
  }

  let created = 0;
  for (const observations of Array.from(byConcept.values())) {
    for (const pair of orderObservationPairs(observations)) {
      // addEdge dedups (no fromChunkId) so re-runs don't double-write; count a
      // create by detecting whether the edge already existed.
      const before = await db.graphEdge.findFirst({
        where: {
          userId,
          type: 'TEMPORAL_SUCCEEDS',
          fromNodeId: pair.fromNodeId,
          toNodeId: pair.toNodeId,
          fromChunkId: null,
        },
        select: { id: true },
      });
      await addEdge(db, userId, {
        type: 'TEMPORAL_SUCCEEDS',
        fromNodeId: pair.fromNodeId,
        toNodeId: pair.toNodeId,
      });
      if (!before) created++;
    }
  }
  return { created };
}
