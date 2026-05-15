'use client';

import { useCallback, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphListEmpty, GraphListView } from '@/components/graph/graph-list-view';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRecordIndex } from '@/lib/hooks/use-record-index';
import type { GraphNodeWire } from '@/types/graph';
import { VaultIndex } from './vault-index';
import { VaultModeToggle, parseVaultMode, type VaultMode } from './vault-mode-toggle';
import type { SourceDocumentWire, RecordIndex as RecordIndexData } from '@/lib/record/types';
import type { GraphEdgeWire } from '@/types/graph';

/**
 * Render `kind` (a snake_case enum like `blood_panel`, `clinic_note`) as a
 * single capitalised phrase for use in node display labels.
 */
function humaniseKind(kind: string): string {
  const words = kind.split('_').filter(Boolean);
  if (words.length === 0) return 'Document';
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

/**
 * Synthesise canvas-only `GraphNodeWire`-shaped entries for each source
 * document so each biomarker has a visible "hub" to anchor to. Source
 * docs use the `source_document` NodeType (already mapped to the `data`
 * visual class in src/lib/graph/visual-encoding.ts — soft grey, distinct
 * from the health-data node colours). Source nodes anchor as tier-1
 * hubs: largest radius, always-on label, score above the biomarker
 * ceiling so any future cap keeps them in.
 *
 * Pseudo-nodes do NOT flow through `<GraphListView>` — the list groups
 * by health-data node type and would be noisy with per-document rows.
 * This asymmetry between canvas and list is deliberate.
 */
function synthesizeSourceNodes(
  sources: readonly SourceDocumentWire[],
  userId: string,
  scoreCeiling: number,
): GraphNodeWire[] {
  return sources.map((s) => ({
    id: s.id,
    userId,
    type: 'source_document',
    canonicalKey: s.id,
    displayName: `${humaniseKind(s.kind)} · ${format(new Date(s.capturedAt), 'MMM yyyy')}`,
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
 * Synthesise canvas-only edges from each graph node to the source
 * document(s) that support it. Reads provenance from the existing
 * SUPPORTS edges (which are self-loops carrying the source doc on
 * `fromDocumentId` — see src/lib/graph/mutations.ts:329 for the model)
 * and re-shapes them into a visually-meaningful biomarker→source-doc
 * line. Deduped by `(nodeId, documentId)` so a node supported by
 * multiple chunks of the same document only gets one edge.
 */
function synthesizeSourceEdges(
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

/**
 * Top-level orchestrator for the unified vault surface (the merged
 * `/record` + `/graph` UX from
 * docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md).
 *
 * Owns:
 *  - Data fetch from the unified `/api/record` endpoint
 *  - URL-state for mode (`?mode=index|map`) and selected entity
 *    (`?entity=<canonicalKey>`)
 *  - Switching between <VaultIndex> (index mode) and the
 *    <GraphCanvas>+<GraphListView> pair (map mode)
 *  - Opening the entity detail surface — desktop right rail (U4 follow-up)
 *    or mobile <NodeDetailSheet>
 *
 * URL-state is the bookmarkability primitive — sharing a `/record?entity=`
 * link drops the recipient on the same entity, and the future
 * `/record?mode=map&entity=` shape lets clinician briefs deep-link into
 * exactly the view that grounded a finding.
 */
export function VaultLayout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { state, refresh } = useRecordIndex();
  const [, startTransition] = useTransition();

  const requestedMode = parseVaultMode(searchParams.get('mode'));
  const selectedEntityKey = searchParams.get('entity');

  // Empty-graph guard: when the user has no nodes, map mode renders a list-
  // empty state, but `VaultModeToggle` disables every non-active pill, so a
  // user landing on `/record?mode=map` with an empty graph cannot click back
  // to index without editing the URL. Coerce to index for that case.
  const hasNodes = state.status === 'ready' && state.data.totalNodes > 0;
  const mode: VaultMode = requestedMode === 'map' && !hasNodes ? 'index' : requestedMode;

  const updateUrl = useCallback(
    (next: { mode?: VaultMode; entity?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.mode !== undefined) {
        if (next.mode === 'index') params.delete('mode');
        else params.set('mode', next.mode);
      }
      if (next.entity !== undefined) {
        if (next.entity === null) params.delete('entity');
        else params.set('entity', next.entity);
      }
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `/record?${query}` : '/record');
      });
    },
    [router, searchParams],
  );

  const handleNodeClick = useCallback(
    (node: GraphNodeWire) => {
      // Source-document pseudo-nodes (synthesised client-side for the
      // canvas) aren't in `state.data.nodes`, so opening the detail
      // sheet for them would resolve to null and trigger the deep-link
      // guard to immediately clear the URL — a visible flicker for no
      // outcome. No source-doc detail surface exists yet; ignore the
      // click. (If we add one later, drop this guard and route on type.)
      if (node.type === 'source_document') return;
      updateUrl({ entity: node.canonicalKey });
    },
    [updateUrl],
  );

  const handleSheetClose = useCallback(() => {
    updateUrl({ entity: null });
  }, [updateUrl]);

  const selectedNode =
    state.status === 'ready' && selectedEntityKey
      ? state.data.nodes.find((n) => n.canonicalKey === selectedEntityKey) ?? null
      : null;

  // Deep-link truncation guard (ce:review C3): if the URL references an
  // entity that isn't present in the importance-capped node set (likely
  // dropped by the 200-node cap when totalNodes > 200, or a stale link),
  // clear the param so the URL truthfully reflects what's selected. Avoids
  // a silent no-op where the URL claims an entity is open but the sheet is
  // closed.
  useEffect(() => {
    if (state.status === 'ready' && selectedEntityKey && !selectedNode) {
      updateUrl({ entity: null });
    }
  }, [state.status, selectedEntityKey, selectedNode, updateUrl]);

  return (
    <div className="min-h-screen bg-record-grid">
      <div className="px-5 sm:px-8 pt-6 pb-32 grain-page">
        {/* Header — mode toggle + secondary actions */}
        <div className="flex items-center justify-between gap-3 mb-10">
          <VaultModeToggle
            active={mode}
            onChange={(m) => updateUrl({ mode: m })}
            disabled={state.status === 'ready' && state.data.totalNodes === 0}
          />
          <Link
            href="/settings/shared-links"
            className="text-caption text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            Shared links →
          </Link>
        </div>

        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-16 text-center">
            <p className="font-display font-light text-heading text-text-primary">
              Opening your record…
            </p>
          </Card>
        )}

        {state.status === 'unauth' && (
          <Card variant="paper">
            <p className="text-body text-text-secondary">Sign in to view your record.</p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Something went wrong loading your record.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">{state.message}</p>
          </Card>
        )}

        {state.status === 'ready' && mode === 'index' && (
          <VaultIndex data={state.data} onDocumentsAdded={refresh} />
        )}

        {state.status === 'ready' && mode === 'map' && (
          <VaultMapMode
            data={state.data}
            isDesktop={isDesktop}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {/*
        Mobile entity detail surface. Desktop right-rail panel lands in U4 of
        the vault-unification plan; for now both viewports use the existing
        bottom sheet so the URL-state plumbing is verifiable end-to-end.
      */}
      <NodeDetailSheet node={selectedNode} onClose={handleSheetClose} />
    </div>
  );
}

interface VaultMapModeProps {
  data: RecordIndexData;
  isDesktop: boolean;
  onNodeClick: (node: GraphNodeWire) => void;
}

/**
 * Map-mode body — extracted block from the previous `/api/graph` page.
 * Desktop renders the force-directed canvas at any density; mobile shows
 * the grouped list only (the SVG labels become illegible at phone width
 * and the list is the more useful read on a small screen anyway).
 *
 * The canvas receives synthesised source-document pseudo-nodes alongside
 * real graph nodes so the SUPPORTS edges find visible targets; the list
 * view is intentionally kept health-data-only.
 */
function VaultMapMode({ data, isDesktop, onNodeClick }: VaultMapModeProps) {
  if (data.nodes.length === 0) return <GraphListEmpty />;

  // Borrow the userId from a real graph node — every node in `data.nodes`
  // belongs to the current user (R/W is server-scoped by session) so
  // either of them is the same answer. The early-return above guarantees
  // at least one exists.
  const userId = data.nodes[0].userId;
  const scoreCeiling = data.nodes.reduce((max, n) => Math.max(max, n.score), 0);
  const sourceNodes = synthesizeSourceNodes(data.sources, userId, scoreCeiling);
  const canvasNodes: GraphNodeWire[] = [...data.nodes, ...sourceNodes];

  // Synthesise visible biomarker → source-doc edges from the existing
  // self-SUPPORTS edges' `fromDocumentId` provenance. Without this the
  // source-doc pseudo-nodes would appear as disconnected islands.
  const graphNodeIds = new Set(data.nodes.map((n) => n.id));
  const sourceIds = new Set(sourceNodes.map((n) => n.id));
  const canvasEdges: GraphEdgeWire[] = [
    ...data.edges,
    ...synthesizeSourceEdges(data.edges, graphNodeIds, sourceIds),
  ];

  return (
    <>
      {/* Meta strip */}
      <div className="mb-8 flex items-baseline gap-6">
        <div>
          <p className="font-mono text-data text-accent">{data.totalNodes}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">Nodes</p>
        </div>
        <div>
          <p className="font-mono text-data text-accent">
            {Object.keys(data.nodeTypeCounts).length}
          </p>
          <p className="mt-0.5 text-caption text-text-tertiary">Types</p>
        </div>
        {data.truncated && (
          <p className="text-caption text-text-tertiary">
            Showing top {data.nodes.length} by importance.
          </p>
        )}
      </div>

      {isDesktop && (
        <div className="mb-10 rounded-card border border-border bg-surface-warm/40 p-4">
          <p className="mb-3 italic text-caption text-text-tertiary">
            Your health graph evolves as you add data.
          </p>
          <GraphCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            width={720}
            height={480}
            onNodeClick={onNodeClick}
            className="w-full h-auto"
            ariaLabel={`Your health graph — ${canvasNodes.length} nodes, ${canvasEdges.length} edges. Tap any node to see its sources.`}
          />
          <p className="mt-3 text-caption text-text-tertiary">
            Tap a node to see what grounds it. The structured list below shows the same data, grouped.
          </p>
        </div>
      )}
      <GraphListView nodes={data.nodes} onNodeClick={onNodeClick} />
    </>
  );
}
