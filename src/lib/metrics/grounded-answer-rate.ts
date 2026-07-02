/**
 * Grounded-answer-rate benchmark (audit A4).
 *
 * Given a held-out set of cases (query → the retrieval results it produced), a
 * case is "grounded" when its grounding score — the fraction of its results
 * backed by real chunk+document provenance (see `hybrid-retrieval-grounding.ts`)
 * — clears a floor. The grounded-answer rate is the fraction of grounded cases.
 *
 * This is the regression harness the audit asks for: run it over a golden corpus
 * and fail CI if the rate drops below a target, so a retrieval/provenance change
 * that quietly ungrounds answers is caught before it ships. Pure — the corpus is
 * fixed retrieval outputs, so it needs no DB (a live-retrieval variant over
 * synthetic fixtures can wrap this later).
 */
import {
  computeHybridRetrievalGroundingScore,
  type GroundingScoredItem,
} from './hybrid-retrieval-grounding';

export interface GroundedAnswerCase {
  query: string;
  results: GroundingScoredItem[];
}

export interface GroundedAnswerRateReport {
  cases: number;
  groundedCases: number;
  /** groundedCases / cases (0 for an empty corpus). */
  rate: number;
  floor: number;
  perCase: Array<{ query: string; score: number; grounded: boolean }>;
}

export function computeGroundedAnswerRate(
  cases: readonly GroundedAnswerCase[],
  opts: { floor?: number; topProvenanceLimit?: number } = {},
): GroundedAnswerRateReport {
  const floor = opts.floor ?? 0.5;
  const perCase = cases.map((c) => {
    const score = computeHybridRetrievalGroundingScore(c.results, opts.topProvenanceLimit).score;
    return { query: c.query, score, grounded: score >= floor };
  });
  const groundedCases = perCase.filter((c) => c.grounded).length;
  return {
    cases: cases.length,
    groundedCases,
    rate: cases.length === 0 ? 0 : groundedCases / cases.length,
    floor,
    perCase,
  };
}
