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

/**
 * Clamped ease-out cubic (fast start, gentle settle).
 * Phase 2 (deferred): the drag spring-back will ease released nodes home
 * with this curve. Kept here so the Phase 2 wiring imports a tested
 * primitive rather than re-deriving it.
 */
export function easeOutCubic(t: number): number {
  const c = clamp(t);
  return 1 - Math.pow(1 - c, 3);
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
