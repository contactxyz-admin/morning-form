/**
 * Pure, range-relative change classifier — the single source of truth for how
 * a biomarker's movement is classified, shared by the authed record route
 * (`panel-diff.ts`) and the public demo (`src/lib/demo/derive-change.ts`).
 *
 * Extracted from `panel-diff.ts` so it carries NO server/Prisma dependency and
 * can be bundled into the client demo path (plan 2026-06-16-002). Classification
 * is strictly reference-range-relative and descriptive — it says whether a value
 * moved toward or away from its reference interval, never whether that is
 * clinically good, and never names a condition or cause.
 *
 * Optionally noise-gated by a Reference Change Value (audit item A7): when a
 * marker's `rcvPct` is supplied and the observed move is within that analytical
 * + biological noise floor, the change is reported as `stable` rather than
 * improved/worsened — so a sub-noise wobble never gets flagged as a real move.
 */

import { exceedsReferenceChangeValue } from './biological-variation';
import type { ReferenceChangeValue } from './biological-variation';

export type ChangeDirection = 'up' | 'down' | 'flat';
export type ChangeClassification =
  | 'improved' // moved toward / further into the reference interval
  | 'worsened' // moved away from the reference interval
  | 'stable' // in range both times, or no net distance change
  | 'unclassified' // no reference range to judge against — direction only
  | 'new'; // measured in the latest panel only (no prior value)

/** Distance from `x` to the `[low, high]` interval; 0 when inside it. */
export function distanceToRange(x: number, low: number | null, high: number | null): number {
  if (low != null && x < low) return low - x;
  if (high != null && x > high) return x - high;
  return 0;
}

/**
 * Pure range-relative change classifier. `improved` = closer to the reference
 * interval; `worsened` = further from it; `stable` = no net distance change
 * (incl. in-range both times); `unclassified` = no usable range.
 */
export function classifyChange(
  before: number,
  after: number,
  low: number | null,
  high: number | null,
  /**
   * Optional Reference Change Value (direction-specific rise/fall limits). When
   * supplied and the move is within it, the change is analytically/biologically
   * indistinguishable from noise and is reported as `stable` — see
   * `biological-variation.ts`.
   */
  rcv?: ReferenceChangeValue | null,
): { direction: ChangeDirection; classification: ChangeClassification } {
  const direction: ChangeDirection = after > before ? 'up' : after < before ? 'down' : 'flat';
  if (low == null && high == null) {
    return { direction, classification: 'unclassified' };
  }
  // Noise gate: a sub-RCV move is not a real change, so it is neither improved
  // nor worsened — regardless of which way it nudged relative to the range.
  if (rcv != null && !exceedsReferenceChangeValue(before, after, rcv)) {
    return { direction, classification: 'stable' };
  }
  const dBefore = distanceToRange(before, low, high);
  const dAfter = distanceToRange(after, low, high);
  if (dAfter < dBefore) return { direction, classification: 'improved' };
  if (dAfter > dBefore) return { direction, classification: 'worsened' };
  return { direction, classification: 'stable' };
}
