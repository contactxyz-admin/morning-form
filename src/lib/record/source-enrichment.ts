/**
 * Pure grounded-marker enrichment for the source-detail page (plan
 * 2026-06-17-003 U2). Attaches each grounded biomarker's "what changed" +
 * interpretation from a panel diff, by the same join key the record route uses.
 * DB-free and node-testable; the route loads the diff, parses the attributes
 * JSON column, and calls this.
 *
 * Mirrors the record route's two gates so the source page and the record map
 * agree: (1) decorate only when the diff has a real before/after
 * (`previousPanelAt`) — single-panel `new` baselines are withheld on both; and
 * (2) only biomarker nodes (matches `applyChangesToWireNodes`). Everything else
 * degrades to name-only.
 */

import type { PanelDiff, MarkerChange } from '@/lib/markers/panel-diff';
import { buildChangeByJoinKey } from '@/lib/markers/node-change-map';
import { markerJoinKey } from '@/lib/markers/marker-key';
import { interpret } from '@/lib/markers/clinical-interpretation';
import type { SourceViewNodeRow } from './source-view';

export interface GroundedNodeInput {
  id: string;
  type: string;
  displayName: string;
  canonicalKey: string;
  /**
   * Already-PARSED node attributes (the route parses the JSON-string column via
   * `parseJsonField` before calling — `registryKey` lives here and is the join
   * key the diff matches on; reading it off the raw string silently breaks the
   * match, ce:review BLOCKER).
   */
  attributes: Record<string, unknown>;
}

export function enrichGroundedNodes(
  nodes: readonly GroundedNodeInput[],
  diff: PanelDiff | null,
): SourceViewNodeRow[] {
  const usable = diff && diff.previousPanelAt ? diff : null;
  const wireByKey = usable ? buildChangeByJoinKey(usable.changes) : null;
  const mcByKey = new Map<string, MarkerChange>();
  if (usable) for (const c of usable.changes) mcByKey.set(c.joinKey, c);

  return nodes.map((n) => {
    const base: SourceViewNodeRow = {
      id: n.id,
      type: n.type,
      displayName: n.displayName,
      canonicalKey: n.canonicalKey,
    };
    if (!wireByKey || n.type !== 'biomarker') return base;
    const joinKey = markerJoinKey(n.canonicalKey, n.attributes.registryKey);
    const change = wireByKey.get(joinKey);
    if (!change) return base;
    const mc = mcByKey.get(joinKey);
    const interpretation = mc
      ? interpret(n.canonicalKey, change, {
          value: mc.afterValue,
          low: mc.referenceLow,
          high: mc.referenceHigh,
        })
      : undefined;
    return { ...base, change, ...(interpretation ? { interpretation } : {}) };
  });
}
