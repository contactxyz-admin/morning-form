/**
 * Pure helpers for the demo time-scrubber control UX (plan 2026-06-16-001).
 * DOM-free — the layout/interaction lives in demo-graph-section; these hold the
 * arithmetic so it can be unit-tested in vitest's `node` env.
 */

/**
 * Percent `[0,100]` of `epoch` along a `[min,max]` track — for placing a stop
 * tick. A degenerate track (`max <= min`, e.g. a single stop) → 0.
 */
export function tickPosition(epoch: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((epoch - min) / (max - min)) * 100;
}

/**
 * Play stepper: the next stop index, or `null` when the timeline is complete
 * (at the last stop) or has nothing to play (≤1 stop). The caller stops/pauses
 * on `null`.
 */
export function nextPlayIndex(index: number, count: number): number | null {
  if (count <= 1) return null;
  return index < count - 1 ? index + 1 : null;
}
