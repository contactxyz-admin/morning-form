/**
 * Wire types for the /api/graph response. Server-side types live in
 * src/lib/graph/types.ts and use Date; JSON round-trip stringifies those,
 * so the client types mirror the same shape with string timestamps.
 */

import type { EdgeType, NodeType } from '@/lib/graph/types';
import type { ImportanceTier } from '@/lib/graph/importance';
import type { ChangeClassification, ChangeDirection } from '@/lib/markers/panel-diff';

export type { EdgeType, NodeType, ImportanceTier };

/**
 * "What changed since the last panel" for a biomarker node, attached by the
 * record route when LONGITUDINAL_GRAPH_ENABLED is on (plan 2026-06-10-003).
 * Range-relative + descriptive — no causal/diagnostic framing. Type-only
 * import of the classification unions keeps the vocabulary single-sourced in
 * panel-diff without a runtime dependency.
 */
export interface NodeChangeWire {
  direction: ChangeDirection | null; // null for `new` (no prior value)
  classification: ChangeClassification;
  beforeValue: number | null;
  beforeAt: string | null;
  afterValue: number;
  afterAt: string;
  unit: string;
}

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
  /**
   * Present only on biomarker nodes that moved vs the previous panel, and
   * only when the longitudinal read surface is enabled. Absent otherwise —
   * flag-off responses are byte-for-byte the pre-feature shape.
   */
  change?: NodeChangeWire;
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
