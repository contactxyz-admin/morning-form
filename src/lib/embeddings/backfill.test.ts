import { describe, expect, it } from 'vitest';
import {
  assertBackfillResultModel,
  DEFAULT_BACKFILL_BATCH_SIZE,
  estimateBackfillCandidates,
  estimateEmbeddingCostUsd,
  estimateEmbeddingTokens,
  estimateEmbeddingTokensForText,
  normalizeBackfillBatchSize,
  validateBackfillModel,
} from './backfill';
import { DEFAULT_EMBEDDING_MODEL } from './types';

describe('embedding backfill helpers', () => {
  it('uses the same deterministic token/cost estimate as the mock provider', () => {
    const texts = ['ferritin 18 ng/ml', 'haemoglobin normal', 'x'];
    const tokens = estimateEmbeddingTokens(texts);

    expect(tokens).toBe(
      Math.max(1, Math.floor(texts[0].length / 3.5)) +
        Math.max(1, Math.floor(texts[1].length / 3.5)) +
        Math.max(1, Math.floor(texts[2].length / 3.5)),
    );
    expect(estimateEmbeddingTokensForText('')).toBe(1);
    expect(estimateEmbeddingCostUsd(1_000_000)).toBe(0.02);
  });

  it('summarises candidate count, tokens, and cost for dry-run output', () => {
    const createdAt = new Date('2026-05-28T10:00:00Z');
    const estimate = estimateBackfillCandidates([
      { id: 'c1', text: 'Ferritin 18 ug/L', createdAt },
      { id: 'c2', text: 'Ferritin in range at 82 ug/L', createdAt },
    ]);

    expect(estimate.chunks).toBe(2);
    expect(estimate.tokens).toBeGreaterThan(1);
    expect(estimate.costUsd).toBeCloseTo(
      estimateEmbeddingCostUsd(estimate.tokens),
      12,
    );
  });

  it('keeps batch size in the provider-friendly range', () => {
    expect(normalizeBackfillBatchSize(DEFAULT_BACKFILL_BATCH_SIZE)).toBe(80);
    expect(normalizeBackfillBatchSize(1)).toBe(1);
    expect(normalizeBackfillBatchSize(100)).toBe(100);
    expect(() => normalizeBackfillBatchSize(0)).toThrow('--batch must be between');
    expect(() => normalizeBackfillBatchSize(101)).toThrow('--batch must be between');
    expect(() => normalizeBackfillBatchSize(1.5)).toThrow('--batch must be an integer');
  });

  it('pins backfill to the wired embedding model until another provider is implemented', () => {
    expect(validateBackfillModel(DEFAULT_EMBEDDING_MODEL)).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(() => validateBackfillModel('voyage-3')).toThrow('Unsupported embedding model');
  });

  it('rejects provider results that do not match the requested persisted model', () => {
    expect(() =>
      assertBackfillResultModel(DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_MODEL),
    ).not.toThrow();
    expect(() =>
      assertBackfillResultModel(DEFAULT_EMBEDDING_MODEL, 'mock-embedding'),
    ).toThrow('Refusing to persist incompatible vectors');
  });
});
