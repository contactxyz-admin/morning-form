import { describe, expect, it, vi } from 'vitest';
import {
  computeHybridRetrievalGroundingScore,
  logHybridRetrievalGroundingScore,
  summarizeGrounding,
  shouldGateGroundedAnswer,
  type GroundingSummary,
  type HybridRetrievalGroundingScore,
} from './hybrid-retrieval-grounding';

const score = (total: number, grounded: number): HybridRetrievalGroundingScore => ({
  total,
  grounded,
  score: total === 0 ? 0 : grounded / total,
  rrfMin: null,
  rrfMedian: null,
  rrfMax: null,
});

describe('summarizeGrounding (turn-level roll-up for the A4 gate)', () => {
  it('pools grounded/total across retrievals', () => {
    const s = summarizeGrounding([score(4, 4), score(2, 0)]);
    expect(s).toEqual({ retrievals: 2, total: 6, grounded: 4, score: 4 / 6 });
  });

  it('counts only non-empty retrievals and scores 0 when nothing was retrieved', () => {
    expect(summarizeGrounding([score(0, 0), score(0, 0)])).toEqual({
      retrievals: 0,
      total: 0,
      grounded: 0,
      score: 0,
    });
    expect(summarizeGrounding([])).toEqual({ retrievals: 0, total: 0, grounded: 0, score: 0 });
  });

  it('an empty retrieval does not dilute a grounded one', () => {
    expect(summarizeGrounding([score(3, 3), score(0, 0)]).score).toBe(1);
  });
});

describe('shouldGateGroundedAnswer (A4 downgrade decision)', () => {
  const summary = (total: number, score: number): GroundingSummary => ({
    retrievals: total > 0 ? 1 : 0,
    total,
    grounded: Math.round(total * score),
    score,
  });
  const base = {
    isTopLevelRuntime: true,
    classification: 'clinical-safe',
    gateEnabled: true,
    summary: summary(4, 0.25),
    floor: 0.5,
  };

  it('downgrades a weakly-grounded top-level clinical-safe answer', () => {
    expect(shouldGateGroundedAnswer(base)).toBe(true);
  });

  it('does not downgrade when the gate flag is off', () => {
    expect(shouldGateGroundedAnswer({ ...base, gateEnabled: false })).toBe(false);
  });

  it('does not downgrade a compile pass / referral child (not top-level runtime)', () => {
    expect(shouldGateGroundedAnswer({ ...base, isTopLevelRuntime: false })).toBe(false);
  });

  it('does not touch an already-deferred answer (only clinical-safe is gated)', () => {
    expect(shouldGateGroundedAnswer({ ...base, classification: 'out-of-scope-routed' })).toBe(false);
    expect(shouldGateGroundedAnswer({ ...base, classification: 'rejected' })).toBe(false);
  });

  it('does not penalise a turn that made no grounded retrieval (total = 0)', () => {
    expect(shouldGateGroundedAnswer({ ...base, summary: summary(0, 0) })).toBe(false);
  });

  it('is exclusive at the floor: gates below, passes at/above', () => {
    expect(shouldGateGroundedAnswer({ ...base, summary: summary(4, 0.49), floor: 0.5 })).toBe(true);
    expect(shouldGateGroundedAnswer({ ...base, summary: summary(4, 0.5), floor: 0.5 })).toBe(false);
    expect(shouldGateGroundedAnswer({ ...base, summary: summary(4, 0.75), floor: 0.5 })).toBe(false);
  });
});

describe('hybrid retrieval grounding metric', () => {
  it('counts only results with SourceChunk provenance in the top citations', () => {
    const metric = computeHybridRetrievalGroundingScore([
      {
        score: 0.03,
        sources: [{ chunkId: 'c1', documentId: 'd1', text: 'Ferritin 18' } as any],
      },
      {
        score: 0.01,
        sources: [{ chunkId: 'c2', documentId: '', text: 'Missing document' } as any],
      },
      {
        score: 0.02,
        sources: [
          { chunkId: '', documentId: '', text: 'ignored' } as any,
          { chunkId: 'c3', documentId: 'd3', text: 'outside top 1' } as any,
        ],
      },
    ], 1);

    expect(metric.total).toBe(3);
    expect(metric.grounded).toBe(1);
    expect(metric.score).toBeCloseTo(1 / 3, 10);
    expect(metric.rrfMin).toBe(0.01);
    expect(metric.rrfMedian).toBe(0.02);
    expect(metric.rrfMax).toBe(0.03);
  });

  it('returns zero score for empty result sets and logs a structured metric', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const metric = logHybridRetrievalGroundingScore({
      userId: 'u1',
      topicKey: 'iron',
      toolName: 'search_graph_nodes',
      query: 'low iron stores',
      results: [],
    });

    expect(metric).toEqual({
      total: 0,
      grounded: 0,
      score: 0,
      rrfMin: null,
      rrfMedian: null,
      rrfMax: null,
    });
    expect(info).toHaveBeenCalledWith(
      '[metrics] hybrid_retrieval_grounding_score',
      expect.objectContaining({
        userId: 'u1',
        topicKey: 'iron',
        toolName: 'search_graph_nodes',
        total: 0,
      }),
    );
    info.mockRestore();
  });
});
