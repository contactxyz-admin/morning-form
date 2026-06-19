/**
 * Demo-fixture → wire-shape adapter.
 *
 * `<GraphCanvas>` accepts `GraphNodeWire` / `GraphEdgeWire` so the same
 * component renders both /demo (fixture-driven) and /graph (live API).
 * `DemoNode` / `DemoEdge` are key-shaped, not id-shaped — this module
 * is the translation layer.
 *
 * Identity rule, locked: `wireNode.id = demoNode.nodeKey`. Downstream
 * code (NodeDetailSheet lookup, graph-canvas focus tracking) depends on
 * stable, predictable ids — no opaque UUIDs.
 */

import type {
  DemoEdge,
  DemoNode,
  DemoRecordFixture,
  DemoSource,
  DemoSourceChunk,
} from '../../../prisma/fixtures/demo-navigable-record';
import type { ImportanceTier } from '../graph/importance';
import type { EdgeType, GraphEdgeWire, GraphNodeWire, GraphResponse } from '../../types/graph';
import { deriveChange, latestReading } from './derive-change';
import { evidenceGrade } from './evidence-grade';
import { interpret, isAuthoredMarker } from '../markers/clinical-interpretation';
import { deriveSourceAbnormality } from '../markers/source-abnormality';
import { buildSourceView, type SourceView } from '../record/source-view';

/** Pre-built per-node provenance lookup, used to feed NodeDetailSheet without an authed fetch. */
export interface DemoNodeProvenance {
  readonly node: GraphNodeWire;
  readonly chunks: readonly DemoSourceChunk[];
  readonly sources: readonly DemoSource[];
}

export interface AdaptedDemoFixture {
  readonly graph: GraphResponse;
  /** O(1) lookup keyed by node id (= demoNode.nodeKey). */
  readonly provenanceByNodeId: ReadonlyMap<string, DemoNodeProvenance>;
  /**
   * O(1) lookup keyed by source id (= demoSource.sourceKey, == the synthesized
   * source-hub node id). Lets the demo open a source / lab-report node into the
   * same shared source-detail body the authed `/record/source/[id]` page uses
   * (plan 2026-06-17-002), with no authed fetch — the fixture is the source of
   * truth.
   */
  readonly sourceViewByKey: ReadonlyMap<string, SourceView>;
}

/**
 * Stable timestamp for synthesized nodes — first source's `capturedAt`.
 * Anchoring the fixture to a single deterministic moment so re-renders
 * don't shift the node's `createdAt` field on every load.
 */
function fixtureTimestamp(fixture: DemoRecordFixture): string {
  const first = fixture.sources[0];
  return first?.capturedAt ?? '2026-01-01T00:00:00.000Z';
}

/**
 * Compute degree for each node (count of edges where it is source or
 * target). Drives both `score` and `tier` on the synthesized wire node.
 */
function computeDegree(fixture: DemoRecordFixture): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edge of fixture.edges) {
    degree.set(edge.fromNodeKey, (degree.get(edge.fromNodeKey) ?? 0) + 1);
    degree.set(edge.toNodeKey, (degree.get(edge.toNodeKey) ?? 0) + 1);
  }
  return degree;
}

function tierFromDegree(degree: number): ImportanceTier {
  if (degree >= 4) return 1;
  if (degree >= 2) return 2;
  return 3;
}

function nodeToWire(
  node: DemoNode,
  degree: number,
  maxDegree: number,
  timestamp: string,
): GraphNodeWire {
  // DERIVE the change decoration from the node's recorded readings via the
  // shared range-relative classifier (plan 2026-06-16-002). The fixture never
  // authors a tone, so the ring can't contradict its cited source.
  const change = deriveChange(node.readings);
  // Consumer interpretation (the four CMO dimensions + flag) from the change +
  // the latest reading's range (plan 2026-06-16-003). Authored-only clinical
  // judgement (plan 2026-06-17): only markers with a CMO-authored rule carry an
  // interpretation/flag — an unreviewed marker shows its change (value/direction)
  // but no inferred flag, so lack of review can't read as clinical urgency.
  const latest = latestReading(node.readings);
  const interpretation =
    change && latest && isAuthoredMarker(node.canonicalKey)
      ? interpret(node.canonicalKey, change, {
          value: latest.value,
          low: latest.referenceLow,
          high: latest.referenceHigh,
        })
      : undefined;
  // Source-abnormality (plan 2026-06-18-002): relay the fixture lab's OWN
  // `flaggedOutOfRange` flag for a biomarker — the safety net so a clearly-
  // abnormal value is never shown neutral. Direction read from the latest
  // reading's numbers when present (the fixture's display range is a string, so
  // demo markers without readings relay "out of range" without a direction).
  const sourceFlag =
    node.type === 'biomarker'
      ? deriveSourceAbnormality(
          node.attributes?.flaggedOutOfRange === true,
          latest ? latest.value : null,
          latest ? latest.referenceLow : null,
          latest ? latest.referenceHigh : null,
        )
      : undefined;
  return {
    id: node.nodeKey,
    userId: 'demo',
    type: node.type,
    canonicalKey: node.canonicalKey,
    displayName: node.displayName,
    attributes: node.attributes ?? {},
    confidence: 1,
    promoted: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    tier: tierFromDegree(degree),
    score: maxDegree === 0 ? 0 : degree / maxDegree,
    // Derived change ring/badge (absent on nodes with no readings — keeps the
    // wire shape byte-identical to the live record route for undecorated nodes).
    ...(change ? { change } : {}),
    // Consumer interpretation (additive; authed path never sets it).
    ...(interpretation ? { interpretation } : {}),
    // Source's own out-of-range flag (additive; authed map path never sets it).
    ...(sourceFlag ? { sourceFlag } : {}),
    // Earliest-evidence date for the time scrubber (plan 2026-06-15-001).
    ...(node.firstSeenAt ? { firstSeenAt: node.firstSeenAt } : {}),
  };
}

