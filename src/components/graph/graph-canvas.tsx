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
 * pushing onNodeHover(null) up to the hoveredNodeId state below — the dim
 * effect re-derives from there (falling back to the persistent selection).
 *
 * Selection (node-selection-ux plan 2026-06-09-001): `selectedNodeId` mirrors
 * the open detail surface's `?entity=` URL state. The selected node shows a
 * halo ring ([data-selected] → globals.css) and keeps its 1-hop neighbourhood
 * emphasised while the surface is open; hover temporarily re-aims the
 * emphasis and releases back to the selection on mouseleave.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { animate } from 'framer-motion';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import { edgeOpacity, smooth, lerp, easeOutBack, staggeredAlpha } from '@/lib/graph/motion';
import { asOfVisibility, changeVisibleAsOf, composeNodeOpacity } from '@/lib/graph/as-of';
import { revealStaggerOrder } from '@/lib/graph/scrubber';
import { useGraphState, computeMotionAllowed } from './use-graph-state';

// Opacity for a node not yet "born" as-of the scrubber date — a faint ghost
// that keeps the layout legible without reading as present. Tunable in the
// visual audit (plan 2026-06-15-001). One source of truth; string form derived.
const AS_OF_DIM_NUM = 0.08;
const AS_OF_DIM = String(AS_OF_DIM_NUM);
// Scrub-transition tuning (plan 2026-06-16-001) — all dial-in-the-audit feel.
const SCRUB_DURATION = 0.55; // seconds for a stop→stop eased transition
// A node counts as "revealing" (gets the grow-in) only if it starts near the
// time-ghost floor — not merely below 0.5, which would wrongly grow-in a
// hover-dimmed (0.2) or mid-interrupted node that was already present.
const REVEAL_FLOOR = AS_OF_DIM_NUM + 0.04;
const BIRTH_SCALE = 0.8; // a revealed node grows from here to 1 (grow-in)
const LAG_RATIO = 0.15; // Manim lag_ratio — same-stop births stagger subtly

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
  /**
   * Node id whose detail surface is open (the `?entity=` selection). Shows
   * the selection halo + persistent neighbourhood emphasis; cleared by the
   * caller when the surface closes. Node ID, never canonicalKey — callers
   * map their own URL state first.
   */
  readonly selectedNodeId?: string | null;
  /**
   * Per-node interactivity predicate (see UseGraphStateOptions.nodeInteractive).
   * Defaults to all-interactive.
   */
  readonly nodeInteractive?: (node: GraphNodeWire) => boolean;
  /**
   * Per-node "ghost" predicate for the demo category filter (plan
   * 2026-06-17-001). A node it returns `true` for fades to the faint ghost
   * floor (the same idiom as the time-scrubber's not-yet-born nodes), its
   * edges/change-rings/hover-label hide with it, and it drops out of the
   * click/tab order so the kept set is what you navigate. Defaults to a no-op
   * (`false` for every node), so the authed `/graph` canvas is byte-for-byte
   * today's render — this only fades, never removes from the DOM.
   */
  readonly nodeGhosted?: (node: GraphNodeWire) => boolean;
  /**
   * Time-scrubber "as of" date, epoch ms. When set, nodes whose `firstSeenAt`
   * postdates it dim (with their edges), and a node's change ring stays hidden
   * until the date reaches its change `afterAt`. `null`/omitted → no temporal
   * dimming, i.e. today's render (the authed `/graph` never sets it; demo only).
   * Plan 2026-06-15-001.
   */
  readonly asOfEpoch?: number | null;
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
  selectedNodeId = null,
  nodeInteractive,
  nodeGhosted,
  asOfEpoch = null,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // id → temporal metadata for the as-of dimming pass below. Rebuilt only when
  // the node set changes (stable in the demo's memoized canvasNodes).
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Eased scrub transition (plan 2026-06-16-001): a cancellable opacity+scale
  // tween that runs only when `asOfEpoch` actually changes with motion allowed.
  // `prevAsOfRef === undefined` marks the first paint (no tween on mount).
  const scrubTweenRef = useRef<ReturnType<typeof animate> | null>(null);
  const prevAsOfRef = useRef<number | null | undefined>(undefined);

  // Emphasis = hover while the pointer is on a node, falling back to the
  // persistent selection (the open detail surface) at rest. Hover stays
  // transient and unchanged; selection keeps the neighbourhood lit after
  // mouseleave instead of letting the open sheet float free of any anchor.
  const emphasisNodeId = hoveredNodeId ?? selectedNodeId;

  const { neighbourIds, zoomControls } = useGraphState(svgRef, nodes, edges, {
    width,
    height,
    seed,
    onNodeClick,
    onNodeHover: (n) => setHoveredNodeId(n?.id ?? null),
    focusedNodeId: emphasisNodeId,
    nodeInteractive,
  });

  // Imperatively dim nodes / edges. Two composed sources, both opacity-only on
  // the existing DOM (the seam pattern: physics in the hook, overlays via
  // selection). (1) Hover/focus emphasis dims non-neighbours. (2) The demo
  // time-scrubber (`asOfEpoch`) ghosts nodes not yet "born" as-of that date,
  // dims their edges, and hides change rings until due. The time-ghost wins
  // over emphasis. `asOfEpoch == null` (authed path / scrubber off) makes the
  // time pass a no-op, so this is byte-for-byte today's behaviour.
  //
  // When `asOfEpoch` *changes* (a scrub) with motion allowed, the time-opacity
  // (and a grow-in scale on newly-revealed nodes) EASES to the target instead
  // of cutting — `paintInstant` is the canonical end-state the tween lands on.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const hasEmphasis = Boolean(emphasisNodeId);
    const timeDimmed = (id: string) =>
      asOfVisibility(nodeById.get(id)?.firstSeenAt, asOfEpoch) === 'dimmed';
    // Category filter (plan 2026-06-17-001): a node whose visual class the
    // viewer switched off. Composes with the time-ghost via `ghosted` below —
    // both fade a node to the same floor, so the as-of paint path handles it
    // verbatim. Default (no predicate) → always false → today's render.
    const classGhost = (id: string) => {
      const n = nodeById.get(id);
      return n ? (nodeGhosted?.(n) ?? false) : false;
    };
    const ghosted = (id: string) => timeDimmed(id) || classGhost(id);

    // Canonical instant paint — today's behaviour verbatim. Used for the
    // prod/null path, hover-only changes, reduced-motion, and as the tween's
    // exact landing state (so the eased and instant paths agree byte-for-byte).
    const paintInstant = () => {
      svg.querySelectorAll<SVGGElement>('[data-node-id]').forEach((el) => {
        const id = el.getAttribute('data-node-id') ?? '';
        const ghost = ghosted(id);
        const filtered = classGhost(id);
        el.style.opacity = ghost
          ? AS_OF_DIM
          : hasEmphasis
            ? neighbourIds.has(id)
              ? '1'
              : '0.2'
            : '';
        // Filter-ghosted nodes leave the click/tab order so the kept set is
        // what you navigate (the time-ghost's interactivity is left as-is —
        // scrubber parity). ponytail: a node filtered off while its detail
        // sheet is open goes aria-hidden but the sheet stays open; revisit if
        // open-sheet + filter-off combine awkwardly in practice.
        // `aria-hidden` is the "was filter-ghosted" marker:
        // when nothing is filtered (default / authed `/graph`) the else-branch
        // is skipped entirely, so this writes nothing — byte-for-byte today's
        // DOM. Restore from the node's own role on un-ghost.
        if (filtered) {
          el.style.pointerEvents = 'none';
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('tabindex', '-1');
        } else if (el.getAttribute('aria-hidden') === 'true') {
          el.style.pointerEvents = '';
          el.removeAttribute('aria-hidden');
          if (el.getAttribute('role') === 'button') el.setAttribute('tabindex', '0');
          else el.removeAttribute('tabindex');
        }
        // Strip an in-flight grow-in scale back to the position-only transform —
        // but ONLY when a scale is actually present, so we never clobber a
        // translate written by a node drag (data-base-transform would be stale).
        const live = el.getAttribute('transform') ?? '';
        if (live.includes('scale(')) {
          const base =
            el.getAttribute('data-base-transform') ?? live.replace(/\s*scale\([^)]*\)/, '');
          el.setAttribute('transform', base);
        }
        const hoverLabel = el.querySelector<SVGTextElement>('.graph-node-label-hover');
        if (hoverLabel) {
          hoverLabel.style.opacity = ghost
            ? '0'
            : hasEmphasis
              ? neighbourIds.has(id)
                ? '1'
                : '0'
              : '';
        }
        const changeShown = changeVisibleAsOf(nodeById.get(id)?.change, asOfEpoch);
        el.querySelectorAll<SVGElement>(
          '.graph-node-change-ring, .graph-node-change-pulse, .graph-node-change-badge',
        ).forEach((c) => {
          c.style.opacity = changeShown && !filtered ? '' : '0';
        });
      });
      svg.querySelectorAll<SVGElement>('[data-from-id]').forEach((el) => {
        const fromId = el.getAttribute('data-from-id') ?? '';
        const toId = el.getAttribute('data-to-id') ?? '';
        el.style.opacity =
          ghosted(fromId) || ghosted(toId)
            ? AS_OF_DIM
            : hasEmphasis
              ? edgeOpacity(fromId, toId, neighbourIds)
              : '';
      });
    };

    const prev = prevAsOfRef.current;
    const asOfChanged = prev !== undefined && prev !== asOfEpoch && asOfEpoch != null;
    prevAsOfRef.current = asOfEpoch;

    // Not a scrub (prod/null, first paint, hover, reduced-motion) → instant.
    // A hover change mid-scrub lands here too: the effect cleanup stops the
    // in-flight tween and we snap to the canonical end-state (acceptable — a
    // hover during a 0.55s scrub just completes it instantly).
    if (!asOfChanged || !computeMotionAllowed()) {
      scrubTweenRef.current?.stop();
      scrubTweenRef.current = null;
      paintInstant();
      return;
    }

    // ── Eased scrub transition ──────────────────────────────────────────────
    // Numeric targets matching paintInstant's logic; ease opacity start→end and
    // grow newly-revealed nodes in. Scale via `translate(x,y) scale(s)` on the
    // group (local origin = node centre) so the converged position is preserved.
    const nodeTarget = (id: string) =>
      composeNodeOpacity(ghosted(id), hasEmphasis, neighbourIds.has(id), AS_OF_DIM_NUM);

    const nodeEls = Array.from(svg.querySelectorAll<SVGGElement>('[data-node-id]'));
    const nodeFrames = nodeEls.map((el) => {
      const id = el.getAttribute('data-node-id') ?? '';
      const start = parseFloat(el.style.opacity || '1');
      const end = nodeTarget(id);
      // Position-only transform: prefer the cached base (a prior interrupted
      // tween may have left a `scale()` on `transform`), else the current one.
      const base = el.getAttribute('data-base-transform') ?? el.getAttribute('transform') ?? '';
      el.setAttribute('data-base-transform', base);
      return { el, id, start, end, base, reveal: start <= REVEAL_FLOOR && end >= 0.5 };
    });
    // Stagger only the revealing nodes (Manim lag_ratio), deterministic order.
    const order = revealStaggerOrder(
      nodeFrames
        .filter((f) => f.reveal)
        .map((f) => ({ id: f.id, tier: nodeById.get(f.id)?.tier ?? 9 })),
    );
    const revealCount = order.size;

    const edgeFrames = Array.from(svg.querySelectorAll<SVGElement>('[data-from-id]')).map(
      (el) => {
        const fromId = el.getAttribute('data-from-id') ?? '';
        const toId = el.getAttribute('data-to-id') ?? '';
        const start = parseFloat(el.style.opacity || '1');
        const end =
          ghosted(fromId) || ghosted(toId)
            ? AS_OF_DIM_NUM
            : hasEmphasis
              ? Number(edgeOpacity(fromId, toId, neighbourIds))
              : 1;
        return { el, start, end };
      },
    );

    // Change rings + hover labels don't ease — set them to final up front.
    nodeEls.forEach((el) => {
      const id = el.getAttribute('data-node-id') ?? '';
      const changeShown = changeVisibleAsOf(nodeById.get(id)?.change, asOfEpoch);
      el.querySelectorAll<SVGElement>(
        '.graph-node-change-ring, .graph-node-change-pulse, .graph-node-change-badge',
      ).forEach((c) => (c.style.opacity = changeShown && !classGhost(id) ? '' : '0'));
    });

    scrubTweenRef.current?.stop();
    scrubTweenRef.current = animate(0, 1, {
      duration: SCRUB_DURATION,
      ease: 'linear', // we apply `smooth` (and the stagger) ourselves, per node
      onUpdate: (g: number) => {
        nodeFrames.forEach((f) => {
          const local = f.reveal
            ? staggeredAlpha(g, order.get(f.id) ?? 0, revealCount, LAG_RATIO)
            : g;
          f.el.style.opacity = String(lerp(f.start, f.end, smooth(local)));
          if (f.reveal) {
            const s = lerp(BIRTH_SCALE, 1, easeOutBack(local));
            f.el.setAttribute('transform', `${f.base} scale(${s})`);
          }
        });
        edgeFrames.forEach((e) => {
          e.el.style.opacity = String(lerp(e.start, e.end, smooth(g)));
        });
      },
      onComplete: () => {
        scrubTweenRef.current = null;
        paintInstant(); // land exactly on the canonical end-state, strip scale
      },
    });

    return () => {
      scrubTweenRef.current?.stop();
      scrubTweenRef.current = null;
    };
  }, [emphasisNodeId, neighbourIds, asOfEpoch, nodeById, nodeGhosted]);

  // Selection halo + aria-current, mirrored from the `?entity=` URL state.
  // Same imperative seam as the dim effect: attribute toggles on existing
  // DOM, never a sim re-init. `nodes` in the deps re-applies the attributes
  // after a dataSignature re-init rebuilds the node groups (this effect is
  // declared after the useGraphState call, so it runs after the rebuild).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll<SVGGElement>('.graph-node').forEach((el) => {
      const isSelected =
        selectedNodeId != null && el.getAttribute('data-node-id') === selectedNodeId;
      if (isSelected) {
        el.setAttribute('data-selected', 'true');
        el.setAttribute('aria-current', 'true');
      } else {
        // Blur-on-deselect: a click leaves DOM focus on the <g>, so after
        // the sheet closes a stale focus artifact would linger (the original
        // blue-box symptom). Keyboard focus (:focus-visible) is preserved —
        // blurring it would dump the user's Tab position back to <body>
        // after Escape.
        if (
          el.hasAttribute('data-selected') &&
          el === document.activeElement &&
          !el.matches(':focus-visible')
        ) {
          el.blur();
        }
        el.removeAttribute('data-selected');
        el.removeAttribute('aria-current');
      }
    });
  }, [selectedNodeId, nodes]);

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
          // Any click that is NOT on a node clears hover — the svg background,
          // an edge <line>, the zoom layer <g>, an empty-space gap, all of it.
          // (The earlier svg-tagName-only guard missed edges and the layer
          // groups.) d3.zoom suppresses the click that follows a pan move
          // (clickDistance), so a genuine background click still clears hover
          // while a pan does not. Selection is NOT cleared here — it belongs
          // to the detail surface and releases when that closes.
          if (!(e.target as Element).closest?.('.graph-node')) {
            setHoveredNodeId(null);
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
