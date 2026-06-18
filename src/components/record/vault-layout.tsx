'use client';

import { useCallback, useEffect, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphFilterLegend, useCategoryFilter } from '@/components/graph/graph-filter-legend';
import { GraphListEmpty, GraphListView } from '@/components/graph/graph-list-view';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRecordIndex } from '@/lib/hooks/use-record-index';
import {
  referencedSourceDocumentIds,
  synthesizeSourceEdges,
  synthesizeSourceNodes,
} from '@/lib/record/canvas-synthesis';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import type { NodeVisualClass } from '@/lib/graph/visual-encoding';
import { VaultIndex } from './vault-index';
import { VaultModeToggle, parseVaultMode, type VaultMode } from './vault-mode-toggle';
import type { RecordIndex as RecordIndexData } from '@/lib/record/types';

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
  // Category filter lives HERE (not in VaultMapMode) so the parent that owns the
  // `?entity=` selection can close the sheet when the selected node's class is
  // filtered off (plan 2026-06-17-003 U4 — mirrors the demo guard; resolves the
  // prior ponytail). Passed down to VaultMapMode for the legend + canvas.
  const {
    hiddenClasses,
    toggle: toggleClass,
    reset: resetClasses,
    nodeGhosted,
  } = useCategoryFilter();

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
      // canvas) aren't in `state.data.nodes`, so the entity sheet can't
      // serve them — but they carry the real SourceDocument id
      // (canvas-synthesis sets id = canonicalKey = document id), and
      // /record/source/[id] is a real surface. Route there.
      if (node.type === 'source_document') {
        router.push(`/record/source/${encodeURIComponent(node.id)}`);
        return;
      }
      updateUrl({ entity: node.canonicalKey });
    },
    [router, updateUrl],
  );

  const handleSheetClose = useCallback(() => {
    updateUrl({ entity: null });
  }, [updateUrl]);

  const selectedNode =
    state.status === 'ready' && selectedEntityKey
      ? state.data.nodes.find((n) => n.canonicalKey === selectedEntityKey) ?? null
      : null;

  // ponytail: unlike the demo, there's no "selected node's class filtered off →
  // clear ?entity=" guard here (the filter state lives in VaultMapMode, not this
  // parent). Low impact — the canvas blurs focus before aria-hiding, so it's not
  // a focused-element WCAG violation, just a stale open sheet. Lift
  // useCategoryFilter to VaultLayout to add the guard if it bites.
  //
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

  // Filtered-while-selected guard (plan 2026-06-17-003 U4): if the open entity's
  // visual class is switched off, close the sheet so a ghosted node isn't left
  // described by an open surface (mirrors the demo). selectedNode is always a
  // health node here (source clicks navigate to the source page).
  useEffect(() => {
    if (selectedNode && nodeGhosted(selectedNode)) updateUrl({ entity: null });
  }, [selectedNode, nodeGhosted, updateUrl]);

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
            selectedNodeId={selectedNode?.id ?? null}
            hiddenClasses={hiddenClasses}
            onToggleClass={toggleClass}
            onResetClasses={resetClasses}
            nodeGhosted={nodeGhosted}
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
  /** Node id of the open `?entity=` selection — drives the canvas halo. */
  selectedNodeId: string | null;
  /** Category filter, owned by the parent (see VaultLayout) so it can guard the selection. */
  hiddenClasses: ReadonlySet<NodeVisualClass>;
  onToggleClass: (visualClass: NodeVisualClass) => void;
  onResetClasses: () => void;
  nodeGhosted: (node: GraphNodeWire) => boolean;
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
function VaultMapMode({
  data,
  isDesktop,
  onNodeClick,
  selectedNodeId,
  hiddenClasses,
  onToggleClass,
  onResetClasses,
  nodeGhosted,
}: VaultMapModeProps) {
  // Memoize the canvas node/edge arrays on their content. Built inline they
  // are fresh refs every render, which churns useGraphState's initGraph
  // identity → full teardown+reinit (possibly mid-drag) + spurious
  // re-animations. Matches src/components/demo/demo-graph-section.tsx.
  // NOTE: these hooks run before the empty-graph early return below, so the
  // hook order stays stable (rules-of-hooks); they no-op on empty data.
  const canvasNodes = useMemo<GraphNodeWire[]>(() => {
    if (data.nodes.length === 0) return [];
    // Borrow the userId from a real graph node — every node in `data.nodes`
    // belongs to the current user (R/W is server-scoped by session) so
    // either of them is the same answer.
    const userId = data.nodes[0].userId;
    const scoreCeiling = data.nodes.reduce((max, n) => Math.max(max, n.score), 0);

    // Filter source documents to those actually referenced by surviving
    // edges. The importance cap upstream can drop nodes whose only
    // supporting provenance pointed at a given document — without this
    // filter, the source-doc hub would render as a floating tier-1 island
    // with no edges (PR #120 ce:review C1).
    // `data.sources ?? []` also defends against the Vercel deploy-skew
    // window where a fresh client lands against a pre-deploy response.
    const referencedDocIds = referencedSourceDocumentIds(data.edges);
    const visibleSources = (data.sources ?? []).filter((s) => referencedDocIds.has(s.id));
    const sourceNodes = synthesizeSourceNodes(visibleSources, userId, scoreCeiling);
    return [...data.nodes, ...sourceNodes];
  }, [data.nodes, data.edges, data.sources]);

  const canvasEdges = useMemo<GraphEdgeWire[]>(() => {
    if (data.nodes.length === 0) return [];
    // Synthesise visible biomarker → source-doc edges from the existing
    // self-SUPPORTS edges' `fromDocumentId` provenance. The real
    // SUPPORTS edges are filtered out of the canvas-side spread because
    // they're self-loops (fromNodeId === toNodeId — see
    // src/lib/graph/mutations.ts) and D3 renders them as degenerate
    // zero-length lines that also inflate the aria-label edge count.
    // The synthesised biomarker → source-doc edges cover the same
    // provenance signal, visibly.
    const graphNodeIds = new Set(data.nodes.map((n) => n.id));
    const sourceIds = new Set(
      canvasNodes.filter((n) => n.type === 'source_document').map((n) => n.id),
    );
    return [
      ...data.edges.filter((e) => e.type !== 'SUPPORTS'),
      ...synthesizeSourceEdges(data.edges, graphNodeIds, sourceIds),
    ];
  }, [data.nodes, data.edges, canvasNodes]);

  if (data.nodes.length === 0) return <GraphListEmpty />;

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
            selectedNodeId={selectedNodeId}
            nodeGhosted={nodeGhosted}
            className="w-full h-auto"
            ariaLabel={`Your health graph — ${canvasNodes.length} nodes, ${canvasEdges.length} edges. Tap any node to see its sources.`}
          />
          <p className="mt-3 text-caption text-text-tertiary">
            Tap a node to see what grounds it. The structured list below shows the same data, grouped.
          </p>
          <GraphFilterLegend
            hiddenClasses={hiddenClasses}
            onToggle={onToggleClass}
            onReset={onResetClasses}
            className="mt-4"
          />
        </div>
      )}
      <GraphListView nodes={data.nodes} onNodeClick={onNodeClick} />
    </>
  );
}
