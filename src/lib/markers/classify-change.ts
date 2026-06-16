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
 */

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
): { direction: ChangeDirection; classification: ChangeClassification } {
  const direction: ChangeDirection = after > before ? 'up' : after < before ? 'down' : 'flat';
  if (low == null && high == null) {
    return { direction, classification: 'unclassified' };
  }
  const dBefore = distanceToRange(before, low, high);
  const dAfter = distanceToRange(after, low, high);
  if (dAfter < dBefore) return { direction, classification: 'improved' };
  if (dAfter > dBefore) return { direction, classification: 'worsened' };
  return { direction, classification: 'stable' };
}
