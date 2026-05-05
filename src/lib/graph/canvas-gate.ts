/**
 * Density-based gating for the force-directed graph canvas.
 *
 * The canvas only earns its complexity when there are enough relational
 * edges to read as a graph. With too few non-provenance edges the
 * layout degrades to a particle cloud — the existing list view reads
 * better in that regime. This module is the single source of truth for
 * the gate; consumers (authed `/graph`, future demo callers) import
 * `shouldShowCanvas` instead of inlining the predicate.
 *
 * `SUPPORTS` edges are excluded from the density calculation: every
 * node has at least one to its source document, so they're provenance
 * plumbing rather than relational signal. The importance scorer at
 * `src/lib/graph/importance.ts` excludes them for the same reason.
 */

import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';

/**
 * Minimum non-SUPPORTS-edges-per-node ratio before the desktop canvas
 * is worth rendering. Empirically: below this floor, a force-directed
 * layout reads as a particle cloud rather than a graph.
 */
export const MIN_EDGE_DENSITY = 0.4;

/**
 * Whether an edge counts toward the relational-density signal.
 * Returns false for `SUPPORTS` (provenance-only) edges.
 */
export function isRelationalEdge(edge: Pick<GraphEdgeWire, 'type'>): boolean {
  return edge.type !== 'SUPPORTS';
}

/**
 * Whether the desktop canvas should render given the data + viewport.
 * Three conditions, all required:
 *  - desktop viewport (canvas hides on mobile)
 *  - at least one node (no empty canvas)
 *  - relational-edge density at or above MIN_EDGE_DENSITY
 */
export function shouldShowCanvas(
  nodes: readonly GraphNodeWire[],
  edges: readonly GraphEdgeWire[],
  isDesktop: boolean,
): boolean {
  if (!isDesktop) return false;
  if (nodes.length === 0) return false;
  const relational = edges.filter(isRelationalEdge).length;
  return relational / nodes.length >= MIN_EDGE_DENSITY;
}
