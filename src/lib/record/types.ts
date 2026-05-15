import type {
  GraphEdgeRecord,
  GraphNodeRecord,
  NodeType,
  SourceDocumentKind,
} from '@/lib/graph/types';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';

/**
 * Per-topic state shown on `/record` — enough to render a card without a
 * second round-trip to `/api/topics/[topicKey]`.
 */
export interface TopicStatus {
  topicKey: string;
  displayName: string;
  status: 'stub' | 'full' | 'error';
  updatedAt: string | null;
  sourceCount: number;
  nodeCount: number;
  hasEvidence: boolean;
}

export type LogEntryKind = 'source-added' | 'topic-compiled' | 'node-added';

export interface LogEntry {
  ts: string;
  kind: LogEntryKind;
  label: string;
  targetHref: string;
}

export interface GraphSummary {
  nodeCount: number;
  sourceCount: number;
  topicCount: number;
}

/**
 * Wire-shape source-document summary. Date fields are ISO strings so the
 * response JSON-serialises cleanly without adapter shims at the client.
 *
 * `kind` is typed as the canonical `SourceDocumentKind` enum so external
 * MCP agents (and downstream UI code) can exhaustive-switch over the
 * known kinds. Legacy DB rows with stale string values are normalised at
 * the wire boundary in `aggregateRecord` via `decodeSourceDocumentKind`,
 * defaulting to `'lab_pdf'` if the DB value is no longer in the enum
 * (chosen because it's the most common kind and a non-breaking display).
 */
export interface SourceDocumentWire {
  id: string;
  kind: SourceDocumentKind;
  capturedAt: string;
  createdAt: string;
}

export interface RecordIndex {
  topics: TopicStatus[];
  recentActivity: LogEntry[];
  graphSummary: GraphSummary;
  /**
   * Importance-scored nodes, capped at `nodeCap` (default 200 in the route
   * handler). Order is descending by score, so `nodes[0]` is the most
   * important node in the user's graph. Wire shape — string timestamps —
   * because this is the JSON-serialised response consumed by client
   * components (`<GraphCanvas>`, `<GraphListView>`) without adapter shims.
   */
  nodes: GraphNodeWire[];
  /** Edges restricted to the kept-nodes set. SUPPORTS edges retained. */
  edges: GraphEdgeWire[];
  /**
   * All source documents in the user's vault (no truncation — sources are
   * low-cardinality compared to graph nodes). The canvas renders these as
   * hub nodes alongside the graph nodes so the SUPPORTS edges (carried as
   * `fromDocumentId` on existing edges) have visible targets; the list
   * view ignores them.
   */
  sources: SourceDocumentWire[];
  /** Counts per node type across the kept-nodes set. */
  nodeTypeCounts: Partial<Record<NodeType, number>>;
  /** True when the importance-ranked node count exceeded `nodeCap`. */
  truncated: boolean;
  /** Total node count across the user's full graph (pre-truncation). */
  totalNodes: number;
}

/**
 * Plain-old-data shapes the aggregate function consumes. Kept narrow so the
 * pure function is trivial to unit-test without Prisma — the route layer
 * hydrates these from Prisma rows.
 */
export interface AggregateTopicRow {
  topicKey: string;
  status: string;
  updatedAt: Date;
}

export interface AggregateSourceRow {
  id: string;
  kind: string;
  capturedAt: Date;
  createdAt: Date;
}

export interface AggregateInput {
  topics: AggregateTopicRow[];
  nodes: GraphNodeRecord[];
  sources: AggregateSourceRow[];
  edges: GraphEdgeRecord[];
  /**
   * Optional. Per-node `latest supporting-doc capturedAt`. When supplied,
   * importance scoring uses recency; otherwise recency contributes 0. The
   * route handler always supplies this; tests can omit when scoring
   * specifics aren't under test.
   */
  recencyMap?: Map<string, Date | null>;
  /** Defaults to 200 (matches the previous `/api/graph` cap). */
  nodeCap?: number;
}

/**
 * Convert a server-side `GraphNodeRecord` (with Date timestamps) into the
 * JSON-serialised wire shape clients consume. Reused for edges in the
 * companion helper below. Kept here so the aggregate function can emit the
 * wire shape directly without callers having to round-trip through Date.
 */
export function nodeRecordToWire(
  n: GraphNodeRecord,
  scoring: { tier: GraphNodeWire['tier']; score: number },
): GraphNodeWire {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    canonicalKey: n.canonicalKey,
    displayName: n.displayName,
    attributes: n.attributes,
    confidence: n.confidence,
    promoted: n.promoted,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    tier: scoring.tier,
    score: scoring.score,
  };
}

export function edgeRecordToWire(e: GraphEdgeRecord): GraphEdgeWire {
  return {
    id: e.id,
    userId: e.userId,
    type: e.type,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    fromChunkId: e.fromChunkId,
    fromDocumentId: e.fromDocumentId,
    weight: e.weight,
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
  };
}
