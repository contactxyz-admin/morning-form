/**
 * Pure shaping function for `GET /api/record/source/[id]`.
 *
 * Kept Prisma-free so tests can exercise the surface with synthetic fixtures.
 * The route layer handles auth, ownership, and hydration; this library is
 * responsible only for converting raw rows into the wire shape consumed by
 * the source-detail page.
 *
 * Also the canonical home of `KIND_LABELS` — the single source of truth for
 * source-document display labels across every surface (source-card, source
 * detail route, vault-layout canvas hub nodes, node-detail-sheet provenance
 * lists). Pre-consolidation the project had three competing maps with
 * conflicting labels for the same kind ("Lab pdf" vs "Lab report" vs "Lab
 * result"); the cleanup queued by the PR #120 ce:review unifies them here.
 */
import { decodeSourceDocumentKind, type SourceDocumentKind } from '@/lib/graph/types';
import type { GraphNodeWire } from '@/types/graph';

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
  /**
   * Optional "what changed" decoration + interpretation for a grounded marker
   * (plan 2026-06-17-003). The demo carries these from the fixture-derived wire
   * node; the authed source route derives them from the latest-panel diff. Absent
   * → the grounded-marker row renders name-only (graceful).
   */
  change?: GraphNodeWire['change'];
  interpretation?: GraphNodeWire['interpretation'];
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
  /** Canonical key — the drill-down target (`/record?mode=map&entity=<key>`). */
  canonicalKey: string;
  /** Optional grounded-marker decoration (plan 2026-06-17-003); see node row. */
  change?: GraphNodeWire['change'];
  interpretation?: GraphNodeWire['interpretation'];
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

/**
 * Single source of truth for source-document display labels.
 *
 * Exhaustive over `SOURCE_DOCUMENT_KINDS` (the enum in `lib/graph/types.ts`),
 * so adding a new kind to the enum without a corresponding label here is a
 * compile error rather than a silent fallback. Label choices:
 *   - `lab_pdf` / `intake_text` keep their existing source-view labels
 *     ("Lab report", "Intake notes") to avoid regressing the most-trafficked
 *     surfaces (source-card, source-detail route).
 *   - All other kinds lifted from the previous `DOC_KIND_LABELS` map in
 *     `node-detail-sheet.tsx`, which was already curated for those rows.
 *   - The pre-consolidation `KIND_LABELS` had two stale entries (`gp_export`,
 *     `wearable`) that aren't in the enum — dropped.
 */
const KIND_LABELS: Record<SourceDocumentKind, string> = {
  lab_pdf: 'Lab report',
  gp_record: 'GP record',
  intake_text: 'Intake notes',
  wearable_window: 'Wearable',
  checkin: 'Check-in',
  protocol: 'Protocol',
  gp_letter: 'GP letter',
  discharge_summary: 'Discharge summary',
  referral_letter: 'Referral letter',
  specialist_letter: 'Specialist letter',
  imaging_report: 'Imaging report',
  pathology_report: 'Pathology report',
  at_home_test_result: 'At-home test',
  microbiome_panel: 'Microbiome panel',
  stool_panel: 'Stool panel',
  genetics_report: 'Genetics report',
  body_composition_scan: 'Body composition scan',
  dexa_scan: 'DEXA scan',
  longevity_panel: 'Longevity panel',
  private_lab_panel: 'Private lab panel',
};

/**
 * Human label for a source-document `kind`. Accepts a bare string (the DB
 * column type) and falls back to a snake_case-stripped form for legacy /
 * unknown kinds so old data doesn't crash the UI.
 */
export function kindLabel(kind: string): string {
  const decoded = decodeSourceDocumentKind(kind);
  if (decoded === 'unknown') return kind.replace(/_/g, ' ');
  return KIND_LABELS[decoded];
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
    referencedNodes.push({
      id: n.id,
      type: n.type,
      displayName: n.displayName,
      canonicalKey: n.canonicalKey,
      ...(n.change ? { change: n.change } : {}),
      ...(n.interpretation ? { interpretation: n.interpretation } : {}),
    });
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
