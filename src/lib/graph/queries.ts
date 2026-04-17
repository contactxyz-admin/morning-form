/**
 * Read-side helpers for the Health Graph.
 *
 * Subgraph retrieval is BFS-style: seed = nodes whose type is in spec.types
 * AND whose canonicalKey matches any of spec.canonicalKeyPatterns (case-
 * insensitive substring); expand `depth` hops following any edge in either
 * direction (excluding SUPPORTS edges, which are provenance, not associative).
 *
 * Provenance lookup walks SUPPORTS edges from the requested node to source
 * chunks and returns chunks ordered by document then chunk index.
 *
 * Graph-revision hash is a stable function of (node count, edge count,
 * max(updatedAt across nodes)). Used by U8 topic compile to invalidate the
 * TopicPage cache without diffing the whole subgraph.
 */

import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type EdgeType,
  type GraphEdgeRecord,
  type GraphNodeRecord,
  type NodeType,
  type ProvenanceItem,
  type SourceDocumentKind,
  type SubgraphResult,
  type TopicSubgraphSpec,
} from './types';

type Db = PrismaClient | Prisma.TransactionClient;

function parseJsonField(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToNode(row: any): GraphNodeRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as NodeType,
    canonicalKey: row.canonicalKey,
    displayName: row.displayName,
    attributes: parseJsonField(row.attributes),
    confidence: row.confidence,
    promoted: row.promoted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToEdge(row: any): GraphEdgeRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as EdgeType,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    fromChunkId: row.fromChunkId,
    fromDocumentId: row.fromDocumentId,
    weight: row.weight,
    metadata: parseJsonField(row.metadata),
    createdAt: row.createdAt,
  };
}

export async function getNode(db: Db, id: string): Promise<GraphNodeRecord | null> {
  const row = await db.graphNode.findUnique({ where: { id } });
  return row ? rowToNode(row) : null;
}

export async function getNodesByType(
  db: Db,
  userId: string,
  type: NodeType,
): Promise<GraphNodeRecord[]> {
  const rows = await db.graphNode.findMany({
    where: { userId, type },
    orderBy: { displayName: 'asc' },
  });
  return rows.map(rowToNode);
}

export async function getSubgraphForTopic(
  db: Db,
  userId: string,
  spec: TopicSubgraphSpec,
): Promise<SubgraphResult> {
  // Seed: nodes matching the topic spec.
  const candidates = await db.graphNode.findMany({
    where: { userId, type: { in: spec.types } },
  });
  const lowerPatterns = spec.canonicalKeyPatterns.map((p) => p.toLowerCase());
  const seedRows = candidates.filter((n: any) => {
    if (lowerPatterns.length === 0) return true;
    const key = n.canonicalKey.toLowerCase();
    return lowerPatterns.some((p) => key.includes(p));
  });

  if (seedRows.length === 0) return { nodes: [], edges: [] };

  const visitedNodes = new Map<string, any>(seedRows.map((n: any) => [n.id, n]));
  const collectedEdges = new Map<string, any>();
  let frontier = new Set(seedRows.map((n: any) => n.id));

  for (let hop = 0; hop < spec.depth && frontier.size > 0; hop++) {
    // Expand outward via any non-SUPPORTS edge in either direction.
    const edges = await db.graphEdge.findMany({
      where: {
        userId,
        type: { not: 'SUPPORTS' },
        OR: [
          { fromNodeId: { in: Array.from(frontier) } },
          { toNodeId: { in: Array.from(frontier) } },
        ],
      },
    });

    const nextFrontier = new Set<string>();
    for (const e of edges) {
      collectedEdges.set(e.id, e);
      for (const nodeId of [e.fromNodeId, e.toNodeId]) {
        if (!visitedNodes.has(nodeId)) nextFrontier.add(nodeId);
      }
    }
    if (nextFrontier.size === 0) break;

    const newNodes = await db.graphNode.findMany({
      where: { id: { in: Array.from(nextFrontier) } },
    });
    for (const n of newNodes) visitedNodes.set(n.id, n);
    frontier = nextFrontier;
  }

  // Always include SUPPORTS edges anchored to any visited node, so callers
  // get provenance pointers alongside the structural subgraph.
  const supportsEdges = await db.graphEdge.findMany({
    where: {
      userId,
      type: 'SUPPORTS',
      toNodeId: { in: Array.from(visitedNodes.keys()) },
    },
  });
  for (const e of supportsEdges) collectedEdges.set(e.id, e);

  return {
    nodes: Array.from(visitedNodes.values()).map(rowToNode),
    edges: Array.from(collectedEdges.values()).map(rowToEdge),
  };
}

export async function getProvenanceForNode(
  db: Db,
  nodeId: string,
  userId: string,
): Promise<ProvenanceItem[]> {
  const byNode = await getProvenanceForNodes(db, [nodeId], userId);
  return byNode.get(nodeId) ?? [];
}

/**
 * Batched provenance lookup. Returns a Map keyed by nodeId; nodes with no
 * provenance get an empty array. Uses exactly two DB queries regardless of
 * input size — the per-node version is a thin wrapper over this.
 *
 * `userId` is required and filters at both layers (graphEdge.userId +
 * SourceDocument.userId via the chunk join). Callers are expected to have
 * already verified the requesting user owns the referenced nodes, but this
 * helper is self-guarding: if a future caller forgets that check, a
 * malformed graphEdge row pointing cross-user still cannot leak a chunk
 * from another user's document. Defence in depth for IDOR.
 */
