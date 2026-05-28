/**
 * Core hybrid retrieval primitive (PR 4).
 *
 * Implements:
 *  - hybridRetrieveNodes: vector (js-cosine on Float[] via bounded recent chunks) +
 *    lexical (substring on nodes) + graph traversal (topic-seeded) arms, fused by RRF.
 *  - Pure RRF and cosine helpers (exported for unit tests + future use).
 *  - Strict user scoping + topic scoping (when topicKey provided).
 *  - MVP Float[] + JS cosine strategy per design (no reliance on native pgvector
 *    <-> operators while we are on Float[] columns).
 *  - Compat guard usage: isPgvectorAvailable / getVectorSearchStrategy /
 *    isHybridRetrievalEnabled from embeddings/compat. Any failure or sqlite/dev
 *    path → zero vector arm, pure lexical+graph fallback (zero behavior change
 *    for callers until PR 5 wiring).
 *
 * This module is INTERNAL ONLY in PR 4. No scribe tool signatures, no MCP
 * contract changes. search_graph_nodes etc. continue to call the old path
 * until PR 5.
 *
 * RRF reference: adapted from medical-graphrag patterns (k=60 default).
 * All provenance flows through existing SUPPORTS edges + getProvenanceForNodes.
 *
 * Non-goals (PR 4): no backfill, no ingest hook, no public API, no native
 * operator path, no caching, no metrics (added later).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { embedQuery } from '@/lib/embeddings/pipeline';
import {
  getVectorSearchStrategy,
  isHybridRetrievalEnabled,
  isPgvectorAvailable,
} from '@/lib/embeddings/compat';
import { getTopicConfig } from '@/lib/topics/registry';
import {
  getSubgraphForTopic,
  getProvenanceForNodes,
  getRecentChunkVectors,
  getNodeIdsForSupportChunks,
  getAllNodesForUser,
  getNodesByIds,
} from './queries';
import type {
  GraphNodeRecord,
  ProvenanceItem,
  TopicSubgraphSpec,
} from './types';

// Local Db alias (matches queries.ts; avoids leaking private type).
type Db = PrismaClient | Prisma.TransactionClient;

/** Result item from hybrid retrieval (internal shape for PR 4/5). */
export interface HybridRetrieveResultItem {
  node: GraphNodeRecord;
  /** RRF fused score (higher = better). */
  score: number;
  /** Full provenance chain for the node (SUPPORTS chunks). */
  sources: ProvenanceItem[];
}

/** Options for hybridRetrieveNodes (all optional with sensible defaults). */
export interface HybridRetrieveOptions {
  topicKey?: string;
  limit?: number; // final cap after RRF (default 20)
  vectorK?: number; // top chunks to consider from vector arm (default 50)
  lexicalK?: number; // top nodes from lexical arm (default 30)
  graphDepth?: number; // expansion depth for graph arm (default 2)
  rrfK?: number; // RRF constant (60 is literature standard)
}

/**
 * Reciprocal Rank Fusion.
 * Given N ranked lists of node ids (best-first, rank 0 = highest), produce
 * a fused list sorted by descending score.
 *
 * Score contribution per list: 1 / (k + rank)
 * Overlaps accumulate; dups within a list are ignored (first rank wins).
 *
 * Exported for strong unit tests (math verification) and reuse.
 */
export function rrfFuse(
  lists: string[][],
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((id, rank) => {
      if (seen.has(id)) return;
      seen.add(id);
      const contrib = 1 / (k + rank);
      scores.set(id, (scores.get(id) ?? 0) + contrib);
    });
  }
  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Cosine similarity for two vectors (Float[] / number[]).
 * Returns value in [-1, 1]; 1 = identical direction, 0 = orthogonal.
 * Handles length mismatch by truncating to min len (defensive).
 * Zero-vector or empty → 0.
 *
 * Exported for tests + the JS cosine fallback arm.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  const sim = dot / denom;
  return Math.max(-1, Math.min(1, sim));
}

/** Internal: lexical substring match on nodes (displayName or canonicalKey). */
async function lexicalSearchNodes(
  db: Db,
  userId: string,
  query: string,
  k: number,
  topicSpec?: TopicSubgraphSpec,
): Promise<string[]> {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase();

  let nodes: GraphNodeRecord[];
  if (topicSpec) {
    const sub = await getSubgraphForTopic(db, userId, topicSpec);
    nodes = sub.nodes;
  } else {
    nodes = await getAllNodesForUser(db, userId, { limit: 1000 });
  }

  const matched = nodes.filter((n) => {
    const dn = n.displayName.toLowerCase();
    const ck = n.canonicalKey.toLowerCase();
    return dn.includes(q) || ck.includes(q);
  });

  return matched.slice(0, k).map((n) => n.id);
}

