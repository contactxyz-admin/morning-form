'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { animate } from 'framer-motion';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import { makeRng } from '../../../prisma/fixtures/synthetic/generators';
import {
  haloRadiusForTier,
  radiusForTier,
  selectionStrokeClass,
  visualForEdge,
  visualForNode,
} from '@/lib/graph/visual-encoding';
import {
  smooth,
  entranceFrame,
  clampToBounds,
  fitTransform,
  zoomFilter,
  boundsFromNodes,
  type MotionPoint,
  type GraphBounds,
} from '@/lib/graph/motion';

/** Entrance duration in seconds. */
const ENTRANCE_DURATION_S = 0.7;

/** Zoom scale extent (view-only — never affects solved positions). */
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
/** Step factor for the +/- zoom controls (1.3× in, 1/1.3× out). */
const ZOOM_STEP = 1.3;
/** Duration of a +/- zoom-control transition. */
const ZOOM_STEP_MS = 200;
/** Duration of the eased reset/fit "camera" transition. */
const RESET_DURATION_MS = 450;
/** Padding (px) left around the node bbox when fitting to view. */
const FIT_PADDING = 48;

/** alphaTarget the sim is re-energized to while a node is being dragged. */
const DRAG_ALPHA_TARGET = 0.3;
/**
 * Click-vs-drag disambiguation: pointer movement under this many px still
 * emits the native click (tap → detail sheet); larger movements suppress it.
 */
const DRAG_CLICK_DISTANCE = 4;
/**
 * dragend watchdog: if the sim is somehow still hot this long after a drag
 * ends (alpha-cooling stalled), force it to stop. Alpha-guarded so it never
 * cuts a legitimately-cooling spring short (R6 backstop, short horizon).
 */
const DRAG_WATCHDOG_MS = 5_000;
/**
 * dragstart backstop: the ultimate cap. If `dragend` never fires (mouse
 * released outside the window, Alt+Tab while holding), the sim would
 * otherwise tick at alphaTarget(DRAG_ALPHA_TARGET) forever. Armed on
 * dragstart, replaced on the next dragstart, cleared on dragend / teardown.
 */
const DRAG_MAX_MS = 30_000;

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
 *   - Spring drag (Plan 2026-06-08-001 Unit 3): d3.drag re-energizes the
 *     retained sim (alphaTarget + fx/fy pin), neighbours spring via the
 *     existing forces, and the sim cools to a frozen rest on release.
 *     Gated on computeMotionAllowed() — reduced-motion / SSR get no drag.
 *   - Zoom + pan (graph-zoom): d3.zoom on the svg drives a single
 *     `.graph-zoom` <g> wrapping the edge + node layers. Wheel zooms
 *     anywhere; primary-button drag on the BACKGROUND pans (a node-targeted
 *     mousedown is rejected by the filter so node-drag still wins). Touch is
 *     excluded (desktop-first). Imperative +/- / reset controls are returned
 *     for the canvas to render; reset eases a fit-to-view "camera" and
 *     respects reduced motion. View-only — solved positions are unchanged.
 *
 * No contextmenu, no progress overlay, no cluster carry-forward — those are
 * seam-specific and we don't need them on the demo.
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
  /**
   * Per-node interactivity predicate. Non-interactive nodes render without
   * `role="button"` / `tabindex` / a click affordance (honest affordances —
   * e.g. the demo's source-document pseudo-nodes, which have no detail
   * surface). They still hover-dim and still drag. Defaults to all-interactive.
   */
  readonly nodeInteractive?: (node: GraphNodeWire) => boolean;
}

/**
 * Imperative zoom controls bound to the live svg + d3.zoom behaviour. Stable
 * identity (the functions read the current behaviour through a ref), so the
 * canvas can wire them to buttons without re-rendering the graph. All three
 * are view-only — they never touch solved node positions (R4).
 */
export interface ZoomControls {
  /** Smoothly zoom in one step about the viewport centre. */
  readonly zoomIn: () => void;
  /** Smoothly zoom out one step about the viewport centre. */
  readonly zoomOut: () => void;
  /**
   * Eased "camera" reset: fit the node bounding box into the viewport
   * (falls back to identity when bounds are unavailable). Honours
   * prefers-reduced-motion by applying instantly with no transition.
   */
  readonly reset: () => void;
}

