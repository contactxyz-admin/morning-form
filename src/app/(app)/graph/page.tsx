'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { GraphListEmpty, GraphListView } from '@/components/graph/graph-list-view';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { GraphNodeWire, GraphResponse } from '@/types/graph';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: GraphResponse };

export default function GraphPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/graph', { cache: 'no-store' });
        if (res.status === 401) {
          if (!cancelled) setState({ status: 'unauth' });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as GraphResponse;
        if (!cancelled) setState({ status: 'ready', data: json });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNodeClick = (node: GraphNodeWire) => {
    // U13d wires the provenance bottom-sheet; until then, log so the click
    // path is exercised end-to-end during browser verification.
    // eslint-disable-next-line no-console
    console.debug('[graph] node click', node.id, node.displayName);
  };

  return (
    <div className="px-5 pt-6 grain-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <SectionLabel>Health Graph</SectionLabel>
        </div>
      </div>

      {/* Title */}
      <div className="rise">
        <h1 className="font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          Your record
        </h1>
        <p className="mt-4 text-body text-text-secondary leading-relaxed max-w-xl">
          Every lab value, symptom, and intervention you&apos;ve captured —
          connected. Tap any node to see where it came from.
        </p>
      </div>

      {/* Meta strip */}
      {state.status === 'ready' && state.data.nodes.length > 0 && (
        <div className="mt-8 flex items-baseline gap-6">
          <div>
            <p className="font-mono text-data text-accent">{state.data.totalNodes}</p>
            <p className="mt-0.5 text-caption text-text-tertiary">Nodes</p>
          </div>
          <div>
            <p className="font-mono text-data text-accent">
              {Object.keys(state.data.nodeTypeCounts).length}
            </p>
            <p className="mt-0.5 text-caption text-text-tertiary">Types</p>
          </div>
          {state.data.truncated && (
            <p className="text-caption text-text-tertiary">
              Showing top {state.data.nodes.length} by importance.
            </p>
          )}
        </div>
      )}

      {/* Body */}
      <div className="mt-10 stagger">
        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-12 text-center">
            <p className="text-caption text-text-tertiary">Loading your graph…</p>
          </Card>
        )}

        {state.status === 'unauth' && (
          <Card variant="paper">
            <p className="text-body text-text-secondary">
              Sign in to view your health graph.
            </p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Couldn&apos;t load the graph right now.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">
              {state.message}
            </p>
          </Card>
        )}

        {state.status === 'ready' && state.data.nodes.length === 0 && <GraphListEmpty />}

        {state.status === 'ready' && state.data.nodes.length > 0 && (
          <>
            {/* Desktop canvas (U13c) will render here behind this flag. */}
            {isDesktop && (
              <Card variant="sunken" className="mb-10 py-8 text-center">
                <p className="font-mono text-label uppercase text-text-tertiary">
                  Desktop canvas · shipping next
                </p>
                <p className="mt-2 text-caption text-text-tertiary">
                  For now, the structured list below reads the same data.
                </p>
              </Card>
            )}
            <GraphListView nodes={state.data.nodes} onNodeClick={handleNodeClick} />
          </>
        )}
      </div>
    </div>
  );
}