/** Internal: graph traversal arm — topic-scoped only (whole-graph callers omit). */
async function graphArmNodeIds(
  db: Db,
  userId: string,
  topicSpec: TopicSubgraphSpec,
  depth: number,
): Promise<string[]> {
  const sub = await getSubgraphForTopic(db, userId, {
    types: topicSpec.types,
    canonicalKeyPatterns: topicSpec.canonicalKeyPatterns,
    depth: depth ?? topicSpec.depth,
  });
  // Order returned by getSubgraphForTopic has seeds first, then expanded.
  // This gives proximity bias for RRF rank (lower rank = better for seeds).
  return sub.nodes.map((n) => n.id);
}

/**
 * Core internal primitive: hybridRetrieveNodes.
 *
 * Returns up to `limit` nodes ranked by RRF over up to three arms:
 *  1. Vector: js-cosine over recent embedded SourceChunks → SUPPORTS nodes
 *  2. Lexical: case-insensitive substring on displayName/canonicalKey
 *  3. Graph: topic-seeded BFS (when topicKey supplied)
 *
 * When embeddings absent / pgvector unavailable / embed fails / flag off:
 * vector arm contributes empty list → pure lexical + graph (identical to
 * pre-PR4 behaviour for the subgraph/lexical paths).
 *
 * Always user-scoped. When topicKey given, topic scoping is enforced via
 * registry + getSubgraphForTopic (no cross-topic leakage).
 *
 * Provenance (sources) always populated via existing getProvenanceForNodes.
 */
export async function hybridRetrieveNodes(
  db: Db,
  userId: string,
  query: string,
  options: HybridRetrieveOptions = {},
): Promise<HybridRetrieveResultItem[]> {
  const {
    topicKey,
    limit = 20,
    vectorK = 50,
    lexicalK = 30,
    graphDepth = 2,
    rrfK = 60,
  } = options;

  // Resolve topic scoping (if any). Unknown topicKey → treat as no-topic
  // (consistent with search_graph_nodes handler).
  const topicConfig = topicKey ? getTopicConfig(topicKey) : undefined;
  const topicSpec: TopicSubgraphSpec | undefined = topicConfig
    ? {
        types: topicConfig.relevantNodeTypes,
        canonicalKeyPatterns: topicConfig.canonicalKeyPatterns,
        depth: graphDepth,
      }
    : undefined;

  // --- Vector arm (MVP js-cosine on Float[] only; gated) ---
  let vectorNodeIds: string[] = [];
  const canDoVector =
    isPgvectorAvailable() &&
    getVectorSearchStrategy() === 'js-cosine' &&
    isHybridRetrievalEnabled();

  if (canDoVector && query && query.trim()) {
    let qvec: number[] | null = null;
    try {
      qvec = await embedQuery(query);
    } catch {
      // Transient embed failure (no key, rate, network) → no vector arm this call.
      qvec = null;
    }

    if (qvec && qvec.length > 0) {
      const candidates = await getRecentChunkVectors(db, userId, 400);
      if (candidates.length > 0) {
        const scored = candidates
          .map((c) => ({
            chunkId: c.chunkId,
            sim: cosineSimilarity(qvec!, c.vector),
          }))
          .filter((s) => s.sim > 0.05)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, vectorK);

        const topChunkIds = scored.map((s) => s.chunkId);
        const chunkToNodeIds = await getNodeIdsForSupportChunks(
          db,
          topChunkIds,
          userId,
        );

        const nodeBestRank = new Map<string, number>();
        scored.forEach((sc, rank) => {
          const nids = chunkToNodeIds.get(sc.chunkId) ?? [];
          for (const nid of nids) {
            if (!nodeBestRank.has(nid)) {
              nodeBestRank.set(nid, rank);
            }
          }
        });

        vectorNodeIds = Array.from(nodeBestRank.entries())
          .sort((a, b) => a[1] - b[1])
          .map(([id]) => id);
      }
    }
  }

  // --- Lexical arm (always cheap & safe) ---
  const lexicalNodeIds = await lexicalSearchNodes(
    db,
    userId,
    query,
    lexicalK,
    topicSpec,
  );

  // --- Graph arm (topic-scoped only for PR 4) ---
  let graphNodeIds: string[] = [];
  if (topicSpec) {
    graphNodeIds = await graphArmNodeIds(db, userId, topicSpec, graphDepth);
  }

  // --- RRF fusion ---
  const fused = rrfFuse([vectorNodeIds, lexicalNodeIds, graphNodeIds], rrfK);
  const topFused = fused.slice(0, limit);
  const topIds = topFused.map((f) => f.id);

  if (topIds.length === 0) {
    return [];
  }

  // Assemble nodes + provenance in batch (2 queries)
  const nodes = await getNodesByIds(db, topIds, userId);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const provMap = await getProvenanceForNodes(db, topIds, userId);

  const results: HybridRetrieveResultItem[] = topFused
    .filter((f) => nodeMap.has(f.id))
    .map((f) => ({
      node: nodeMap.get(f.id)!,
      score: f.score,
      sources: provMap.get(f.id) ?? [],
    }));

  return results;
}
