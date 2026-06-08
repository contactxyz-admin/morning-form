'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { animate } from 'framer-motion';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import { makeRng } from '../../../prisma/fixtures/synthetic/generators';
import { radiusForTier, visualForEdge, visualForNode } from '@/lib/graph/visual-encoding';
import { smooth, entranceFrame, type MotionPoint } from '@/lib/graph/motion';

/** Entrance duration in seconds. */
const ENTRANCE_DURATION_S = 0.7;

/**
 * Force-directed graph hook. Modeled on seam's `useGraphState` (see
 * /Users/reubenselby/Developer/seam/app/src/components/features/graph/useGraphState.ts)
 * trimmed for our v1 needs:
 *
 *   - Deterministic layout via a Mulberry32-seeded RNG (initial node
 *     positions + simulation jitter). Same seed → byte-identical
 *     positions across reloads.
 *   - Pre-warm via 80 simulation ticks before mount, so first paint
 *     shows a settled layout (no jitter, no flicker).
 *   - StrictMode-safe via refs that guard the simulation lifecycle.
 *   - 1-hop neighbour computation for the U6 hover/focus interaction.
 *
 * No zoom/pan, no drag, no contextmenu, no progress overlay, no
 * cluster carry-forward — those are seam-specific and we don't need
 * them on the demo.
 */

export interface SimulationNode extends GraphNodeWire {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface SimulationEdge {
  id: string;
  source: SimulationNode;
  target: SimulationNode;
  type: GraphEdgeWire['type'];
}

export interface UseGraphStateOptions {
  readonly width: number;
  readonly height: number;
  /** Stable seed for deterministic layout. */
  readonly seed: number;
  readonly onNodeClick?: (node: GraphNodeWire) => void;
  readonly onNodeHover?: (node: GraphNodeWire | null) => void;
  /** Currently focused node id; non-neighbours dim. */
  readonly focusedNodeId?: string | null;
}

export interface UseGraphStateReturn {
  /** 1-hop neighbour set including the focused node itself. */
  readonly neighbourIds: ReadonlySet<string>;
}

export function useGraphState(
  svgRef: React.RefObject<SVGSVGElement | null>,
  nodes: readonly GraphNodeWire[],
  edges: readonly GraphEdgeWire[],
  options: UseGraphStateOptions,
): UseGraphStateReturn {
  const simulationRef = useRef<d3.Simulation<SimulationNode, SimulationEdge> | null>(null);
  const simNodesRef = useRef<SimulationNode[]>([]);
  const simEdgesRef = useRef<SimulationEdge[]>([]);
  const animateRef = useRef<ReturnType<typeof animate> | null>(null);

  // Volatile callback refs — must not retrigger the simulation.
  const onNodeClickRef = useRef(options.onNodeClick);
  const onNodeHoverRef = useRef(options.onNodeHover);
  useEffect(() => {
    onNodeClickRef.current = options.onNodeClick;
    onNodeHoverRef.current = options.onNodeHover;
  });

  // Stable signature so React re-runs initGraph only when the data
  // actually changes shape, not on every parent re-render.
  const dataSignature = useMemo(() => {
    const n = nodes
      .map((x) => `${x.id}:${x.tier}:${x.score.toFixed(3)}`)
      .sort()
      .join('|');
    const e = edges
      .map((x) => `${x.id}:${x.type}`)
      .sort()
      .join('|');
    return `${n};${e}`;
  }, [nodes, edges]);

  const initGraph = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || nodes.length === 0) return;

    const { width, height, seed } = options;
    const rng = makeRng(seed);

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Defs for the directional arrow marker (used by causation edges).
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'graph-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('class', 'fill-text-secondary/70');

    // Seeded initial positions — drift from centre by ±200px per axis.
    const simNodes: SimulationNode[] = nodes.map((node) => ({
      ...node,
      x: width / 2 + (rng() - 0.5) * width * 0.5,
      y: height / 2 + (rng() - 0.5) * height * 0.5,
    }));
    simNodesRef.current = simNodes;

