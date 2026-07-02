import { describe, expect, it } from 'vitest';
import type { ProvenanceItem } from '@/lib/graph/types';
import { computeGroundedAnswerRate, type GroundedAnswerCase } from './grounded-answer-rate';

// Minimal provenance items — the grounding metric only reads chunkId/documentId.
const grounded = (): ProvenanceItem => ({ chunkId: 'c1', documentId: 'd1' }) as ProvenanceItem;
const ungrounded = (): ProvenanceItem => ({ chunkId: null, documentId: null }) as ProvenanceItem;

describe('computeGroundedAnswerRate', () => {
  it('returns 0 for an empty corpus', () => {
    const r = computeGroundedAnswerRate([]);
    expect(r.rate).toBe(0);
    expect(r.cases).toBe(0);
  });

  it('scores each case by its grounding fraction against the floor', () => {
    const cases: GroundedAnswerCase[] = [
      { query: 'all grounded', results: [{ sources: [grounded()] }, { sources: [grounded()] }] }, // score 1
      { query: 'half grounded', results: [{ sources: [grounded()] }, { sources: [ungrounded()] }] }, // score 0.5
      { query: 'none grounded', results: [{ sources: [ungrounded()] }] }, // score 0
    ];
    const r = computeGroundedAnswerRate(cases, { floor: 0.5 });
    expect(r.perCase.map((c) => c.grounded)).toEqual([true, true, false]); // 0.5 >= floor
    expect(r.groundedCases).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3, 5);
  });

  it('respects the floor (a stricter floor grounds fewer cases)', () => {
    const cases: GroundedAnswerCase[] = [
      { query: 'half', results: [{ sources: [grounded()] }, { sources: [ungrounded()] }] }, // 0.5
    ];
    expect(computeGroundedAnswerRate(cases, { floor: 0.5 }).groundedCases).toBe(1);
    expect(computeGroundedAnswerRate(cases, { floor: 0.6 }).groundedCases).toBe(0);
  });
});

// ── Held-out benchmark (A4). A golden corpus of retrieval outputs; the grounded-
// answer rate must stay above the CI floor. A retrieval/provenance regression
// that ungrounds answers drops the rate and fails this. Keep additions realistic.
describe('grounded-answer-rate benchmark (golden corpus)', () => {
  const GOLDEN: GroundedAnswerCase[] = [
    { query: 'why is my ferritin low', results: [{ sources: [grounded()] }, { sources: [grounded()] }] },
    { query: 'what changed in my iron panel', results: [{ sources: [grounded()] }, { sources: [grounded()] }] },
    { query: 'is my haemoglobin normal', results: [{ sources: [grounded()] }] },
    { query: 'transferrin saturation trend', results: [{ sources: [grounded()] }, { sources: [ungrounded()] }] }, // 0.5
    { query: 'sleep and recovery lately', results: [{ sources: [grounded()] }, { sources: [grounded()] }] },
    { query: 'energy dips in the afternoon', results: [{ sources: [grounded()] }] },
  ];
  const CI_FLOOR = 0.8; // ≥80% of golden queries must be grounded

  it('meets the grounded-answer-rate floor', () => {
    const r = computeGroundedAnswerRate(GOLDEN, { floor: 0.5 });
    expect(r.rate).toBeGreaterThanOrEqual(CI_FLOOR);
  });

  it('catches a provenance regression (stripping ids drops the rate)', () => {
    const regressed = GOLDEN.map((c) => ({
      ...c,
      results: c.results.map(() => ({ sources: [ungrounded()] })),
    }));
    expect(computeGroundedAnswerRate(regressed, { floor: 0.5 }).rate).toBeLessThan(CI_FLOOR);
  });
});