function edgeToWire(edge: DemoEdge, timestamp: string): GraphEdgeWire {
  // Edge ids must be deterministic so re-renders don't churn React keys.
  const id = `${edge.fromNodeKey}__${edge.type}__${edge.toNodeKey}`;
  return {
    id,
    userId: 'demo',
    type: edge.type as EdgeType,
    fromNodeId: edge.fromNodeKey,
    toNodeId: edge.toNodeKey,
    fromChunkId: edge.fromChunkKey ?? null,
    fromDocumentId: edge.fromSourceKey ?? null,
    weight: 1,
    metadata: {},
    createdAt: timestamp,
  };
}

/**
 * Transform a demo fixture into the wire shape expected by the canvas
 * + a per-node provenance lookup for the NodeDetailSheet.
 *
 * Pure, deterministic, no `Date.now()` / `Math.random()`. Calling twice
 * on the same input yields byte-identical output.
 */
export function adaptDemoFixture(fixture: DemoRecordFixture): AdaptedDemoFixture {
  const timestamp = fixtureTimestamp(fixture);
  const degree = computeDegree(fixture);
  const maxDegree = Math.max(0, ...Array.from(degree.values()));

  const nodes: GraphNodeWire[] = fixture.nodes.map((n) =>
    nodeToWire(n, degree.get(n.nodeKey) ?? 0, maxDegree, timestamp),
  );
  const edges: GraphEdgeWire[] = fixture.edges.map((e) => edgeToWire(e, timestamp));

  // Provenance lookup: for each node, the chunks + sources that ground
  // any of its incoming/outgoing edges. NodeDetailSheet renders these
  // verbatim without calling /api/graph/nodes/:id/provenance.
  const sourcesByKey = new Map(fixture.sources.map((s) => [s.sourceKey, s]));
  const chunksByKey = new Map<string, { chunk: DemoSourceChunk; source: DemoSource }>();
  for (const source of fixture.sources) {
    for (const chunk of source.chunks) {
      chunksByKey.set(chunk.chunkKey, { chunk, source });
    }
  }

  const provenanceByNodeId = new Map<string, DemoNodeProvenance>();
  for (const node of nodes) {
    const seenChunks = new Set<string>();
    const seenSources = new Set<string>();
    const chunks: DemoSourceChunk[] = [];
    const sources: DemoSource[] = [];

    for (const edge of fixture.edges) {
      if (edge.fromNodeKey !== node.id && edge.toNodeKey !== node.id) continue;
      if (edge.fromChunkKey && !seenChunks.has(edge.fromChunkKey)) {
        const entry = chunksByKey.get(edge.fromChunkKey);
        if (entry) {
          chunks.push(entry.chunk);
          seenChunks.add(edge.fromChunkKey);
          if (!seenSources.has(entry.source.sourceKey)) {
            sources.push(entry.source);
            seenSources.add(entry.source.sourceKey);
          }
        }
      }
      if (edge.fromSourceKey && !seenSources.has(edge.fromSourceKey)) {
        const source = sourcesByKey.get(edge.fromSourceKey);
        if (source) {
          sources.push(source);
          seenSources.add(edge.fromSourceKey);
        }
      }
    }

    // Evidence grade = the strongest source grounding this node (plan
    // 2026-06-16-002 R9). No grounding sources → inferred. Set BEFORE the
    // provenance entry so the stored node already carries the grade (no reliance
    // on later in-place mutation). The authed path never sets this field.
    node.evidenceGrade = evidenceGrade(sources.map((s) => s.kind));
    provenanceByNodeId.set(node.id, { node, chunks, sources });
  }

  // Source → SourceView lookup (plan 2026-06-17-002). The nodes a source grounds
  // are the INVERSE of provenanceByNodeId (a node is grounded by every source in
  // its provenance), so source-detail and node-detail can never disagree about
  // grounding. Shaped by the same pure `buildSourceView` the authed source page
  // uses, so both surfaces present a source identically.
  const groundedBySource = new Map<string, string[]>();
  for (const prov of Array.from(provenanceByNodeId.values())) {
    for (const source of prov.sources) {
      const arr = groundedBySource.get(source.sourceKey) ?? [];
      arr.push(prov.node.id);
      groundedBySource.set(source.sourceKey, arr);
    }
  }
  const nodeRows = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    displayName: n.displayName,
    canonicalKey: n.canonicalKey,
  }));
  const sourceViewByKey = new Map<string, SourceView>();
  for (const source of fixture.sources) {
    const groundedIds = groundedBySource.get(source.sourceKey) ?? [];
    const capturedAt = new Date(source.capturedAt);
    sourceViewByKey.set(
      source.sourceKey,
      buildSourceView({
        id: source.sourceKey,
        kind: source.kind,
        sourceRef: source.sourceRef,
        capturedAt,
        // DemoSource has no separate createdAt — capturedAt is the only moment.
        createdAt: capturedAt,
        chunks: source.chunks.map((c) => ({
          id: c.chunkKey,
          index: c.index,
          text: c.text,
          pageNumber: c.pageNumber,
        })),
        edges: groundedIds.map((id) => ({ toNodeId: id })),
        nodes: nodeRows,
      }),
    );
  }

  const nodeTypeCounts: Record<string, number> = {};
  for (const n of nodes) {
    nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;
  }

  return {
    graph: {
      nodes,
      edges,
      nodeTypeCounts,
      truncated: false,
      totalNodes: nodes.length,
    },
    provenanceByNodeId,
    sourceViewByKey,
  };
}
