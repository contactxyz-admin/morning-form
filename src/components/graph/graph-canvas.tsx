'use client';

/**
 * Force-directed graph canvas. SVG-rendered, deterministic layout.
 *
 * Used by /demo/record (fixture data, fixed seed) and — eventually —
 * the authed /graph desktop view. Mobile callers should not render
 * this component; gate via CSS (`hidden md:block`) so SSR stays clean.
 *
 * Zoom + pan (graph-zoom) lives in useGraphState (d3.zoom on a wrapping
 * `.graph-zoom` <g>): wheel zooms anywhere, primary-button drag on the
 * background pans, node-drag still wins on nodes. This component renders the
 * accessible +/- / reset controls over the graph and wires them to the
 * imperative `zoomControls` the hook returns. Desktop-only.
 *
 * Spring drag (Plan 2026-06-08-001 Unit 3) lives in useGraphState: nodes are
 * draggable on motion-enabled desktop (it re-energizes the retained D3 sim);
 * reduced-motion / SSR get no drag. dragstart clears the hover/focus dim by
 * pushing onNodeHover(null) up to the focusedNodeId state below — the dim
 * effect re-derives from there.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import { edgeOpacity } from '@/lib/graph/motion';
import { useGraphState } from './use-graph-state';

export interface GraphCanvasProps {
  readonly nodes: readonly GraphNodeWire[];
  readonly edges: readonly GraphEdgeWire[];
  readonly width?: number;
  readonly height?: number;
  /** Stable seed for deterministic layout. Defaults to a fixture-style constant. */
  readonly seed?: number;
  readonly onNodeClick?: (node: GraphNodeWire) => void;
  readonly className?: string;
  /** Optional accessible label for the SVG root. */
  readonly ariaLabel?: string;
}

const DEFAULT_SEED = 0x4d6f6e64; // 'Mond' — arbitrary but stable.

export function GraphCanvas({
  nodes,
  edges,
  width = 720,
  height = 480,
  seed = DEFAULT_SEED,
  onNodeClick,
  className,
  ariaLabel,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const { neighbourIds, zoomControls } = useGraphState(svgRef, nodes, edges, {
    width,
    height,
    seed,
    onNodeClick,
    onNodeHover: (n) => setFocusedNodeId(n?.id ?? null),
    focusedNodeId,
  });

  // Imperatively dim non-neighbour nodes / edges when a node is
  // focused. We don't re-render the simulation — just toggle classes
  // on the existing DOM. This is the seam pattern: run physics in the
  // hook, do interaction overlays via D3 selection refs.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!focusedNodeId) {
      svg.querySelectorAll('[data-node-id], [data-edge-id]').forEach((el) => {
        (el as SVGElement).style.opacity = '';
      });
      svg.querySelectorAll('.graph-node-label-hover').forEach((el) => {
        (el as SVGTextElement).style.opacity = '';
      });
      return;
    }
    svg.querySelectorAll<SVGGElement>('[data-node-id]').forEach((el) => {
      const id = el.getAttribute('data-node-id') ?? '';
      el.style.opacity = neighbourIds.has(id) ? '1' : '0.2';
      // Surface the hover-only label for the focused node + its
      // neighbours, so the labels only crowd the canvas where they're
      // actually wanted.
      const hoverLabel = el.querySelector<SVGTextElement>('.graph-node-label-hover');
      if (hoverLabel) hoverLabel.style.opacity = neighbourIds.has(id) ? '1' : '0';
    });
    svg.querySelectorAll<SVGElement>('[data-from-id]').forEach((el) => {
      const fromId = el.getAttribute('data-from-id') ?? '';
      const toId = el.getAttribute('data-to-id') ?? '';
      el.style.opacity = edgeOpacity(fromId, toId, neighbourIds);
    });
  }, [focusedNodeId, neighbourIds]);

  const summary = useMemo(
    () => `Health graph — ${nodes.length} nodes, ${edges.length} edges`,
    [nodes.length, edges.length],
  );

  if (nodes.length === 0) return null;

  return (
    // Positioning context for the absolutely-placed zoom controls. The svg
    // keeps the caller's className (sizing/layout) so existing callers render
    // unchanged; the wrapper only provides the overlay anchor.
    <div className={className} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel ?? summary}
        viewBox={`0 0 ${width} ${height}`}
        // Keep the svg's intrinsic aspect ratio from the viewBox (the wrapper
        // div replaces the svg as the className target, so reproduce the old
        // `w-full h-auto` sizing here): full width, height derived from the
        // viewBox ratio. The wrapper div then takes the svg's height.
        style={{ display: 'block', width: '100%', height: 'auto' }}
        onClick={(e) => {
          // Any click that is NOT on a node clears focus — the svg background,
          // an edge <line>, the zoom layer <g>, an empty-space gap, all of it.
          // (The earlier svg-tagName-only guard missed edges and the layer
          // groups.) d3.zoom suppresses the click that follows a pan move
          // (clickDistance), so a genuine background click still clears focus
          // while a pan does not.
          if (!(e.target as Element).closest?.('.graph-node')) {
            setFocusedNodeId(null);
          }
        }}
      />
      <div
        // Zoom controls, overlaid top-right. pointer-events scoped to the
        // buttons so the rest of the overlay never blocks pan/zoom on the svg.
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        <ZoomButton label="Zoom in" onClick={zoomControls.zoomIn}>
          +
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={zoomControls.zoomOut}>
          −
        </ZoomButton>
        <ZoomButton label="Reset zoom" onClick={zoomControls.reset}>
          ⤢
        </ZoomButton>
      </div>
    </div>
  );
}

/**
 * A single accessible zoom-control button. Inline styles (not data-driven
 * Tailwind from src/lib) so the JIT content-glob can't silently drop them.
 */
function ZoomButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      // globals.css zeroes the native focus ring (`:focus-visible{outline:none}`)
      // with no replacement, so keyboard focus would be invisible. Restore the
      // moss focus ring (same shadow-ring-focus pattern as home/page.tsx etc).
      // graph-canvas.tsx is in the Tailwind content glob, so these classes
      // aren't subject to the src/lib data-driven-class drop.
      className="focus-visible:shadow-ring-focus focus-visible:outline-none"
      style={{
        pointerEvents: 'auto',
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(20,20,24,0.72)',
        color: 'rgba(255,255,255,0.86)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {children}
    </button>
  );
}
