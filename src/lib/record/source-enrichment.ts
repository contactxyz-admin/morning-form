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
import { markerChangeToWire } from '@/lib/markers/node-change-map';
import { markerJoinKey } from '@/lib/markers/marker-key';
import { interpret, isAuthoredMarker } from '@/lib/markers/clinical-interpretation';
import { deriveSourceAbnormality } from '@/lib/markers/source-abnormality';
import type { SourceViewNodeRow } from './source-view';

/** Read a finite number off a parsed-attributes value, else null. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

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
  // One map of the full MarkerChange (carries the reference range `interpret`
  // needs); the leaner wire `change` is projected from it via the canonical
  // `markerChangeToWire` — no second parallel map to keep in sync.
  const usable = diff && diff.previousPanelAt ? diff : null;
  const mcByKey = new Map<string, MarkerChange>();
  if (usable) for (const c of usable.changes) mcByKey.set(c.joinKey, c);

  return nodes.map((n) => {
    const base: SourceViewNodeRow = {
      id: n.id,
      type: n.type,
      displayName: n.displayName,
      canonicalKey: n.canonicalKey,
    };
    if (n.type !== 'biomarker') return base;

    // Source-abnormality signal (plan 2026-06-18-002): the SOURCE's own
    // out-of-range flag, relayed faithfully — derived from the concept node's
    // `flaggedOutOfRange` attribute, INDEPENDENT of the longitudinal panel diff
    // (it's the source's flag, not a diff), so a single-panel / flag-off record
    // still surfaces a clearly-abnormal value rather than showing it neutral.
    const sourceFlag = deriveSourceAbnormality(
      n.attributes.flaggedOutOfRange === true,
      num(n.attributes.value) ?? num(n.attributes.latestValue),
      num(n.attributes.referenceRangeLow),
      num(n.attributes.referenceRangeHigh),
    );
    const withFlag: SourceViewNodeRow = sourceFlag ? { ...base, sourceFlag } : base;

    if (!usable) return withFlag;
    const joinKey = markerJoinKey(n.canonicalKey, n.attributes.registryKey);
    const mc = mcByKey.get(joinKey);
    if (!mc) return withFlag;
    const change = markerChangeToWire(mc);
    // Authored-only clinical judgement (plan 2026-06-17): show value/direction
    // for every changed biomarker, but attach an interpretation (the flag) ONLY
    // for markers with a CMO-authored rule — no rule ⇒ no flag. Key the lookup
    // by the SAME joinKey the change matched on (registryKey ?? canonicalKey),
    // not the raw canonicalKey, so a registryKey-matched marker resolves its
    // authored rule instead of silently falling through to the default.
    const interpretation = isAuthoredMarker(joinKey)
      ? interpret(joinKey, change, {
          value: mc.afterValue,
          low: mc.referenceLow,
          high: mc.referenceHigh,
        })
      : undefined;
    return { ...withFlag, change, ...(interpretation ? { interpretation } : {}) };
  });
}
