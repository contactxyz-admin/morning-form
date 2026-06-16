/**
 * Pure motion primitives for graph entrance animation (Plan 2026-06-08-001).
 *
 * DOM-free, dependency-light — no React, no framer-motion, no rAF, no D3.
 * Easing functions and position interpolation that can be unit-tested in
 * vitest's `node` environment.
 */

/** Clamped smoothstep S-curve (0→1, smooth acceleration + deceleration). */
export function smooth(t: number): number {
  const c = clamp(t);
  return c * c * (3 - 2 * c);
}

function clamp(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

// ── Change pulse (Plan 2026-06-10-003 U2) ──

/** Default peak scale for the one-shot change pulse (subtle — clinically calm). */
export const PULSE_PEAK = 1.18;

/**
 * One-shot pulse scale for a node that changed since the last panel.
 * `easedAlpha` is normalized time [0,1]; the scale rises from 1 to `peak` at
 * the midpoint and returns to 1 at the end (a single swell, no residual).
 *
 * Applied as a transform-scale on the node's own `<g>` — NEVER to the
 * force-solved x/y — so the converged layout (the determinism contract from
 * Plan 2026-06-08-001) is untouched and the animation ends at a frozen rest.
 */
export function pulseScale(easedAlpha: number, peak: number = PULSE_PEAK): number {
  const t = clamp(easedAlpha);
  // sin(pi*t): 0 at the ends, 1 at t=0.5 — a symmetric swell that returns to
  // exactly 1 so there is no lingering scale once the animation completes.
  return 1 + (peak - 1) * Math.sin(Math.PI * t);
}

// ── Scrub-transition vocabulary (Plan 2026-06-16-001 — Manim-grade scrubber) ──
// (`lerp` is exported below, next to its original definition.)

/**
 * Ease-out-back: overshoots past 1 in the middle then settles to exactly 1 at
 * t=1 — a node "grows in" with a touch of life (Manim `back`). Clamped input.
 */
export function easeOutBack(t: number): number {
  const c = clamp(t);
  const s = 1.70158;
  const x = c - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

/**
 * Manim `lag_ratio` schedule. Given the global tween alpha, returns item `i`'s
 * LOCAL linear alpha so a group reveals in a stagger: each item animates over
 * its own sub-window of the timeline, item 0 first. `lagRatio` is the fraction
 * of one item's duration to wait before the next starts.
 *
 * - `lagRatio = 0` (or `count <= 1`) → every item gets the global alpha (no
 *   stagger), degrading to a simultaneous reveal.
 * - `globalAlpha = 1` → every item at 1 (all finished).
 *
 * The caller applies a rate function (e.g. `smooth`) to the returned local
 * alpha — schedule and easing stay decoupled.
 */
export function staggeredAlpha(
  globalAlpha: number,
  index: number,
  count: number,
  lagRatio: number,
): number {
  const g = clamp(globalAlpha);
  if (count <= 1 || lagRatio <= 0) return g;
  const span = 1 + (count - 1) * lagRatio; // total duration in item-duration units
  const start = (index * lagRatio) / span;
  const end = (index * lagRatio + 1) / span;
  return clamp((g - start) / (end - start));
}

// ── Frame stepper ──

export interface MotionPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * Pure position interpolation for a single frame.
 * `alpha` is the eased, normalized time [0,1].
 * Returns start at alpha=0, target at alpha=1, lerp in between per-node.
 *
 * `target` may be a `MotionPoint[]` (test ergonomics) or a prebuilt
 * `ReadonlyMap<id, point>` (hot path — the caller builds the map once and
 * passes it every frame to avoid a per-frame rebuild).
 */
export function entranceFrame(
  start: readonly MotionPoint[],
  target: readonly MotionPoint[] | ReadonlyMap<string, MotionPoint>,
  alpha: number,
): MotionPoint[] {
  const t = clamp(alpha);
  const targetMap: ReadonlyMap<string, MotionPoint> = Array.isArray(target)
    ? new Map(target.map((p) => [p.id, p]))
    : (target as ReadonlyMap<string, MotionPoint>);
  return start.map((s) => {
    const tg = targetMap.get(s.id);
    // Node absent from target — keep last known position. Return a COPY,
    // never the aliased input ref, so callers can't mutate `start` through
    // the result.
    if (!tg) return { id: s.id, x: s.x, y: s.y };
    return {
      id: s.id,
      x: lerp(s.x, tg.x, t),
      y: lerp(s.y, tg.y, t),
    };
  });
}

/** Linear interpolation a→b by t. (t eased upstream — Manim model.) */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Bounds clamp (Phase 2 / Unit 3 drag) ──

/**
 * Clamp a coordinate so a node of the given `radius` stays fully inside a
 * `[0, max]` axis — i.e. confine `value` to `[radius, max - radius]`.
 * Used per-axis during drag (`clampX = clampToBounds(x, r, width)`,
 * `clampY = clampToBounds(y, r, height)`) so a dragged node can never be
 * pulled off-canvas (there is no zoom/pan to recover it).
 *
 * Degenerate case: when the node is larger than the canvas
 * (`radius > max - radius`, i.e. `2*radius > max`), the valid interval
 * inverts. We collapse to the canvas midpoint (`max / 2`) so the node stays
 * centred and on-screen rather than snapping to a meaningless edge.
 */
export function clampToBounds(value: number, radius: number, max: number): number {
  const lo = radius;
  const hi = max - radius;
  if (lo > hi) return max / 2;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// ── Zoom: fit-to-view transform (Plan graph-zoom) ──

/** Axis-aligned bounding box of the node positions, in graph coordinates. */
export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A computed fit-to-view transform: scale `k`, translate `(x, y)`. Named
 * `FitTransform` (not `ZoomTransform`) to avoid shadowing d3's own
 * `ZoomTransform` class — this is a plain POJO, not a d3 instance.
 */
export interface FitTransform {
  k: number;
  x: number;
  y: number;
}

/**
 * Pure "camera fit" math: compute the d3-zoom transform that frames `bounds`
 * (graph coordinates) inside a `width × height` viewport, leaving `padding`
 * px of breathing room on every side, with the content centred.
 *
 * The returned `{k, x, y}` is exactly what d3.zoomIdentity.translate(x,y)
 * .scale(k) encodes: a screen point `p` maps to graph point `(p - (x,y)) / k`,
 * i.e. a graph point `g` lands on screen at `g * k + (x, y)`.
 *
 * `k` is clamped to `[minScale, maxScale]` so the fit never exceeds the
 * zoom behaviour's scaleExtent (otherwise d3 would re-clamp on the next
 * gesture and the view would jump). Degenerate bounds (zero or negative
 * extent — single node, or all nodes coincident) collapse to a centred
 * identity-scale view so we never divide by zero or produce NaN.
 */
export function fitTransform(
  bounds: GraphBounds,
  width: number,
  height: number,
  padding: number,
  minScale: number,
  maxScale: number,
): FitTransform {
  const boundsW = bounds.maxX - bounds.minX;
  const boundsH = bounds.maxY - bounds.minY;
  const availW = width - 2 * padding;
  const availH = height - 2 * padding;

  // Degenerate: no positive extent to fit, or no room to fit it into.
  // Centre the bounds' midpoint in the viewport at scale 1 (clamped).
  if (boundsW <= 0 || boundsH <= 0 || availW <= 0 || availH <= 0) {
    const k = clampScale(1, minScale, maxScale);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    return { k, x: width / 2 - cx * k, y: height / 2 - cy * k };
  }

  const k = clampScale(Math.min(availW / boundsW, availH / boundsH), minScale, maxScale);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: width / 2 - cx * k,
    y: height / 2 - cy * k,
    k,
  };
}

function clampScale(k: number, min: number, max: number): number {
  if (k < min) return min;
  if (k > max) return max;
  return k;
}

// ── Zoom: live-position bounds + d3.zoom event filter ──

/**
 * Pure axis-aligned bounding box over the CURRENT node positions, each node
 * padded outward by its own radius so the box frames whole dots (not centres).
 *
 * Computed at reset time from the live `x/y` (post-drag arrangement), not a
 * stale post-prewarm snapshot — so "reset" fits what the user is actually
 * looking at. `radiusFor` maps a node to its draw radius (production passes
 * `(n) => radiusForTier(n.tier)`). Returns `null` for an empty list (caller
 * falls back to identity) — never NaN/Infinity bounds.
 */
export function boundsFromNodes<T extends { x: number; y: number }>(
  nodes: readonly T[],
  radiusFor: (node: T) => number,
): GraphBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = radiusFor(n);
    if (n.x - r < minX) minX = n.x - r;
    if (n.y - r < minY) minY = n.y - r;
    if (n.x + r > maxX) maxX = n.x + r;
    if (n.y + r > maxY) maxY = n.y + r;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Minimal structural shape of the events d3.zoom hands its `.filter()`. d3
 * dispatches native `MouseEvent | WheelEvent | TouchEvent` here; we read only
 * these fields. `button` is non-optional (closing the optional-undefined hole
 * the inline filter had) so a falsy-coalesce can't hide a missing field.
 */
export interface ZoomFilterEvent {
  type: string;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  target: { closest?: (selector: string) => unknown } | null;
}

/**
 * Pure decision for d3.zoom's `.filter()` (graph-zoom). Extracted from
 * initGraph so it is unit-testable without a DOM.
 *
 *   - Wheel: zoom ONLY with ctrl/⌘ held — plain scroll passes through to the
 *     page (ADV-05; otherwise d3.zoom preventDefaults and hijacks page scroll
 *     whenever the pointer is over the graph). The +/− buttons remain the
 *     discoverable, modifier-free zoom path.
 *   - Pan: primary mouse button only, on the BACKGROUND — a mousedown whose
 *     target is inside a `.graph-node` is rejected so node-drag wins.
 *   - Non-primary button or ctrl-click: rejected.
 *   - Touch: rejected entirely (desktop-first, mirrors drag's touchable(false)).
 */
export function zoomFilter(event: ZoomFilterEvent): boolean {
  if (event.type === 'wheel') {
    // ctrl/⌘+scroll zooms; plain scroll scrolls the page (ADV-05).
    return !!event.ctrlKey || !!event.metaKey;
  }
  if (event.button || event.ctrlKey) return false; // primary button only
  if (event.type.startsWith('touch')) return false; // desktop-first
  // Pan only on the background, not a node. Duck-typed on `closest` so the
  // decision stays DOM-free (unit-testable with a stub) — d3 always passes a
  // real Element as `target` for a mousedown.
  const t = event.target;
  return !(t && typeof t.closest === 'function' && t.closest('.graph-node'));
}

// ── Hover-dim edge opacity ──

/** Edge opacity when both endpoints are in the focused neighbour set. */
const EDGE_OPACITY_LIT = '1';
/** Edge opacity when one or both endpoints fall outside the set. */
const EDGE_OPACITY_DIM = '0.15';

/**
 * Pure decision for the graph-canvas hover-dim: an edge is fully lit only
 * when BOTH of its endpoints are in the focused node's 1-hop neighbour set;
 * otherwise it dims. Extracted so the data-from-id / data-to-id wiring is
 * unit-testable and guarded against transposition (the result is symmetric,
 * but the call site reads the two attributes in order — the test pins both
 * are consulted).
 */
export function edgeOpacity(
  fromId: string,
  toId: string,
  neighbourIds: ReadonlySet<string>,
): string {
  return neighbourIds.has(fromId) && neighbourIds.has(toId)
    ? EDGE_OPACITY_LIT
    : EDGE_OPACITY_DIM;
}
