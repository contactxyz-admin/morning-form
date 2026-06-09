'use client';

/**
 * Force-directed graph canvas. SVG-rendered, deterministic layout.
 *
 * Used by /demo/record (fixture data, fixed seed) and — eventually —
 * the authed /graph desktop view. Mobile callers should not render
 * this component; gate via CSS (`hidden md:block`) so SSR stays clean.
 *
 * No zoom/pan. Spring drag (Plan 2026-06-08-001 Unit 3) lives in
 * useGraphState: nodes are draggable on motion-enabled desktop (it
 * re-energizes the retained D3 sim); reduced-motion / SSR get no drag.
 * dragstart clears the hover/focus dim by pushing onNodeHover(null) up to
 * the focusedNodeId state below — the dim effect re-derives from there.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
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

  const { neighbourIds } = useGraphState(svgRef, nodes, edges, {
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
      el.style.opacity = neighbourIds.has(fromId) && neighbourIds.has(toId) ? '1' : '0.15';
    });
  }, [focusedNodeId, neighbourIds]);

  const summary = useMemo(
    () => `Health graph — ${nodes.length} nodes, ${edges.length} edges`,
    [nodes.length, edges.length],
  );

  if (nodes.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={ariaLabel ?? summary}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      onClick={(e) => {
        // Tap on the SVG background (not a node) clears focus.
        if ((e.target as Element).tagName === 'svg') setFocusedNodeId(null);
      }}
    />
  );
}
