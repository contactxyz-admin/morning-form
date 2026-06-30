/**
 * Map a panel diff onto graph wire nodes (longitudinal plan 2026-06-10-003 U1).
 *
 * `diffLatestPanels` returns per-marker changes keyed by `joinKey`
 * (registryKey ?? canonicalKey). The canvas renders biomarker concept nodes;
 * this attaches each change to its concept node by the same join key — never
 * by display name (the collision Phase 0's review fixed). Pure: callers run
 * it over the already-capped wire nodes after `aggregateRecord`, so a changed
 * marker that didn't survive the importance cap simply carries no decoration.
 */

import type { GraphNodeWire, NodeChangeWire } from '@/types/graph';
import type { MarkerChange } from './panel-diff';
import { markerJoinKey } from './marker-key';
import { interpret, isAuthoredMarker } from './clinical-interpretation';

/** Project a `MarkerChange` to the leaner wire decoration (drops the
 *  reference range — the badge is range-relative already; the detail sheet
 *  reads the range off node attributes if it needs it). Exported so callers that
 *  already hold the full `MarkerChange` (e.g. source-enrichment, which needs the
 *  reference range for `interpret`) can project the wire shape without keeping a
 *  second parallel map. */
export function markerChangeToWire(change: MarkerChange): NodeChangeWire {
  return {
    direction: change.direction,
    classification: change.classification,
    beforeValue: change.beforeValue,
    beforeAt: change.beforeAt,
    afterValue: change.afterValue,
    afterAt: change.afterAt,
    unit: change.unit,
  };
}

/** changes → Map keyed by joinKey, for O(1) lookup while decorating nodes. */
export function buildChangeByJoinKey(changes: MarkerChange[]): Map<string, NodeChangeWire> {
  const m = new Map<string, NodeChangeWire>();
  for (const c of changes) m.set(c.joinKey, markerChangeToWire(c));
  return m;
}

/**
 * Changes that represent a meaningful move — the ones worth LIFTING a node's
 * importance for. Excludes `stable` (in range both times / no net distance
 * change): without this, re-testing a whole panel would lift every re-tested
 * marker to tier 1 and flatten the importance hierarchy, lighting the graph
 * up uniformly instead of highlighting what actually moved. (Decoration still
 * shows `stable` on already-visible nodes — "re-tested, in range" is useful;
 * only the importance promotion is withheld.)
 */
export function meaningfulMoves(changes: MarkerChange[]): MarkerChange[] {
  return changes.filter((c) => c.classification !== 'stable');
}

/** Minimal node shape both GraphNodeRecord and GraphNodeWire satisfy. */
type ChangeMatchableNode = {
  id: string;
  type: string;
  canonicalKey: string;
  attributes: Record<string, unknown>;
};

/**
 * Ids of biomarker nodes that changed — used to lift their importance BEFORE
 * the node cap so a freshly-moved marker can't be dropped (plan
 * 2026-06-10-003 follow-up). Runs on the raw node records (pre-aggregate),
 * matching the same join key as the decoration.
 */
export function changedNodeIds(
  nodes: ReadonlyArray<ChangeMatchableNode>,
  changes: MarkerChange[],
): Set<string> {
  const ids = new Set<string>();
  if (changes.length === 0) return ids;
  const keys = new Set(changes.map((c) => c.joinKey));
  for (const node of nodes) {
    if (node.type !== 'biomarker') continue;
    if (keys.has(markerJoinKey(node.canonicalKey, node.attributes?.registryKey))) ids.add(node.id);
  }
  return ids;
}

/**
 * Attach `change` to each biomarker wire node whose join key matches a change.
 * Mutates and returns the same array (cheap; the route owns these objects).
 * Non-biomarker nodes are never decorated.
 */
export function applyChangesToWireNodes(
  nodes: GraphNodeWire[],
  changes: MarkerChange[],
): GraphNodeWire[] {
  if (changes.length === 0) return nodes;
  const byKey = buildChangeByJoinKey(changes);
  for (const node of nodes) {
    if (node.type !== 'biomarker') continue;
    const change = byKey.get(markerJoinKey(node.canonicalKey, node.attributes?.registryKey));
    if (change) node.change = change;
  }
  return nodes;
}

/**
 * Attach `interpretation` to each changed biomarker wire node on the AUTHED
 * record graph (longitudinal-trajectory plan 2026-06-30-001 U8) — the same
 * enrichment the source-detail page already does (`source-enrichment.ts`),
 * lifted from demo-only to the live `/api/record` map. Authored-only clinical
 * judgement (plan 2026-06-17): a flag is attached ONLY for markers with a
 * CMO-authored rule (`isAuthoredMarker`); an unreviewed marker shows
 * value/direction but no inferred flag. Keyed by the SAME join key as the
 * change, and computed from the full `MarkerChange` (the wire `change` drops
 * the reference range `interpret` needs). Mutates and returns the array.
 *
 * Callers gate this on the longitudinal flag exactly like `applyChangesToWireNodes`,
 * so flag-off emits no `interpretation` (byte-for-byte parity).
 */
export function applyInterpretationsToWireNodes(
  nodes: GraphNodeWire[],
  changes: MarkerChange[],
): GraphNodeWire[] {
  if (changes.length === 0) return nodes;
  const mcByKey = new Map<string, MarkerChange>();
  for (const c of changes) mcByKey.set(c.joinKey, c);
  for (const node of nodes) {
    if (node.type !== 'biomarker') continue;
    const joinKey = markerJoinKey(node.canonicalKey, node.attributes?.registryKey);
    const mc = mcByKey.get(joinKey);
    if (!mc || !isAuthoredMarker(joinKey)) continue;
    node.interpretation = interpret(joinKey, markerChangeToWire(mc), {
      value: mc.afterValue,
      low: mc.referenceLow,
      high: mc.referenceHigh,
    });
  }
  return nodes;
}
