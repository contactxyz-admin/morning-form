import { DEFAULT_EMBEDDING_MODEL, type EmbeddingModel } from './types';

export const DEFAULT_BACKFILL_BATCH_SIZE = 80;
export const MAX_BACKFILL_BATCH_SIZE = 100;
export const MIN_BACKFILL_BATCH_SIZE = 1;
export const EMBEDDING_COST_PER_MILLION_TOKENS_USD = 0.02;

export interface BackfillCandidate {
  id: string;
  text: string;
  createdAt: Date;
}

export interface BackfillEstimate {
  chunks: number;
  tokens: number;
  costUsd: number;
}

export function validateBackfillModel(model: string): EmbeddingModel {
  if (model !== DEFAULT_EMBEDDING_MODEL) {
    throw new Error(
      `Unsupported embedding model "${model}". This backfill is pinned to ${DEFAULT_EMBEDDING_MODEL} until a second provider is wired through the pipeline.`,
    );
  }
  return DEFAULT_EMBEDDING_MODEL;
}

export function normalizeBackfillBatchSize(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error('--batch must be an integer');
  }
  if (value < MIN_BACKFILL_BATCH_SIZE || value > MAX_BACKFILL_BATCH_SIZE) {
    throw new Error(
      `--batch must be between ${MIN_BACKFILL_BATCH_SIZE} and ${MAX_BACKFILL_BATCH_SIZE}`,
    );
  }
  return value;
}

export function estimateEmbeddingTokensForText(text: string): number {
  return Math.max(1, Math.floor(text.length / 3.5));
}

export function estimateEmbeddingTokens(texts: readonly string[]): number {
  return texts.reduce((sum, text) => sum + estimateEmbeddingTokensForText(text), 0);
}

export function estimateEmbeddingCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * EMBEDDING_COST_PER_MILLION_TOKENS_USD;
}

export function estimateBackfillCandidates(
  candidates: readonly BackfillCandidate[],
): BackfillEstimate {
  const tokens = estimateEmbeddingTokens(candidates.map((candidate) => candidate.text));
  return {
    chunks: candidates.length,
    tokens,
    costUsd: estimateEmbeddingCostUsd(tokens),
  };
}
