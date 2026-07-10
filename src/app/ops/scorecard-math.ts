/**
 * Pure weighted-scorecard math for the interactive Partner Scorecard —
 * extracted from the old inline render-time computation so the what-if
 * client and Vitest share one implementation.
 */
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';

export interface ScorecardState {
  /** weights[c] — percentage weight per criterion (any non-negative scale; normalized internally). */
  weights: number[];
  /** scores[c][p] — 1–5 score for criterion c, partner p. */
  scores: number[][];
}

export function baselineScorecard(): ScorecardState {
  return {
    weights: PILOT_PLAN.criteria.map(([, weight]) => weight),
    scores: PILOT_PLAN.criteria.map(([, , scores]) => [...scores]),
  };
}

/** Weighted 1–5 total per partner. A zero weight-sum degrades to all-zeros, not NaN. */
export function weightedTotals(state: ScorecardState): number[] {
  const weightSum = state.weights.reduce((a, w) => a + w, 0);
  const partnerCount = state.scores[0]?.length ?? 0;
  if (weightSum <= 0) return Array(partnerCount).fill(0);
  return Array.from({ length: partnerCount }, (_, p) =>
    state.scores.reduce((acc, row, c) => acc + row[p] * state.weights[c], 0) / weightSum,
  );
}

/** Competition ranking: 1 + number of strictly-better totals (ties share a rank). */
export function ranks(totals: number[]): number[] {
  return totals.map((x) => 1 + totals.filter((y) => y > x).length);
}

/** Cycles a score 1→2→3→4→5→1 — the single-click edit gesture on score cells. */
export function cycleScore(score: number): number {
  return score >= 5 ? 1 : score + 1;
}
