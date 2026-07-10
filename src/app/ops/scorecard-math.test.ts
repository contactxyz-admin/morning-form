import { describe, expect, it } from 'vitest';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import { baselineScorecard, cycleScore, ranks, weightedTotals } from './scorecard-math';

describe('baselineScorecard', () => {
  it('mirrors the plan data and is safe to mutate (deep copy of scores)', () => {
    const state = baselineScorecard();
    expect(state.weights).toEqual(PILOT_PLAN.criteria.map(([, w]) => w));
    state.scores[0][0] = 99;
    expect(PILOT_PLAN.criteria[0][2][0]).not.toBe(99);
  });
});

describe('weightedTotals', () => {
  it('computes the same weighted totals the reference tab used to render', () => {
    const state = baselineScorecard();
    const totals = weightedTotals(state);
    const weightSum = state.weights.reduce((a, w) => a + w, 0);
    const expected = PILOT_PLAN.partners.map(
      (_, p) => PILOT_PLAN.criteria.reduce((acc, c) => acc + c[2][p] * c[1], 0) / weightSum,
    );
    expect(totals).toEqual(expected);
  });

  it('degrades to zeros (not NaN) when every weight is zeroed out', () => {
    const totals = weightedTotals({ weights: [0, 0], scores: [[3, 4], [5, 1]] });
    expect(totals).toEqual([0, 0]);
  });
});

describe('ranks', () => {
  it('ranks descending with shared ranks on ties', () => {
    expect(ranks([3.2, 4.1, 3.2, 2.0])).toEqual([2, 1, 2, 4]);
  });
});

describe('cycleScore', () => {
  it('cycles 1-5 and wraps', () => {
    expect(cycleScore(1)).toBe(2);
    expect(cycleScore(4)).toBe(5);
    expect(cycleScore(5)).toBe(1);
  });
});
