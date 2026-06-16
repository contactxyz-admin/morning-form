/**
 * Derive a node's change decoration from its recorded readings — the demo's
 * single source of truth (plan 2026-06-16-002). The ring/badge is COMPUTED
 * from the recorded values via the same pure, range-relative classifier the
 * authed `/record` path uses (`classifyChange`), so a visual state can never
 * contradict the source it cites. The fixture never authors a tone.
 *
 * `diffLatestPanels` (panel-diff.ts) is DB-coupled and unusable in the demo;
 * this is the demo-side equivalent over fixture readings, sharing the same
 * pure classifier so demo and product classify identically.
 */

import { classifyChange } from '@/lib/markers/classify-change';
import type { NodeChangeWire } from '@/types/graph';
import type { DemoReading } from '../../../prisma/fixtures/demo-navigable-record';

/**
 * Compute `NodeChangeWire` from a biomarker's readings:
 * - 0 readings → undefined (no decoration).
 * - 1 reading → `new` (measured only in the latest panel; no prior value).
 * - ≥2 readings → classify the latest two via `classifyChange` against the
 *   latest panel's reference range.
 */
/** The most recent reading by date, or undefined if there are none. */
export function latestReading(
  readings: readonly DemoReading[] | undefined,
): DemoReading | undefined {
  if (!readings || readings.length === 0) return undefined;
  const sorted = [...readings].sort((a, b) => a.at.localeCompare(b.at));
  return sorted[sorted.length - 1];
}

export function deriveChange(
  readings: readonly DemoReading[] | undefined,
): NodeChangeWire | undefined {
  if (!readings || readings.length === 0) return undefined;
  const sorted = [...readings].sort((a, b) => a.at.localeCompare(b.at));
  const after = sorted[sorted.length - 1];
  const before = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  if (!before) {
    return {
      direction: null,
      classification: 'new',
      beforeValue: null,
      beforeAt: null,
      afterValue: after.value,
      afterAt: after.at,
      unit: after.unit,
    };
  }

  const { direction, classification } = classifyChange(
    before.value,
    after.value,
    after.referenceLow,
    after.referenceHigh,
  );
  return {
    direction,
    classification,
    beforeValue: before.value,
    beforeAt: before.at,
    afterValue: after.value,
    afterAt: after.at,
    unit: after.unit,
  };
}
