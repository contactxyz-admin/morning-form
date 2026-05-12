'use client';

import { useCallback, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphListEmpty, GraphListView } from '@/components/graph/graph-list-view';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRecordIndex } from '@/lib/hooks/use-record-index';
import type { GraphNodeWire } from '@/types/graph';
import { VaultIndex } from './vault-index';
import { VaultModeToggle, parseVaultMode, type VaultMode } from './vault-mode-toggle';
import type { RecordIndex as RecordIndexData } from '@/lib/record/types';

/**
 * Minimum non-SUPPORTS-edges-per-node ratio before the desktop canvas
 * shows. Matches the previous `/api/graph` page — sparse graphs render as
 * a particle cloud and read worse than the grouped list. Importance scorer
 * at src/lib/graph/importance.ts excludes SUPPORTS edges for the same
 * reason.
 */
const MIN_EDGE_DENSITY = 0.4;

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
 * Density-gated canvas on desktop, grouped list as the read-friendly default
 * everywhere else. SUPPORTS-edges excluded from the density calc because
 * every node has at least one and they don't represent structural
 * centrality.
 */
function VaultMapMode({ data, isDesktop, onNodeClick }: VaultMapModeProps) {
  if (data.nodes.length === 0) return <GraphListEmpty />;

  const nonSupportsEdgeRatio =
    data.edges.filter((e) => e.type !== 'SUPPORTS').length / data.nodes.length;
  const showCanvas = isDesktop && nonSupportsEdgeRatio >= MIN_EDGE_DENSITY;

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

      {showCanvas && (
        <div className="mb-10 rounded-card border border-border bg-surface-warm/40 p-4">
          <GraphCanvas
            nodes={data.nodes}
            edges={data.edges}
            width={720}
            height={480}
            onNodeClick={onNodeClick}
            className="w-full h-auto"
            ariaLabel={`Your health graph — ${data.nodes.length} nodes, ${data.edges.length} edges. Tap any node to see its sources.`}
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