export interface UseGraphStateReturn {
  /** 1-hop neighbour set including the focused node itself. */
  readonly neighbourIds: ReadonlySet<string>;
  /** Imperative +/- / reset controls for the zoom behaviour. */
  readonly zoomControls: ZoomControls;
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
  // Flush-the-entrance-to-target callback for the CURRENT init. reset() calls
  // it (after stopping animateRef) so the entrance can't keep scattering nodes
  // while the camera transition runs (ADV-04). Set in initGraph, cleared in
  // teardown. Also repaints the settled node/edge DOM so a reset mid-entrance
  // leaves the canvas at the target layout, not a half-animated frame.
  const flushEntranceRef = useRef<(() => void) | null>(null);
  // Per-init teardown (flag-cancel + flush) and reduced-motion listener
  // cleanup, set by initGraph and invoked by the effect cleanup.
  const teardownRef = useRef<(() => void) | null>(null);
  const reducedMotionCleanupRef = useRef<(() => void) | null>(null);
  // window 'blur' listener cleanup (alt-tab mid-drag cools the sim).
  // Attached in initGraph when drag is enabled, removed in teardown —
  // same ref-driven pattern as reducedMotionCleanupRef.
  const blurCleanupRef = useRef<(() => void) | null>(null);
  // Drag watchdog: forces the re-energized sim to stop if alpha-cooling
  // somehow stalls after a drag (R6 "never stops" backstop). Armed on
  // dragend, replaced on the next dragstart, cleared in teardown.
  const dragWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Backstop watchdog: armed on DRAGSTART (the dragend one above is not
  // armed if dragend never fires — mouse released off-window / alt-tab).
  // A longer DRAG_MAX_MS cap that force-stops the sim. Replaced on the next
  // dragstart, cleared on dragend and in teardown.
  const dragBackstopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Zoom behaviour for the current init, so the imperative zoomControls can
  // drive svg.transition().call(zoom.*, ...). Set in initGraph (after the
  // zoom is attached), cleared in teardown. The zoom listeners live on the
  // svg ELEMENT and survive selectAll('*').remove(), so teardown explicitly
  // detaches them (svg.on('.zoom', null)) to avoid accumulation across
  // re-inits / StrictMode remounts.
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Last-computed node bounding box (graph coords) for the reset/fit camera.
  // Reset now recomputes this from the LIVE node positions at click time
  // (see zoomControls.reset) so it frames the CURRENT arrangement after drags,
  // not a stale post-prewarm snapshot. Kept as a ref only so teardown can null it.
  const nodeBoundsRef = useRef<GraphBounds | null>(null);

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

    // ── Zoom layer ──
    // A single <g> that carries the d3.zoom transform. The edge + node
    // layers live INSIDE it, so pan/zoom composes once over all positional
    // content. <defs> stays on the svg (non-positional). The initial
    // transform is identity — first paint / the 80-tick solve are unchanged
    // (R4) and the entrance writes node transforms in graph coords beneath
    // an identity zoom.
    const zoomLayer = svg.append('g').attr('class', 'graph-zoom');

    // Filter (pan-on-background, ctrl/⌘+wheel-zoom, no-touch) is the pure
    // exported `zoomFilter` (motion.ts) — d3 hands it native Mouse/Wheel/Touch
    // events, all assignable to ZoomFilterEvent.
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter(zoomFilter)
      .on('zoom', (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) =>
        zoomLayer.attr('transform', e.transform.toString()),
      );

    // Attach; disable native double-click-zoom so a double-click on a node
    // isn't hijacked by the zoom behaviour.
    svg.call(zoom).on('dblclick.zoom', null);
    // Reset d3's internal __zoom datum to identity. selectAll('*').remove()
    // wipes the svg's CHILDREN but NOT the __zoom property d3 stores on the svg
    // ELEMENT, so after a dataSignature re-init the fresh zoomLayer sits at
    // identity while d3 still believes the view is panned/zoomed — the first
    // wheel/pan would jump (ADV-01). Seeding identity here makes every init
    // start clean.
    svg.call(zoom.transform, d3.zoomIdentity);
    zoomBehaviorRef.current = zoom;

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

    // Seed the node bounding box (graph coords) from the freshly-settled
    // layout. reset() recomputes this from the LIVE positions at click time
    // (item 4), but seeding it here means a reset before any drag still has a
    // sane fit. Padded outward by each node's radius (see boundsFromNodes) so
    // the fit frames whole dots, not just their centres.
    nodeBoundsRef.current = boundsFromNodes(simNodes, (n) => radiusForTier(n.tier));

    // Reset simNodes back to the SCATTER positions so the first SVG paint
    // (and the animation's first frame) begin from scatter, not target.
    // Index-aligned: startPositions[i] ↔ simNodes[i].
    for (let i = 0; i < simNodes.length; i++) {
      simNodes[i].x = startPositions[i].x;
      simNodes[i].y = startPositions[i].y;
    }

    // Edge layer (renders below nodes). Inside zoomLayer so it pans/zooms.
    const edgeLayer = zoomLayer.append('g').attr('class', 'graph-edges');
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
      // Endpoint node ids for the hover-dim neighbour check (edge ids are
      // opaque cuids with no from/to encoded — never parse data-edge-id).
      .attr('data-from-id', (d) => d.source.id)
      .attr('data-to-id', (d) => d.target.id)
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    // Node layer. Inside zoomLayer so it pans/zooms with the edges.
    // Interactivity is per-node (nodeInteractive predicate, read live through
    // optionsRef so a fresh function literal never re-inits the graph):
    // non-interactive nodes get no button role / tab stop / click, but keep
    // hover-dim and drag.
    const isInteractive = (d: SimulationNode) =>
      optionsRef.current.nodeInteractive?.(d) ?? true;
    const nodeLayer = zoomLayer.append('g').attr('class', 'graph-nodes');
    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, SimulationNode>('g.graph-node')
      .data(simNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'graph-node')
      .attr('role', (d) => (isInteractive(d) ? 'button' : null))
      .attr('tabindex', (d) => (isInteractive(d) ? 0 : null))
      .attr('aria-label', (d) => d.displayName)
      .attr('data-node-id', (d) => d.id)
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .on('click', (_event, d) => {
        if (isInteractive(d)) onNodeClickRef.current?.(d);
      })
      .on('mouseenter', (_event, d) => onNodeHoverRef.current?.(d))
      .on('mouseleave', () => onNodeHoverRef.current?.(null))
      .on('keydown', (event, d) => {
        if (!isInteractive(d)) return;
        if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
          event.preventDefault();
          onNodeClickRef.current?.(d);
        }
      });

