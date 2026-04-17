import { listTopicConfigs } from '@/lib/topics/registry';
import type { GraphNodeRecord } from '@/lib/graph/types';
import type {
  AggregateInput,
  LogEntry,
  LogEntryKind,
  RecordIndex,
  TopicStatus,
} from './types';

const MAX_RECENT_ACTIVITY = 10;

function matchesTopic(node: GraphNodeRecord, patterns: string[]): boolean {
  const key = node.canonicalKey.toLowerCase();
  return patterns.some((p) => key.includes(p));
}

/**
 * Pure aggregator powering `GET /api/record/index`. Kept Prisma-free so tests
 * can exercise the full surface with synthetic fixtures — the route layer
 * handles auth and hydration, the library handles the shape.
 */
export function aggregateRecord(input: AggregateInput): RecordIndex {
  const configs = listTopicConfigs();
  const topicRowByKey = new Map(input.topics.map((t) => [t.topicKey, t]));

  const topics: TopicStatus[] = configs.map((config) => {
    const matchingNodes = input.nodes.filter(
      (n) =>
        config.relevantNodeTypes.includes(n.type) &&
        matchesTopic(n, config.canonicalKeyPatterns),
    );
    const matchingNodeIds = new Set(matchingNodes.map((n) => n.id));

    const sourceIds = new Set<string>();
    for (const edge of input.edges) {
      if (!edge.fromDocumentId) continue;
      if (matchingNodeIds.has(edge.fromNodeId) || matchingNodeIds.has(edge.toNodeId)) {
        sourceIds.add(edge.fromDocumentId);
      }
    }

    const row = topicRowByKey.get(config.topicKey);
    const status: TopicStatus['status'] =
      row?.status === 'full' || row?.status === 'error' ? row.status : 'stub';

    return {
      topicKey: config.topicKey,
      displayName: config.displayName,
      status,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      sourceCount: sourceIds.size,
      nodeCount: matchingNodes.length,
      hasEvidence: config.hasEvidenceForCompile(matchingNodes),
    };
  });

  const activities: Array<LogEntry & { _sortTs: number }> = [];

  for (const s of input.sources) {
    activities.push({
      _sortTs: s.createdAt.getTime(),
      ts: s.createdAt.toISOString(),
      kind: 'source-added' satisfies LogEntryKind,
      label: `Source ingested — ${s.kind}`,
      targetHref: `/record/source/${s.id}`,
    });
  }
  for (const t of input.topics) {
    activities.push({
      _sortTs: t.updatedAt.getTime(),
      ts: t.updatedAt.toISOString(),
      kind: 'topic-compiled' satisfies LogEntryKind,
      label: `Compiled ${t.topicKey}`,
      targetHref: `/topics/${t.topicKey}`,
    });
  }
  for (const n of input.nodes) {
    activities.push({
      _sortTs: n.createdAt.getTime(),
      ts: n.createdAt.toISOString(),
      kind: 'node-added' satisfies LogEntryKind,
      label: `${n.displayName} added to graph`,
      targetHref: `/graph?focus=${n.id}`,
    });
  }

  activities.sort((a, b) => b._sortTs - a._sortTs);
  const recentActivity: LogEntry[] = activities
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((a) => ({ ts: a.ts, kind: a.kind, label: a.label, targetHref: a.targetHref }));

  return {
    topics,
    recentActivity,
    graphSummary: {
      nodeCount: input.nodes.length,
      sourceCount: input.sources.length,
      topicCount: topics.length,
    },
  };
}
