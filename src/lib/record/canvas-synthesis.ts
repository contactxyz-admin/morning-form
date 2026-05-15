/**
 * Canvas-only synthesis helpers for `/record?mode=map`.
 *
 * The MCP / API wire types only contain health-data nodes (biomarkers,
 * symptoms, conditions, etc.) and the per-edge `fromDocumentId`
 * provenance metadata. The force-directed canvas wants to show source
 * documents as visible hub-and-spoke targets. These helpers re-shape
 * the wire data into a canvas-friendly view without touching the wire
 * (or `<GraphListView>`, which intentionally stays health-data-only).
 *
 * Kept Prisma-free and React-free so the dedup / shape / fallback logic
 * can be unit-tested with synthetic fixtures.
 */
import { format } from 'date-fns';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import type { SourceDocumentWire } from './types';
import { kindLabel } from './source-view';

/**
 * Synthesise canvas-only `GraphNodeWire`-shaped entries for each source
 * document so each biomarker has a visible "hub" to anchor to. Source
 * docs use the `source_document` `NodeType` (already mapped to the
 * `data` visual class in `lib/graph/visual-encoding.ts` — soft grey,
 * distinct from the health-data node colours). Source nodes anchor as
 * tier-1 hubs: largest radius, always-on label, score above the
 * biomarker ceiling so any future cap keeps them in.
 *
 * Pseudo-nodes do NOT flow through `<GraphListView>` — the list groups
 * by health-data node type and would be noisy with per-document rows.
 * This asymmetry between canvas and list is deliberate.
 */
export function synthesizeSourceNodes(
  sources: readonly SourceDocumentWire[],
  userId: string,
  scoreCeiling: number,
): GraphNodeWire[] {
  return sources.map((s) => ({
    id: s.id,
    userId,
    type: 'source_document',
    canonicalKey: s.id,
    displayName: `${kindLabel(s.kind)} · ${format(new Date(s.capturedAt), 'MMM yyyy')}`,
    attributes: {},
    confidence: 1,
    promoted: false,
    createdAt: s.createdAt,
    updatedAt: s.capturedAt,
    tier: 1,
    score: scoreCeiling + 1,
  }));
}

/**
 * Set of source-document ids referenced by any edge's `fromDocumentId`
 * provenance. Use this to filter `data.sources` to only those that
 * actually appear in the surviving (importance-capped) graph — without
 * this filter, an importance cap that drops the only node supported by
 * a given document leaves the source-doc hub as a floating island on
 * the canvas. (PR #120 ce:review finding C1.)
 */
export function referencedSourceDocumentIds(
  edges: readonly GraphEdgeWire[],
): Set<string> {
  const referenced = new Set<string>();
  for (const e of edges) {
    if (e.fromDocumentId) referenced.add(e.fromDocumentId);
  }
  return referenced;
}

/**
 * Synthesise canvas-only edges from each graph node to the source
 * document(s) that support it. Reads provenance from the existing
 * SUPPORTS edges (which are self-loops carrying the source doc on
 * `fromDocumentId` — see `lib/graph/mutations.ts:329` for the model)
 * and re-shapes them into a visually-meaningful biomarker→source-doc
 * line. Deduped by `(nodeId, documentId)` so a node supported by
 * multiple chunks of the same document only gets one edge.
 *
 * Inputs are filtered against `graphNodeIds` and `sourceIds` so a
 * dangling provenance reference (target node truncated by the
 * importance cap, source document filtered out elsewhere) cannot
 * produce a synthesised edge pointing at a missing node.
 */
export function synthesizeSourceEdges(
  edges: readonly GraphEdgeWire[],
  graphNodeIds: ReadonlySet<string>,
  sourceIds: ReadonlySet<string>,
): GraphEdgeWire[] {
  const seen = new Set<string>();
  const synthesized: GraphEdgeWire[] = [];
  for (const e of edges) {
    if (!e.fromDocumentId) continue;
    if (!sourceIds.has(e.fromDocumentId)) continue;
    if (!graphNodeIds.has(e.toNodeId)) continue;
    const key = `${e.toNodeId}::${e.fromDocumentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    synthesized.push({
      id: `synth-supports-${key}`,
      userId: e.userId,
      type: 'SUPPORTS',
      fromNodeId: e.toNodeId,
      toNodeId: e.fromDocumentId,
      fromChunkId: null,
      fromDocumentId: e.fromDocumentId,
      weight: 1,
      metadata: {},
      createdAt: e.createdAt,
    });
  }
  return synthesized;
}