    // Selection/focus halo — a hidden concentric ring beneath the dot,
    // toggled purely via CSS (globals.css): [data-selected] shows it in the
    // node's visual-class hue, :focus-visible in graphite. Appended FIRST so
    // the node circle paints on top; pointer-events:none so it never widens
    // the hit area. See docs/plans/2026-06-09-001 (node selection UX).
    nodeGroups
      .append('circle')
      .attr('class', (d) => `graph-node-halo ${selectionStrokeClass(d.type)}`)
      .attr('r', (d) => haloRadiusForTier(d.tier))
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('pointer-events', 'none');

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

    // Paint the settled-target node transforms + edge endpoints (zoomLayer-
    // scoped, item 6). Defined here (not just inside the entrance branch) so
    // flushEntranceRef can repaint to target when reset() interrupts the
    // entrance mid-flight.
    const targetNodeSel = zoomLayer.selectAll<SVGGElement, SimulationNode>('g.graph-node');
    const targetEdgeSel = zoomLayer.selectAll<SVGLineElement, SimulationEdge>('line');
    const paintTarget = () => {
      targetNodeSel.attr('transform', (d) => {
        const tg = targetMap.get(d.id);
        return tg ? `translate(${tg.x},${tg.y})` : `translate(${d.x},${d.y})`;
      });
      targetEdgeSel
        .attr('x1', (d) => (targetMap.get(d.source.id) ?? d.source).x)
        .attr('y1', (d) => (targetMap.get(d.source.id) ?? d.source).y)
        .attr('x2', (d) => (targetMap.get(d.target.id) ?? d.target).x)
        .attr('y2', (d) => (targetMap.get(d.target.id) ?? d.target).y);
    };

    // reset() calls this (after stopping animateRef) to halt + flush the
    // in-flight entrance so both don't run at once and scatter nodes (ADV-04).
    // Idempotent: a no-op once the entrance has already completed/flushed.
    flushEntranceRef.current = () => {
      flushToTarget();
      paintTarget();
    };

