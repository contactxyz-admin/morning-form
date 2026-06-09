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

function lerp(a: number, b: number, t: number): number {
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
