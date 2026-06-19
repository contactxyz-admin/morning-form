/**
 * Small shared numeric helpers for the metrics modules. Extracted so the
 * activation-funnel report and the retest-retention report share one
 * implementation of percentile/median/rounding rather than duplicating them.
 */

/**
 * Sorted-midpoint percentile with linear interpolation. For p=0.5 this is the
 * median (the mean of the two middle values for even-length input). Throws on
 * empty input — callers guard length first.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile called on empty array');
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const weight = rank - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

/** Median = the 50th percentile. */
export function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
