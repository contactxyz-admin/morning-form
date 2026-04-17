/**
 * Pure shaping function for `GET /api/record/source/[id]`.
 *
 * Kept Prisma-free so tests can exercise the surface with synthetic fixtures.
 * The route layer handles auth, ownership, and hydration; this library is
 * responsible only for converting raw rows into the wire shape consumed by
 * the source-detail page.
 */

export interface SourceViewChunkRow {
  id: string;
  index: number;
  text: string;
  pageNumber: number | null;
}

export interface SourceViewEdgeRow {
  toNodeId: string;
}

export interface SourceViewNodeRow {
  id: string;
  type: string;
  displayName: string;
  canonicalKey: string;
}

export interface SourceViewInput {
  id: string;
  kind: string;
  sourceRef: string | null;
  capturedAt: Date;
  createdAt: Date;
  chunks: SourceViewChunkRow[];
  edges: SourceViewEdgeRow[];
  nodes: SourceViewNodeRow[];
}

export interface SourceViewChunk {
  id: string;
  index: number;
  text: string;
  pageNumber: number | null;
}

export interface SourceViewReferencedNode {
  id: string;
  type: string;
  displayName: string;
}

export interface SourceView {
  id: string;
  kind: string;
  kindLabel: string;
  displayTitle: string;
  sourceRef: string | null;
  capturedAt: string;
  createdAt: string;
  chunks: SourceViewChunk[];
  referencedNodes: SourceViewReferencedNode[];
}

const KIND_LABELS: Record<string, string> = {
  lab_pdf: 'Lab report',
  intake_text: 'Intake notes',
  gp_export: 'GP export',
  wearable: 'Wearable metrics',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

function deriveDisplayTitle(input: Pick<SourceViewInput, 'kind' | 'sourceRef' | 'capturedAt'>): string {
  if (input.sourceRef && input.sourceRef.trim().length > 0) return input.sourceRef.trim();
  const date = new Date(input.capturedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${kindLabel(input.kind)} — ${date}`;
}

export function buildSourceView(input: SourceViewInput): SourceView {
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const referencedIds = Array.from(new Set(input.edges.map((e) => e.toNodeId)));

  const referencedNodes: SourceViewReferencedNode[] = [];
  for (const id of referencedIds) {
    const n = nodeById.get(id);
    if (!n) continue;
    referencedNodes.push({ id: n.id, type: n.type, displayName: n.displayName });
  }
  referencedNodes.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const chunks: SourceViewChunk[] = [...input.chunks]
    .sort((a, b) => a.index - b.index)
    .map((c) => ({ id: c.id, index: c.index, text: c.text, pageNumber: c.pageNumber }));

  return {
    id: input.id,
    kind: input.kind,
    kindLabel: kindLabel(input.kind),
    displayTitle: deriveDisplayTitle(input),
    sourceRef: input.sourceRef,
    capturedAt: input.capturedAt.toISOString(),
    createdAt: input.createdAt.toISOString(),
    chunks,
    referencedNodes,
  };
}