    // Local cancellation flag for this init's closure. Once set (in
    // cleanup, before stop()), any queued rAF frame is a no-op so we
    // never write to a torn-down SVG.
    let isCancelled = false;

    const motionAllowed = computeMotionAllowed();

    if (motionAllowed && startPositions.length > 0) {
      const edgeSel = targetEdgeSel;
      const nodeSel = targetNodeSel;

      // Cancel any in-flight animation from a prior dataSignature change.
      animateRef.current?.stop();

      animateRef.current = animate(0, 1, {
        duration: ENTRANCE_DURATION_S,
        ease: smooth,
        onUpdate(alpha) {
          // isCancelled: closure torn down. null handle: a higher-priority
          // transition (drag) stopped + nulled the entrance — a queued frame
          // must not write entrance positions over the sim's.
          if (isCancelled || animateRef.current === null) return;
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
          // Mirror onUpdate's guard: a torn-down closure or a higher-priority
          // transition (drag) that nulled the handle must not run bookkeeping.
          if (isCancelled || animateRef.current === null) return;
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
      // snap straight to the settled target. No drag is attached (R5), so
      // keep the original click affordance (inline, matches pre-drag
      // behaviour without the cursor-pointer class). Non-interactive nodes
      // get the default cursor — nothing to click, nothing to drag.
      nodeGroups.style('cursor', (d) => (isInteractive(d) ? 'pointer' : 'default'));
      flushToTarget();
      const edgeSel = zoomLayer.selectAll<SVGLineElement, SimulationEdge>('line');
      const nodeSel = zoomLayer.selectAll<SVGGElement, SimulationNode>('g.graph-node');
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

    // ── Spring drag (Plan 2026-06-08-001 Unit 3) ──
    // Re-energize the EXISTING D3 sim on drag (no new engine). Gated on
    // computeMotionAllowed(): reduced-motion / SSR get NO drag at all
    // (the plan's chosen default — honours R5; tap still opens the sheet
    // via the existing .on('click')). The dragging cursor is set as an
    // inline style, never a Tailwind class, to dodge the JIT content-glob
    // footgun (data-driven classes in src/lib/** silently drop).
    if (motionAllowed) {
      // Draggable affordance: grab on the node (inline, not a class).
      nodeGroups.style('cursor', 'grab');

      // Tick handler: while the sim runs (only during an active drag —
      // it is .stop()ped otherwise), write node transforms + edge
      // endpoints from the LIVE bound datum (d.x/d.y, d.source/d.target),
      // mirroring the entrance write-path. Selections captured once.
      const tickNodeSel = zoomLayer.selectAll<SVGGElement, SimulationNode>('g.graph-node');
      const tickEdgeSel = zoomLayer.selectAll<SVGLineElement, SimulationEdge>('line');
      const tickHandler = () => {
        // Guard: a final queued tick after teardown's stop() must not
        // write to a wiped SVG.
        if (isCancelled) return;
        tickNodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
        tickEdgeSel
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);
      };
      simulation.on('tick', tickHandler);

      const drag = d3
        .drag<SVGGElement, SimulationNode>()
        // Exclude ctrl-click / non-primary buttons. (event.pointerType is
        // NOT checked here — d3-drag@3 dispatches Mouse/Touch events, never
        // PointerEvents, so pointerType is always undefined and the old
        // check was a dead no-op. Touch is disabled via .touchable below.)
        .filter((event) => !event.ctrlKey && !event.button)
        // DISABLE touch entirely (the correct d3-drag API). A touchscreen
        // tap must NOT start a drag — it still opens the detail sheet via
        // the existing .on('click'). Without this, touch drags fire and
        // clickDistance is ignored for touch.
        .touchable(() => false)
        // Movements under DRAG_CLICK_DISTANCE px still emit the native click
        // (tap → sheet); real drags suppress it. This IS the click-vs-drag
        // disambiguation — no manual threshold.
        .clickDistance(DRAG_CLICK_DISTANCE)
        // Reconcile with zoom: resolve event.x/event.y in zoomLayer (graph)
        // space, NOT screen space. So at any zoom level the pinned fx/fy and
        // clampToBounds() keep operating in graph coords [0,W]×[0,H] exactly
        // as before — a node dragged at 2× zoom still tracks the pointer.
        .container(() => zoomLayer.node()!)
        .on('start', (event, d) => {
          // Orphan guard: d3-drag's window listeners survive teardown, so a
          // 'start' fired after this closure was torn down must no-op (else
          // it re-energizes a dead/replaced sim).
          if (isCancelled) return;
          // Belt-and-suspenders: stop the node-initiated mousedown from
          // reaching the svg's zoom behaviour, so a node drag can never also
          // start a pan. (zoomFilter already rejects node targets; this makes
          // the separation robust even if both behaviours observe the event.)
          event.sourceEvent?.stopPropagation();
          // A higher-priority transition (drag) cancels the entrance.
          // The entrance onUpdate is guarded by isCancelled / a null
          // handle, so it won't fight the sim.
          animateRef.current?.stop();
          animateRef.current = null;
          // Clear the hover/focus dim for the duration of the drag.
          onNodeHoverRef.current?.(null);
          // Re-energize the retained sim.
          simulationRef.current?.alphaTarget(DRAG_ALPHA_TARGET).restart();
          // Pin the node under the pointer (clamped on-canvas).
          const r = radiusForTier(d.tier);
          d.fx = clampToBounds(event.x, r, width);
          d.fy = clampToBounds(event.y, r, height);
          // Grabbing cursor on the SVG (inline style, not a class).
          svg.style('cursor', 'grabbing');
          // Clear any stale dragend watchdog from a prior drag.
          if (dragWatchdogRef.current) clearTimeout(dragWatchdogRef.current);
          dragWatchdogRef.current = null;
          // Arm the BACKSTOP: if dragend never fires (pointer released
          // off-window / alt-tab while holding), this is the ultimate cap
          // that cools + stops the sim so it can't tick forever (R6).
          if (dragBackstopRef.current) clearTimeout(dragBackstopRef.current);
          dragBackstopRef.current = setTimeout(() => {
            simulationRef.current?.alphaTarget(0);
            simulationRef.current?.stop();
            dragBackstopRef.current = null;
          }, DRAG_MAX_MS);
        })
        .on('drag', (event, d) => {
          if (isCancelled) return;
          const r = radiusForTier(d.tier);
          d.fx = clampToBounds(event.x, r, width);
          d.fy = clampToBounds(event.y, r, height);
        })
        .on('end', () => {
          // Orphan guard: an 'end' fired after teardown (or a StrictMode
          // remount) must not arm a watchdog on the NEW sim.
          if (isCancelled) return;
          // Cool the sim to rest; d3's internal timer auto-stops at
          // alphaMin. RETAIN fx/fy (session pin — node stays where
          // dropped; no spring-back, no persistence).
          simulationRef.current?.alphaTarget(0);
          // Restore the default cursor on the SVG.
          svg.style('cursor', null);
          // dragend handled the cool-down — the backstop is no longer needed.
          if (dragBackstopRef.current) {
            clearTimeout(dragBackstopRef.current);
            dragBackstopRef.current = null;
          }
          // Watchdog: if alpha-cooling stalls and the sim is somehow still
          // HOT ~DRAG_WATCHDOG_MS later, force it to stop (R6). The alpha
          // guard means it never cuts a legitimately-cooling spring short.
          if (dragWatchdogRef.current) clearTimeout(dragWatchdogRef.current);
          dragWatchdogRef.current = setTimeout(() => {
            const sim = simulationRef.current;
            if (sim && sim.alpha() > sim.alphaMin()) {
              sim.alphaTarget(0);
              sim.stop();
            }
            dragWatchdogRef.current = null;
          }, DRAG_WATCHDOG_MS);
        });

      nodeGroups.call(drag);

      // Window blur (alt-tab / focus loss mid-drag): cool the sim gracefully
      // so it can't keep ticking at DRAG_ALPHA_TARGET while unattended. The
      // dragstart backstop is the hard cap; this is the graceful nudge.
      if (typeof window !== 'undefined') {
        const onBlur = () => {
          simulationRef.current?.alphaTarget(0);
        };
        window.addEventListener('blur', onBlur);
        blurCleanupRef.current = () => window.removeEventListener('blur', onBlur);
      }
    }

    // Expose teardown to the effect cleanup so it can flag + flush this
    // exact closure's state before the SVG is wiped.
    teardownRef.current = () => {
      isCancelled = true;
      animateRef.current?.stop();
      animateRef.current = null;
      flushEntranceRef.current = null;
      // Clear BOTH drag timers so neither can fire after teardown / re-init
      // (a pending backstop or watchdog would otherwise touch the next sim).
      if (dragWatchdogRef.current) {
        clearTimeout(dragWatchdogRef.current);
        dragWatchdogRef.current = null;
      }
      if (dragBackstopRef.current) {
        clearTimeout(dragBackstopRef.current);
        dragBackstopRef.current = null;
      }
      // Reset the SVG cursor: if teardown fires mid-drag, 'grabbing' would
      // otherwise persist into the next init.
      svg.style('cursor', null);
      // CRITICAL: the zoom listeners live on the svg ELEMENT and survive
      // selectAll('*').remove(); detach them so they don't accumulate across
      // re-inits / StrictMode remounts (each initGraph re-attaches a fresh
      // zoom behaviour). Also drop the refs the controls read.
      svg.on('.zoom', null);
      zoomBehaviorRef.current = null;
      nodeBoundsRef.current = null;
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
      blurCleanupRef.current?.();
      blurCleanupRef.current = null;
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

  // Imperative zoom controls. Stable identity (deps are the layout-stable
  // scalars + svgRef) — they read the live zoom behaviour through a ref, so
  // wiring them to buttons never re-renders the graph. All view-only (R4).
  const zoomControls = useMemo<ZoomControls>(() => {
    const withZoom = (
      fn: (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>, zoom: d3.ZoomBehavior<SVGSVGElement, unknown>) => void,
    ) => {
      const svgEl = svgRef.current;
      const zoom = zoomBehaviorRef.current;
      if (!svgEl || !zoom) return;
      fn(d3.select(svgEl), zoom);
    };

    return {
      zoomIn: () =>
        withZoom((sel, zoom) => {
          // Gate the transition on reduced motion (WCAG-correct, matches
          // reset): instant under reduce, eased otherwise. Guarded so a
          // mid-entrance click never throws (it only scales the view).
          if (computeMotionAllowed()) {
            sel.transition().duration(ZOOM_STEP_MS).call(zoom.scaleBy, ZOOM_STEP);
          } else {
            sel.call(zoom.scaleBy, ZOOM_STEP);
          }
        }),
      zoomOut: () =>
        withZoom((sel, zoom) => {
          if (computeMotionAllowed()) {
            sel.transition().duration(ZOOM_STEP_MS).call(zoom.scaleBy, 1 / ZOOM_STEP);
          } else {
            sel.call(zoom.scaleBy, 1 / ZOOM_STEP);
          }
        }),
      reset: () =>
        withZoom((sel, zoom) => {
          // Stop + flush the in-flight entrance BEFORE starting the camera
          // transition, so the two don't run at once and scatter nodes
          // (ADV-04). flushEntranceRef halts animateRef, flushes simNodes to
          // target, and repaints the settled DOM.
          animateRef.current?.stop();
          animateRef.current = null;
          flushEntranceRef.current?.();

          // Fit the CURRENT (live) node arrangement, not a stale post-prewarm
          // snapshot — so reset frames where the nodes actually are after any
          // drags (item 4). Recompute the padded bbox from simNodesRef; fall
          // back to identity when there are no nodes.
          const bounds =
            boundsFromNodes(simNodesRef.current, (n) => radiusForTier(n.tier)) ??
            nodeBoundsRef.current;
          nodeBoundsRef.current = bounds;
          const target = bounds
            ? (() => {
                const { k, x, y } = fitTransform(
                  bounds,
                  width,
                  height,
                  FIT_PADDING,
                  MIN_ZOOM,
                  MAX_ZOOM,
                );
                return d3.zoomIdentity.translate(x, y).scale(k);
              })()
            : d3.zoomIdentity;
          // Under reduced motion, apply instantly (no transition).
          if (computeMotionAllowed()) {
            sel.transition().duration(RESET_DURATION_MS).call(zoom.transform, target);
          } else {
            sel.call(zoom.transform, target);
          }
        }),
    };
  }, [svgRef, width, height]);

  return { neighbourIds, zoomControls };
}
