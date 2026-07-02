/**
 * Node-importance scoring for the Health Graph view (U13).
 *
 * A node's tier (1 = prominent, 2 = standard, 3 = faint) is a function of:
 *   - promoted flag          +3  (schema-authored high-signal node)
 *   - log-scaled degree      0-2 (connection density in the current graph)
 *   - recency                +1  (has a SUPPORTS chunk captured within N days)
 *   - changed-since-last-panel +2 (a biomarker that moved vs the prior panel —
 *                                  plan 2026-06-10-003 follow-up: so a marker
 *                                  the user just saw move can't be hidden below
 *                                  the 200-node cap)
 *   - staleness             -1-0 (audit B4: a node whose newest evidence has
 *                                  aged BEYOND the recency window loses standing
 *                                  as its confidence decays — see confidence.ts.
 *                                  0 within the window, so fresh-node scoring is
 *                                  unchanged; a retest refreshes the evidence
 *                                  date and clears the penalty.)
 *
 * Thresholds: tier 1 ≥ 4, tier 2 ≥ 2, tier 3 < 2.
 *
 * Degree counts all non-SUPPORTS edges incident to the node. SUPPORTS edges
 * are provenance (chunk → node), so they'd otherwise bias every node upward
 * by its citation count, not its structural centrality.
 *
 * Recency treats "fresh" as having any SUPPORTS edge whose source chunk's
 * owning document was captured within `recencyWindowDays` of `asOf`. The
 * caller must supply `recencyMap: Map<nodeId, Date>` with the most-recent
 * supporting-document capturedAt per node — computing this per call would
 * require an extra round-trip the API route is happier doing in one query.
 */

import type { GraphEdgeRecord, GraphNodeRecord } from './types';
import { ageInDays, confidenceDecayLoss } from './confidence';

export type ImportanceTier = 1 | 2 | 3;

export interface ImportanceInputs {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  /** nodeId -> latest supporting-doc capturedAt (null/absent if none). */
  recencyMap?: Map<string, Date | null>;
  /**
   * Node ids that changed since the user's last panel (longitudinal feature).
   * Each gets `CHANGE_LIFT` added so a freshly-moved marker stays in the
   * importance-ranked, capped node set rather than being silently dropped.
   */
  changedNodeIds?: ReadonlySet<string>;
  asOf?: Date;
  recencyWindowDays?: number;
}

export interface ImportanceResult {
  tier: ImportanceTier;
  score: number;
  components: {
    promoted: number;
    degree: number;
    recency: number;
    change: number;
    /** ≤ 0 penalty for a node whose newest evidence has aged past the recency
     *  window (confidence decay, audit B4); 0 within the window / no evidence. */
    staleness: number;
  };
}

const DEFAULT_RECENCY_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Importance bonus for a node that changed since the last panel. +2 lifts a
 *  standard promoted biomarker (3) clear into tier 1 (≥4), so it survives the
 *  node cap and reads as prominent. */
const CHANGE_LIFT = 2;

function isRecent(
  capturedAt: Date | null | undefined,
  asOf: Date,
  windowDays: number,
): boolean {
  if (!capturedAt) return false;
  return asOf.getTime() - capturedAt.getTime() <= windowDays * DAY_MS;
}

function tierFromScore(score: number): ImportanceTier {
  if (score >= 4) return 1;
  if (score >= 2) return 2;
  return 3;
}

/**
 * Compute importance for every node in `nodes`. Returns a map keyed by node id.
 * O(edges + nodes); safe to call on the full user graph (caps applied upstream).
 */
export function computeImportance(
  inputs: ImportanceInputs,
): Map<string, ImportanceResult> {
  const asOf = inputs.asOf ?? new Date();
  const windowDays = inputs.recencyWindowDays ?? DEFAULT_RECENCY_WINDOW_DAYS;

  const degreeCounts = new Map<string, number>();
  for (const edge of inputs.edges) {
    if (edge.type === 'SUPPORTS') continue;
    degreeCounts.set(edge.fromNodeId, (degreeCounts.get(edge.fromNodeId) ?? 0) + 1);
    degreeCounts.set(edge.toNodeId, (degreeCounts.get(edge.toNodeId) ?? 0) + 1);
  }

  const results = new Map<string, ImportanceResult>();
  for (const node of inputs.nodes) {
    const promotedScore = node.promoted ? 3 : 0;

    const degree = degreeCounts.get(node.id) ?? 0;
    const degreeScore = degree > 0 ? Math.min(2, Math.log2(degree + 1)) : 0;

    const recencyScore = isRecent(
      inputs.recencyMap?.get(node.id) ?? null,
      asOf,
      windowDays,
    )
      ? 1
      : 0;

    const changeScore = inputs.changedNodeIds?.has(node.id) ? CHANGE_LIFT : 0;

    // Staleness (B4): once a node's newest evidence has aged BEYOND the recency
    // window, de-emphasise it in proportion to how far its confidence has
    // decayed. Zero within the window (fresh scoring unchanged) and zero when we
    // have no evidence date (mirrors the recency term — don't penalise a node
    // that simply carries no supporting chunk). A retest refreshes the evidence
    // date, so the penalty clears on the next read.
    const evidenceAt = inputs.recencyMap?.get(node.id) ?? null;
    let stalenessScore = 0;
    if (evidenceAt) {
      const age = ageInDays(evidenceAt.getTime(), asOf.getTime());
      // Penalise the confidence LOST since the recency window edge: 0 at the
      // boundary (continuous with the recency term — no cliff), growing as the
      // node ages, and independent of the node's base confidence LEVEL (so a
      // low-confidence but fresh node is not mistaken for a stale one).
      const loss = confidenceDecayLoss(node.confidence, Math.max(0, age - windowDays));
      stalenessScore = loss > 0 ? -loss : 0; // avoid -0
    }

    const score = promotedScore + degreeScore + recencyScore + changeScore + stalenessScore;
    results.set(node.id, {
      tier: tierFromScore(score),
      score,
      components: {
        promoted: promotedScore,
        degree: degreeScore,
        recency: recencyScore,
        change: changeScore,
        staleness: stalenessScore,
      },
    });
  }

  return results;
}
