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

/** Project a `MarkerChange` to the leaner wire decoration (drops the
 *  reference range — the badge is range-relative already; the detail sheet
 *  reads the range off node attributes if it needs it). */
function toWire(change: MarkerChange): NodeChangeWire {
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
  for (const c of changes) m.set(c.joinKey, toWire(c));
  return m;
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
