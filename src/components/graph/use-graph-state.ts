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
 * Pure decision: is the entrance animation allowed to run?
 * Returns false in node/SSR (no window) and when the user has requested
 * reduced motion. Guarded so it never throws when matchMedia is absent.
 * Node-env unit-testable (see use-graph-state.test.ts).
 */
export function computeMotionAllowed(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false;
  return !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
  // Per-init teardown (flag-cancel + flush) and reduced-motion listener
  // cleanup, set by initGraph and invoked by the effect cleanup.
  const teardownRef = useRef<(() => void) | null>(null);
  const reducedMotionCleanupRef = useRef<(() => void) | null>(null);

  // Volatile callback refs — must not retrigger the simulation. The whole
  // `options` object is a fresh literal each parent render (hover toggles
  // focusedNodeId), so we route the volatile members through refs and key
  // initGraph only on the layout-stable scalars (width/height/seed).
  const optionsRef = useRef(options);
  const onNodeClickRef = useRef(options.onNodeClick);
  const onNodeHoverRef = useRef(options.onNodeHover);
  useEffect(() => {
    optionsRef.current = options;
    onNodeClickRef.current = options.onNodeClick;
    onNodeHoverRef.current = options.onNodeHover;
  });

  // Layout-stable scalars — the ONLY option fields that should rebuild the
  // graph. focusedNodeId / onNodeClick / onNodeHover must NOT (hover would
  // otherwise wipe the DOM + restart the 700ms entrance every frame).
  const { width, height, seed } = options;

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

    // Snapshot the SCATTER positions BEFORE pre-warm — these are the
    // animation's starting frame. Captured here (not after the ticks)
    // so the entrance actually displaces nodes: scatter → settled.
    // Index-aligned with simNodes (same map() order) — no Array.find.
    const startPositions: MotionPoint[] = simNodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
    }));

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

    // Snapshot the SETTLED positions AFTER pre-warm — the animation's
    // target frame. R4: this is the frozen, byte-identical output of the
    // single-RNG-stream 80-tick solve.
    const targetMap: ReadonlyMap<string, { x: number; y: number }> = new Map(
      simNodes.map((n) => [n.id, { x: n.x, y: n.y }]),
    );
    // Prebuilt MotionPoint map for the entrance frame stepper — built once
    // here, reused every frame (no per-frame Map rebuild).
    const targetPointMap: ReadonlyMap<string, MotionPoint> = new Map(
      simNodes.map((n) => [n.id, { id: n.id, x: n.x, y: n.y }]),
    );

    // Reset simNodes back to the SCATTER positions so the first SVG paint
    // (and the animation's first frame) begin from scatter, not target.
    // Index-aligned: startPositions[i] ↔ simNodes[i].
    for (let i = 0; i < simNodes.length; i++) {
      simNodes[i].x = startPositions[i].x;
      simNodes[i].y = startPositions[i].y;
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
    // FLUSH simNodes to the settled target. Always-safe end-state for any
    // downstream reader of simNodesRef (R4), regardless of how the
    // animation ends — runs in the cleanup and on any stop path.
    const flushToTarget = () => {
      for (let i = 0; i < simNodes.length; i++) {
        const tg = targetMap.get(simNodes[i].id);
        if (tg) {
          simNodes[i].x = tg.x;
          simNodes[i].y = tg.y;
        }
      }
    };

    // Local cancellation flag for this init's closure. Once set (in
    // cleanup, before stop()), any queued rAF frame is a no-op so we
    // never write to a torn-down SVG.
    let isCancelled = false;

    const motionAllowed = computeMotionAllowed();

    if (motionAllowed && startPositions.length > 0) {
      const edgeSel = svg.selectAll<SVGLineElement, SimulationEdge>('line');
      const nodeSel = svg.selectAll<SVGGElement, SimulationNode>('g.graph-node');

      // Cancel any in-flight animation from a prior dataSignature change.
      animateRef.current?.stop();

      const paintTarget = () => {
        nodeSel.attr('transform', (d) => {
          const tg = targetMap.get(d.id);
          return tg ? `translate(${tg.x},${tg.y})` : `translate(${d.x},${d.y})`;
        });
        edgeSel
          .attr('x1', (d) => (targetMap.get(d.source.id) ?? d.source).x)
          .attr('y1', (d) => (targetMap.get(d.source.id) ?? d.source).y)
          .attr('x2', (d) => (targetMap.get(d.target.id) ?? d.target).x)
          .attr('y2', (d) => (targetMap.get(d.target.id) ?? d.target).y);
      };

      animateRef.current = animate(0, 1, {
        duration: ENTRANCE_DURATION_S,
        ease: smooth,
        onUpdate(alpha) {
          if (isCancelled) return;
          const frame = entranceFrame(startPositions, targetPointMap, alpha);
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
          if (isCancelled) return;
          // onUpdate(1) already painted the exact target; only the bookkeeping
          // remains — flush simNodes + clear the handle.
          flushToTarget();
          animateRef.current = null;
        },
      });

      // Reduced-motion can flip mid-animation (OS setting toggled). On
      // reduce=true, stop the animation and snap to target.
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onReduceChange = (e: MediaQueryListEvent) => {
          if (e.matches && !isCancelled) {
            animateRef.current?.stop();
            animateRef.current = null;
            paintTarget();
            flushToTarget();
          }
        };
        mql.addEventListener('change', onReduceChange);
        reducedMotionCleanupRef.current = () =>
          mql.removeEventListener('change', onReduceChange);
      }
    } else {
      // Reduced motion / SSR / empty — first paint already shows scatter;
      // snap straight to the settled target.
      flushToTarget();
      const edgeSel = svg.selectAll<SVGLineElement, SimulationEdge>('line');
      const nodeSel = svg.selectAll<SVGGElement, SimulationNode>('g.graph-node');
      nodeSel.attr('transform', (d) => {
        const tg = targetMap.get(d.id);
        return tg ? `translate(${tg.x},${tg.y})` : `translate(${d.x},${d.y})`;
      });
      edgeSel
        .attr('x1', (d) => (targetMap.get(d.source.id) ?? d.source).x)
        .attr('y1', (d) => (targetMap.get(d.source.id) ?? d.source).y)
        .attr('x2', (d) => (targetMap.get(d.target.id) ?? d.target).x)
        .attr('y2', (d) => (targetMap.get(d.target.id) ?? d.target).y);
    }

    // Expose teardown to the effect cleanup so it can flag + flush this
    // exact closure's state before the SVG is wiped.
    teardownRef.current = () => {
      isCancelled = true;
      animateRef.current?.stop();
      animateRef.current = null;
      flushToTarget();
    };
  }, [svgRef, nodes, edges, width, height, seed]);

  // Re-init when shape changes; the dataSignature guards against
  // referential-only updates.
  useEffect(() => {
    initGraph();
    return () => {
      // Flag the in-flight animation cancelled + flush BEFORE stopping,
      // so no queued frame writes to the SVG we're about to wipe and
      // simNodesRef ends at the settled target (R4). StrictMode-safe:
      // mount→unmount→remount tears down cleanly without a leaked handle.
      teardownRef.current?.();
      teardownRef.current = null;
      reducedMotionCleanupRef.current?.();
      reducedMotionCleanupRef.current = null;
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
