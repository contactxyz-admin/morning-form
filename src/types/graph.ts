/**
 * Wire types for the /api/graph response. Server-side types live in
 * src/lib/graph/types.ts and use Date; JSON round-trip stringifies those,
 * so the client types mirror the same shape with string timestamps.
 */

import type { EdgeType, NodeType } from '@/lib/graph/types';
import type { ImportanceTier } from '@/lib/graph/importance';

export type { EdgeType, NodeType, ImportanceTier };

export interface GraphNodeWire {
  id: string;
  userId: string;
  type: NodeType;
  canonicalKey: string;
  displayName: string;
  attributes: Record<string, unknown>;
  confidence: number;
  promoted: boolean;
  createdAt: string;
  updatedAt: string;
  tier: ImportanceTier;
  score: number;
}

export interface GraphEdgeWire {
  id: string;
  userId: string;
  type: EdgeType;
  fromNodeId: string;
  toNodeId: string;
  fromChunkId: string | null;
  fromDocumentId: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphResponse {
  nodes: GraphNodeWire[];
  edges: GraphEdgeWire[];
  nodeTypeCounts: Partial<Record<NodeType, number>>;
  truncated: boolean;
  totalNodes: number;
}
