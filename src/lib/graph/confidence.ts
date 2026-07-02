/**
 * Confidence-over-time (audit B4).
 *
 * A graph node's stored `confidence` is authored once and never decays — so a
 * reading captured two years ago is trusted exactly as much as this morning's.
 * This module derives an EFFECTIVE confidence that decays with staleness: a node
 * whose latest evidence is older loses confidence, and a retest (fresh evidence)
 * restores it, because the age is measured from the newest supporting evidence.
 *
 * Decay is exponential with a half-life: effective = stored · 2^(−age/halfLife).
 * At the default 180-day half-life a node untouched for ~6 months sits at half
 * its stored confidence, and ANY age > 0 yields < the stored value.
 *
 * Pure and dependency-free. The consumer (node-importance scoring) turns a
 * decayed effective confidence into a de-emphasis of stale nodes; the decay
 * primitive itself is reusable for any confidence-aware surface.
 */

/** Default half-life for confidence decay, in days (~6 months). */
export const EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Age in whole/fractional days between two epoch-ms timestamps, floored at 0. */
export function ageInDays(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, (toMs - fromMs) / DAY_MS);
}

/**
 * Effective confidence after exponential decay: `stored · 2^(−ageDays/halfLife)`,
 * clamped to [0, 1]. Fresh (age 0), future-dated, or an invalid half-life returns
 * the (clamped) stored value — never decays upward. A non-finite stored value is
 * treated as fully confident (1) so a malformed row doesn't silently zero out.
 */
export function effectiveConfidence(
  storedConfidence: number,
  ageDays: number,
  halfLifeDays: number = EFFECTIVE_CONFIDENCE_HALF_LIFE_DAYS,
): number {
  const stored = Number.isFinite(storedConfidence)
    ? Math.max(0, Math.min(1, storedConfidence))
    : 1;
  if (!(ageDays > 0) || !(halfLifeDays > 0)) return stored;
  const decayed = stored * Math.pow(2, -ageDays / halfLifeDays);
  return Math.max(0, Math.min(1, decayed));
}
