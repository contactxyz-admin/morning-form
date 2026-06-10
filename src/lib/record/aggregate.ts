import { listTopicConfigs } from '@/lib/topics/registry';
import { computeImportance } from '@/lib/graph/importance';
import {
  decodeSourceDocumentKind,
  type GraphNodeRecord,
  type NodeType,
} from '@/lib/graph/types';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import {
  edgeRecordToWire,
  nodeRecordToWire,
  type AggregateInput,
  type LogEntry,
  type LogEntryKind,
  type RecordIndex,
  type TopicStatus,
} from './types';

const MAX_RECENT_ACTIVITY = 10;
const DEFAULT_NODE_CAP = 200;

function matchesTopic(node: GraphNodeRecord, patterns: string[]): boolean {
  const key = node.canonicalKey.toLowerCase();
  return patterns.some((p) => key.includes(p));
}

/**
 * Lab-reading history instances: `observation` nodes that are INSTANCE_OF a
 * `biomarker` concept (longitudinal plan 2026-06-10-002 U6). These are dated
 * points behind a marker's trajectory, not graph concepts — they would flood
 * the canvas and the recent-activity log and consume the node cap. We exclude
 * them from the vault payload entirely; history surfaces via trajectories and
 * the panel diff instead. Standalone vital-sign observations (T4 — no
 * INSTANCE_OF to a biomarker) are NOT affected.
 */
function computeLabInstanceIds(
  nodes: GraphNodeRecord[],
  edges: AggregateInput['edges'],
): Set<string> {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.type !== 'INSTANCE_OF') continue;
    if (typeById.get(e.fromNodeId) === 'observation' && typeById.get(e.toNodeId) === 'biomarker') {
      ids.add(e.fromNodeId);
    }
  }
  return ids;
}

/**
 * Pure aggregator powering the unified `GET /api/record` endpoint (and the
 * legacy `/api/record/index` route during the Phase 2 transition). Kept
 * Prisma-free so tests can exercise the full surface with synthetic fixtures
 * — the route layer handles auth and hydration, the library handles the
 * shape.
 *
 * Folds in importance scoring + the 200-node cap that the previous
 * `/api/graph` endpoint owned, so a single round-trip serves the entire
 * vault surface (index + map mode + entity detail).
 */
export function aggregateRecord(input: AggregateInput): RecordIndex {
  const configs = listTopicConfigs();
  const topicRowByKey = new Map(input.topics.map((t) => [t.topicKey, t]));

  // Strip lab-reading history instances before anything else sees them — the
  // canvas/list, importance scoring + cap, type counts, and the activity log
  // all operate on graph concepts, not trajectory points (plan U6).
  const labInstanceIds = computeLabInstanceIds(input.nodes, input.edges);
  const graphNodes =
    labInstanceIds.size > 0 ? input.nodes.filter((n) => !labInstanceIds.has(n.id)) : input.nodes;
  const graphEdges =
    labInstanceIds.size > 0
      ? input.edges.filter(
          (e) => !labInstanceIds.has(e.fromNodeId) && !labInstanceIds.has(e.toNodeId),
        )
      : input.edges;

  const topics: TopicStatus[] = configs.map((config) => {
    const matchingNodes = graphNodes.filter(
      (n) =>
        config.relevantNodeTypes.includes(n.type) &&
        matchesTopic(n, config.canonicalKeyPatterns),
    );
    const matchingNodeIds = new Set(matchingNodes.map((n) => n.id));

    const sourceIds = new Set<string>();
    for (const edge of graphEdges) {
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
  for (const n of graphNodes) {
    activities.push({
      _sortTs: n.createdAt.getTime(),
      ts: n.createdAt.toISOString(),
      kind: 'node-added' satisfies LogEntryKind,
      label: `${n.displayName} added to graph`,
      // Lands on the unified vault with the entity preselected. The URL-state
      // pattern (?entity=<canonicalKey>) is what Phase 2 U3+U4 reads.
      targetHref: `/record?entity=${n.canonicalKey}`,
    });
  }

  activities.sort((a, b) => b._sortTs - a._sortTs);
  const recentActivity: LogEntry[] = activities
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((a) => ({ ts: a.ts, kind: a.kind, label: a.label, targetHref: a.targetHref }));

  // Importance scoring + node cap (formerly /api/graph). Recency scoring is
  // a no-op when recencyMap isn't supplied — that path is for callers (tests)
  // that don't care about per-node scoring specifics. Output is the wire
  // shape (string timestamps) so clients consume it directly without an
  // adapter pass.
  const nodeCap = input.nodeCap ?? DEFAULT_NODE_CAP;
  const totalNodes = graphNodes.length;

  let nodes: GraphNodeWire[] = [];
  let edges: GraphEdgeWire[] = [];
  const nodeTypeCounts: Partial<Record<NodeType, number>> = {};
  let truncated = false;

  if (totalNodes > 0) {
    const scores = computeImportance({
      nodes: graphNodes,
      edges: graphEdges,
      recencyMap: input.recencyMap,
    });

    const scoredPairs: Array<{ record: GraphNodeRecord; score: number }> = graphNodes.map(
      (record) => {
        const s = scores.get(record.id)!;
        return { record, score: s.score };
      },
    );
    scoredPairs.sort((a, b) => b.score - a.score);

    truncated = scoredPairs.length > nodeCap;
    const keptPairs = truncated ? scoredPairs.slice(0, nodeCap) : scoredPairs;

    nodes = keptPairs.map(({ record }) => {
      const s = scores.get(record.id)!;
      return nodeRecordToWire(record, { tier: s.tier, score: s.score });
    });

    const keptIds = new Set(nodes.map((n) => n.id));
    edges = graphEdges
      .filter((e) => keptIds.has(e.fromNodeId) && keptIds.has(e.toNodeId))
      .map(edgeRecordToWire);

    for (const n of nodes) {
      nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;
    }
  }

  return {
    topics,
    recentActivity,
    graphSummary: {
      nodeCount: totalNodes,
      sourceCount: input.sources.length,
      topicCount: topics.length,
    },
    nodes,
    edges,
    sources: input.sources.map((s) => {
      // Normalise legacy / corrupted `kind` strings to the canonical
      // enum at the wire boundary so external consumers (UI + MCP
      // agents) can exhaustive-switch. Unknown values default to
      // `lab_pdf` — the most common kind and a non-breaking display.
      const decoded = decodeSourceDocumentKind(s.kind);
      return {
        id: s.id,
        kind: decoded === 'unknown' ? 'lab_pdf' : decoded,
        capturedAt: s.capturedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      };
    }),
    nodeTypeCounts,
    truncated,
    totalNodes,
  };
}
