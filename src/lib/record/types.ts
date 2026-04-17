import type { GraphNodeRecord } from '@/lib/graph/types';

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

export interface RecordIndex {
  topics: TopicStatus[];
  recentActivity: LogEntry[];
  graphSummary: GraphSummary;
}

/**
 * Plain-old-data shapes the aggregate function consumes. Kept narrow so the
 * pure function is trivial to unit-test without Prisma.
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

export interface AggregateEdgeRow {
  fromNodeId: string;
  toNodeId: string;
  fromDocumentId: string | null;
}

export interface AggregateInput {
  topics: AggregateTopicRow[];
  nodes: GraphNodeRecord[];
  sources: AggregateSourceRow[];
  edges: AggregateEdgeRow[];
}
