/**
 * `OUTCOME_CHANGED` graph edges from a measured action outcome
 * (longitudinal-trajectory plan 2026-06-30-001 U2).
 *
 * When an `Action` reaches `outcome-measured` an `ActionOutcome` before/after
 * snapshot is written relationally. This module projects that decision onto
 * the graph: it creates a dated `intervention_event` instance for the action
 * and links it `OUTCOME_CHANGED → biomarker` concept, carrying the observed
 * window and a DESCRIPTIVE rationale.
 *
 * Why an `intervention_event` node: `OUTCOME_CHANGED`'s only valid source
 * endpoint is `intervention_event` (`edge-validation.ts`), and `Action` rows
 * are relational (kept so by design — brainstorm §3.6). The event is the
 * existing, validated bridge between the relational decision and the graph.
 * It is standalone (no `INSTANCE_OF` parent) because a relational action has
 * no intervention *concept* node to parent to; `INSTANCE_OF` is optional.
 *
 * Safety: the rationale is descriptive only — temporal association, never
 * proven causation (no "caused/fixed/cured"). The phrasing is pinned so the
 * Phase 3 false-causality enforcement (U14) accepts it.
 *
 * Idempotent: the event key is stable per (action, date) and the edge dedups
 * on `(userId, type, from, to, null)`, so a re-run is a no-op. Non-fatal by
 * contract — callers run this post-commit so a missing concept never converts
 * a successful outcome write into an error.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { addEdge, addNode } from '@/lib/graph/mutations';
import { canonicalKeyFor, slugify } from '@/lib/graph/canonical-keys';

type Db = PrismaClient | Prisma.TransactionClient;

export interface OutcomeForEdge {
  actionId: string;
  label: string;
  markerName: string;
  beforeValue: number | null;
  beforeAt: string | null;
  afterValue: number;
  afterAt: string | null;
  /** When the intervention was accepted/started; the event is dated here when present. */
  acceptedAt?: string | null;
}

/**
 * Descriptive, non-causal rationale for an `OUTCOME_CHANGED` edge. Reports the
 * temporal coincidence between the action and the marker movement and is
 * explicit that this is association, not proof. No treatment/dose/causal verb.
 */
export function buildOutcomeRationale(o: OutcomeForEdge): string {
  const movement =
    o.beforeValue != null
      ? `${o.markerName} moved from ${o.beforeValue} to ${o.afterValue}`
      : `${o.markerName} was measured at ${o.afterValue}`;
  return `After the “${o.label}” action, ${movement} over this window. This is a temporal association, not a proven cause; other factors may also contribute.`;
}

/**
 * Create the `intervention_event` + `OUTCOME_CHANGED` edge for one measured
 * outcome. Returns whether an edge was newly created (false when the marker
 * concept can't be resolved or the edge already existed). Never throws on a
 * resolvable-data problem — resolves the concept, skips cleanly otherwise.
 */
export async function linkOutcomeChanged(
  db: Db,
  userId: string,
  outcome: OutcomeForEdge,
): Promise<{ created: boolean; reason?: string }> {
  // Resolve the biomarker concept by displayName (the Action.markerName is a
  // display label), falling back to the slugified canonical key.
  const concept =
    (await db.graphNode.findFirst({
      where: { userId, type: 'biomarker', displayName: outcome.markerName },
      select: { id: true },
    })) ??
    (await db.graphNode.findFirst({
      where: { userId, type: 'biomarker', canonicalKey: slugify(outcome.markerName) },
      select: { id: true },
    }));
  if (!concept) return { created: false, reason: 'no-biomarker-concept' };

  // The event is dated when the intervention started (acceptedAt) if known,
  // else when the outcome was observed (afterAt), else now is not available in
  // this pure-ish path — bail if we have no date to anchor the timeline.
  const occurredAt = outcome.acceptedAt ?? outcome.afterAt;
  if (!occurredAt) return { created: false, reason: 'no-date' };

  const eventKey = canonicalKeyFor('intervention_event', {
    parentKey: `action_${slugify(outcome.actionId)}`,
    occurredAt,
    eventKind: 'completed',
  });

  const { id: eventNodeId } = await addNode(db, userId, {
    type: 'intervention_event',
    canonicalKey: eventKey,
    displayName: outcome.label,
    attributes: {
      eventKind: 'completed',
      occurredAt: new Date(occurredAt).toISOString(),
      source: 'action_outcome',
    },
    // A decision projection, not a graph concept — keep it off the importance
    // promotion track (mirrors observation instances).
    promoted: false,
  });

  const before = await db.graphEdge.findFirst({
    where: {
      userId,
      type: 'OUTCOME_CHANGED',
      fromNodeId: eventNodeId,
      toNodeId: concept.id,
      fromChunkId: null,
    },
    select: { id: true },
  });

  await addEdge(db, userId, {
    type: 'OUTCOME_CHANGED',
    fromNodeId: eventNodeId,
    toNodeId: concept.id,
    metadata: {
      observedFrom: outcome.beforeAt ?? null,
      observedTo: outcome.afterAt ?? null,
      rationale: buildOutcomeRationale(outcome),
    },
  });

  return { created: !before };
}