    const simEdges: SimulationEdge[] = edges
      .map((edge) => {
        const source = simNodes.find((n) => n.id === edge.fromNodeId);
        const target = simNodes.find((n) => n.id === edge.toNodeId);
        if (!source || !target) return null;
        return { id: edge.id, source, target, type: edge.type };
      })
      .filter((e): e is SimulationEdge => e !== null);
    simEdgesRef.current = simEdges;

    const linkForce = d3
      .forceLink<SimulationNode, SimulationEdge>(simEdges)
      .id((d) => d.id)
      .distance(70)
      .strength(0.6);

    const simulation = d3
      .forceSimulation<SimulationNode, SimulationEdge>(simNodes)
      .force('link', linkForce)
      .force('charge', d3.forceManyBody<SimulationNode>().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
      .force(
        'collide',
        d3.forceCollide<SimulationNode>().radius((d) => radiusForTier(d.tier) + 4),
      )
      .randomSource(rng)
      .stop();

    // Pre-warm: tick the simulation to convergence before first paint
    // so the layout is settled when React renders. No jitter, no
    // flicker. Matches seam's pre-settle pattern.
    const TICKS = 80;
    for (let i = 0; i < TICKS; i++) simulation.tick();

    simulationRef.current = simulation;

    // Snapshot start + target positions for the entrance animation.
    // R4: both snapshots come from the same single-RNG-stream simNodes —
    // no re-seed, no re-solve.
    const startPositions: MotionPoint[] = simNodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
    }));
    // Reset simNodes to start before rendering — animation drives toward target.
    const targetMap = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    for (const n of simNodes) {
      const s = startPositions.find((p) => p.id === n.id);
      if (s) { n.x = s.x; n.y = s.y; }
    }

    // Edge layer (renders below nodes).
    const edgeLayer = svg.append('g').attr('class', 'graph-edges');
    edgeLayer
      .selectAll<SVGLineElement, SimulationEdge>('line')
      .data(simEdges, (d) => d.id)
      .enter()
      .append('line')
      .attr('class', (d) => {
        const v = visualForEdge(d.type);
        return v.strokeClass;
      })
      .attr('stroke-width', (d) => visualForEdge(d.type).strokeWidth)
      .attr('stroke-dasharray', (d) => visualForEdge(d.type).dashArray ?? null)
      .attr('marker-end', (d) => (visualForEdge(d.type).arrowHead ? 'url(#graph-arrow)' : null))
      .attr('data-edge-id', (d) => d.id)
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    // Node layer.
    const nodeLayer = svg.append('g').attr('class', 'graph-nodes');
    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, SimulationNode>('g.graph-node')
      .data(simNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'graph-node cursor-pointer')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', (d) => d.displayName)
      .attr('data-node-id', (d) => d.id)
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .on('click', (_event, d) => onNodeClickRef.current?.(d))
      .on('mouseenter', (_event, d) => onNodeHoverRef.current?.(d))
      .on('mouseleave', () => onNodeHoverRef.current?.(null))
      .on('keydown', (event, d) => {
        if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
          event.preventDefault();
          onNodeClickRef.current?.(d);
        }
      });

    nodeGroups
      .append('circle')
      .attr('r', (d) => radiusForTier(d.tier))
      .attr('class', (d) => {
        const v = visualForNode(d.type);
        return `${v.fillClass} ${v.strokeClass}`;
      })
      .attr('stroke-width', 1.4);

    // Tier-1 labels: always-on, sit below the dot.
    nodeGroups
      .filter((d) => d.tier === 1)
      .append('text')
      .attr('class', 'fill-text-primary text-[11px] font-mono pointer-events-none')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => radiusForTier(d.tier) + 14)
      .text((d) => d.displayName);

    // Tier-2/3 labels: live in a hover-only sibling text node, hidden by default.
    nodeGroups
      .filter((d) => d.tier !== 1)
      .append('text')
      .attr(
        'class',
        'graph-node-label-hover fill-text-primary text-[11px] font-mono pointer-events-none opacity-0 transition-opacity',
      )
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => radiusForTier(d.tier) + 14)
      .text((d) => d.displayName);

    // ── Entrance animation ──
    // Check reduced-motion + SSR guard. Motion runs only in the browser
    // when the user hasn't requested reduced motion.
    const motionAllowed =
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (motionAllowed && startPositions.length > 0) {
      const edgeSel = svg.selectAll<SVGLineElement, SimulationEdge>('line');
      const nodeSel = svg.selectAll<SVGGElement, SimulationNode>('g.graph-node');

      // Cancel any in-flight animation from a prior dataSignature change.
      animateRef.current?.stop();

      const targetPoints: MotionPoint[] = Array.from(targetMap.entries()).map(
        ([id, p]) => ({ id, x: p.x, y: p.y }),
      );

      animateRef.current = animate(0, 1, {
        duration: ENTRANCE_DURATION_S,
        ease: smooth,
        onUpdate(alpha) {
          const frame = entranceFrame(startPositions, targetPoints, alpha);
          const posMap = new Map(frame.map((p) => [p.id, p]));

          // Update node transforms.
          nodeSel.attr('transform', (d) => {
            const p = posMap.get(d.id);
            return p ? `translate(${p.x},${p.y})` : `translate(${d.x},${d.y})`;
          });

          // Update edge endpoints from bound datum (NOT data-edge-id parsing).
          edgeSel
            .attr('x1', (d) => (posMap.get(d.source.id) ?? d.source).x)
            .attr('y1', (d) => (posMap.get(d.source.id) ?? d.source).y)
            .attr('x2', (d) => (posMap.get(d.target.id) ?? d.target).x)
            .attr('y2', (d) => (posMap.get(d.target.id) ?? d.target).y);
        },
        onComplete() {
          // Snap to exact target — R4 byte-identical end-state.
          nodeSel.attr('transform', (d) => {
            const tg = targetMap.get(d.id);
            return tg ? `translate(${tg.x},${tg.y})` : `translate(${d.x},${d.y})`;
          });
          edgeSel
            .attr('x1', (d) => (targetMap.get(d.source.id) ?? d.source).x)
            .attr('y1', (d) => (targetMap.get(d.source.id) ?? d.source).y)
            .attr('x2', (d) => (targetMap.get(d.target.id) ?? d.target).x)
            .attr('y2', (d) => (targetMap.get(d.target.id) ?? d.target).y);

          // Update simNodes to target so the R4 invariant holds for
          // any downstream code that reads simNodesRef.
          for (const n of simNodes) {
            const tg = targetMap.get(n.id);
            if (tg) { n.x = tg.x; n.y = tg.y; }
          }
          animateRef.current = null;
        },
      });
    }
  }, [svgRef, nodes, edges, options]);

  // Re-init when shape changes; the dataSignature guards against
  // referential-only updates.
  useEffect(() => {
    initGraph();
    return () => {
      animateRef.current?.stop();
      animateRef.current = null;
      simulationRef.current?.stop();
      simulationRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature, initGraph]);

  // 1-hop neighbour set for the focused node — used by the canvas
  // wrapper to dim non-neighbours via class swap.
  const neighbourIds = useMemo<ReadonlySet<string>>(() => {
    const id = options.focusedNodeId;
    if (!id) return new Set();
    const set = new Set<string>([id]);
    for (const edge of edges) {
      if (edge.fromNodeId === id) set.add(edge.toNodeId);
      if (edge.toNodeId === id) set.add(edge.fromNodeId);
    }
    return set;
  }, [edges, options.focusedNodeId]);

  return { neighbourIds };
}
