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
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
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
): Promise<ProvenanceItem[]> {
  const supportEdges = await db.graphEdge.findMany({
    where: { type: 'SUPPORTS', toNodeId: nodeId, fromChunkId: { not: null } },
  });
  if (supportEdges.length === 0) return [];

  const chunkIds = supportEdges
    .map((e: any) => e.fromChunkId)
    .filter((id: string | null): id is string => id !== null);

  const chunks = await db.sourceChunk.findMany({
    where: { id: { in: chunkIds } },
    include: { sourceDocument: true },
    orderBy: [{ sourceDocumentId: 'asc' }, { index: 'asc' }],
  });

  return chunks.map((c: any) => ({
    chunkId: c.id,
    documentId: c.sourceDocumentId,
    documentKind: c.sourceDocument.kind as SourceDocumentKind,
    text: c.text,
    offsetStart: c.offsetStart,
    offsetEnd: c.offsetEnd,
    pageNumber: c.pageNumber,
    capturedAt: c.sourceDocument.capturedAt,
  }));
}

export interface GraphRevision {
  nodeCount: number;
  edgeCount: number;
  maxUpdatedAt: Date | null;
  hash: string;
}

export async function getGraphRevision(db: Db, userId: string): Promise<GraphRevision> {
  const [nodeCount, edgeCount, latestNode] = await Promise.all([
    db.graphNode.count({ where: { userId } }),
    db.graphEdge.count({ where: { userId } }),
    db.graphNode.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);
  const maxUpdatedAt = latestNode?.updatedAt ?? null;
  const hashInput = `${nodeCount}|${edgeCount}|${maxUpdatedAt?.toISOString() ?? 'none'}`;
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return { nodeCount, edgeCount, maxUpdatedAt, hash };
}