export async function getProvenanceForNodes(
  db: Db,
  nodeIds: string[],
  userId: string,
): Promise<Map<string, ProvenanceItem[]>> {
  const result = new Map<string, ProvenanceItem[]>();
  for (const id of nodeIds) result.set(id, []);
  if (nodeIds.length === 0) return result;

  const supportEdges = await db.graphEdge.findMany({
    where: {
      userId,
      type: 'SUPPORTS',
      toNodeId: { in: nodeIds },
      fromChunkId: { not: null },
    },
  });
  if (supportEdges.length === 0) return result;

  const chunkToNodes = new Map<string, string[]>();
  for (const e of supportEdges) {
    if (!e.fromChunkId) continue;
    const arr = chunkToNodes.get(e.fromChunkId) ?? [];
    arr.push(e.toNodeId);
    chunkToNodes.set(e.fromChunkId, arr);
  }

  const chunkIds = Array.from(chunkToNodes.keys());
  const chunks = await db.sourceChunk.findMany({
    where: {
      id: { in: chunkIds },
      sourceDocument: { userId },
    },
    include: { sourceDocument: true },
    orderBy: [{ sourceDocumentId: 'asc' }, { index: 'asc' }],
  });

  for (const c of chunks) {
    const item: ProvenanceItem = {
      chunkId: c.id,
      documentId: c.sourceDocumentId,
      documentKind: c.sourceDocument.kind as SourceDocumentKind,
      text: c.text,
      offsetStart: c.offsetStart,
      offsetEnd: c.offsetEnd,
      pageNumber: c.pageNumber,
      capturedAt: c.sourceDocument.capturedAt,
    };
    for (const nodeId of chunkToNodes.get(c.id) ?? []) {
      result.get(nodeId)!.push(item);
    }
  }

  return result;
}

/**
 * Full user graph for the Health Graph view (U13). Returns every node and
 * every edge (including SUPPORTS) so the caller can score importance and
 * build provenance chains without another round-trip. Caps are applied by
 * the API route after importance scoring, not here.
 */
export async function getFullGraphForUser(
  db: Db,
  userId: string,
): Promise<SubgraphResult> {
  const [nodeRows, edgeRows] = await Promise.all([
    db.graphNode.findMany({ where: { userId } }),
    db.graphEdge.findMany({ where: { userId } }),
  ]);
  return {
    nodes: nodeRows.map(rowToNode),
    edges: edgeRows.map(rowToEdge),
  };
}

/**
 * Per-node latest supporting-document capturedAt. Used by `computeImportance`
 * to decide the +1 recency bonus. Nodes with no SUPPORTS edge map to null.
 * One SQL query regardless of input size.
 */
export async function getLatestSupportCapturedAt(
  db: Db,
  userId: string,
  nodeIds: string[],
): Promise<Map<string, Date | null>> {
  const result = new Map<string, Date | null>();
  for (const id of nodeIds) result.set(id, null);
  if (nodeIds.length === 0) return result;

  const supportEdges = await db.graphEdge.findMany({
    where: {
      userId,
      type: 'SUPPORTS',
      toNodeId: { in: nodeIds },
      fromChunkId: { not: null },
    },
    select: { toNodeId: true, fromChunkId: true },
  });
  if (supportEdges.length === 0) return result;

  const chunkIds = Array.from(
    new Set(
      supportEdges
        .map((e: { fromChunkId: string | null }) => e.fromChunkId)
        .filter((id): id is string => !!id),
    ),
  );
  const chunks = await db.sourceChunk.findMany({
    where: { id: { in: chunkIds } },
    include: { sourceDocument: { select: { capturedAt: true } } },
  });
  const chunkCapturedAt = new Map<string, Date>();
  for (const c of chunks) chunkCapturedAt.set(c.id, c.sourceDocument.capturedAt);

  for (const e of supportEdges) {
    if (!e.fromChunkId) continue;
    const ts = chunkCapturedAt.get(e.fromChunkId);
    if (!ts) continue;
    const prev = result.get(e.toNodeId);
    if (!prev || ts.getTime() > prev.getTime()) result.set(e.toNodeId, ts);
  }
  return result;
}

export interface GraphRevision {
  nodeCount: number;
  edgeCount: number;
  maxUpdatedAt: Date | null;
  hash: string;
}

export async function getGraphRevision(db: Db, userId: string): Promise<GraphRevision> {
  const [nodeCount, edgeCount, latestNode, latestEdge] = await Promise.all([
    db.graphNode.count({ where: { userId } }),
    db.graphEdge.count({ where: { userId } }),
    db.graphNode.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    db.graphEdge.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);
  const candidates = [latestNode?.updatedAt, latestEdge?.updatedAt].filter(
    (d): d is Date => d instanceof Date,
  );
  const maxUpdatedAt = candidates.length === 0
    ? null
    : new Date(Math.max(...candidates.map((d) => d.getTime())));
  const hashInput = `${nodeCount}|${edgeCount}|${maxUpdatedAt?.toISOString() ?? 'none'}`;
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return { nodeCount, edgeCount, maxUpdatedAt, hash };
}
