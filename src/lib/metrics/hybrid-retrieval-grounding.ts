import type { ProvenanceItem } from '@/lib/graph/types';

export interface GroundingScoredItem {
  score?: number;
  sources?: ProvenanceItem[];
}

export interface HybridRetrievalGroundingScore {
  total: number;
  grounded: number;
  score: number;
  rrfMin: number | null;
  rrfMedian: number | null;
  rrfMax: number | null;
}

export interface HybridRetrievalGroundingLogArgs {
  userId: string;
  topicKey: string;
  toolName: string;
  query: string;
  results: readonly GroundingScoredItem[];
  topProvenanceLimit?: number;
}

export function computeHybridRetrievalGroundingScore(
  results: readonly GroundingScoredItem[],
  topProvenanceLimit = 3,
): HybridRetrievalGroundingScore {
  const total = results.length;
  const grounded = results.filter((result) =>
    (result.sources ?? [])
      .slice(0, topProvenanceLimit)
      .some((source) => Boolean(source.chunkId && source.documentId)),
  ).length;
  const scores = results
    .map((result) => result.score)
    .filter((score): score is number => typeof score === 'number')
    .sort((a, b) => a - b);

  return {
    total,
    grounded,
    score: total === 0 ? 0 : grounded / total,
    rrfMin: scores.length === 0 ? null : scores[0],
    rrfMedian: scores.length === 0 ? null : scores[Math.floor(scores.length / 2)],
    rrfMax: scores.length === 0 ? null : scores[scores.length - 1],
  };
}

export function logHybridRetrievalGroundingScore(
  args: HybridRetrievalGroundingLogArgs,
): HybridRetrievalGroundingScore {
  const metric = computeHybridRetrievalGroundingScore(
    args.results,
    args.topProvenanceLimit,
  );
  console.info('[metrics] hybrid_retrieval_grounding_score', {
    userId: args.userId,
    topicKey: args.topicKey,
    toolName: args.toolName,
    queryLength: args.query.length,
    total: metric.total,
    grounded: metric.grounded,
    score: metric.score,
    rrfMin: metric.rrfMin,
    rrfMedian: metric.rrfMedian,
    rrfMax: metric.rrfMax,
  });
  return metric;
}
