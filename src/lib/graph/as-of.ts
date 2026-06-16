/**
 * Pure time-scrubber logic for the `/demo/record` graph (plan 2026-06-15-001).
 *
 * The scrubber lets a viewer drag an `asOf` date back through the persona's
 * timeline; nodes whose evidence postdates `asOf` dim, and a node's "what
 * changed" ring stays hidden until `asOf` reaches the change date. These
 * helpers hold all of that decision logic so the canvas effect that applies
 * it is a thin opacity applicator (vitest is a `node` env — no DOM to test).
 *
 * `asOfEpoch == null` is the scrubber-off / authed-path signal: everything is
 * present, decorations show — i.e. byte-for-byte today's behaviour.
 */

import type { GraphNodeWire, NodeChangeWire } from '@/types/graph';

export type AsOfVisibility = 'present' | 'dimmed';

/** ISO date → epoch ms; null/empty/invalid → null. */
function epoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Is a node visible as-of the scrub date? A node with no `firstSeenAt` is
 * "always known". Born exactly at `asOf` counts as present (boundary
 * inclusive). `asOfEpoch == null` → always present.
 */
export function asOfVisibility(
  firstSeenAt: string | null | undefined,
  asOfEpoch: number | null,
): AsOfVisibility {
  if (asOfEpoch == null) return 'present';
  const born = epoch(firstSeenAt);
  if (born == null) return 'present';
  return born <= asOfEpoch ? 'present' : 'dimmed';
}

/**
 * Should a node's change decoration (ring/badge/pulse) show as-of the scrub
 * date? Visible once `asOf` reaches the change's `afterAt` (boundary
 * inclusive). `asOfEpoch == null` → show. No change → nothing to show.
 */
export function changeVisibleAsOf(
  change: NodeChangeWire | undefined,
  asOfEpoch: number | null,
): boolean {
  if (asOfEpoch == null) return true;
  if (!change) return false;
  const at = epoch(change.afterAt);
  if (at == null) return false;
  return at <= asOfEpoch;
}

/**
 * The sorted, de-duplicated stop epochs for a node set: every distinct
 * `firstSeenAt` plus every change `afterAt` (the date a ring comes due). The
 * scrubber snaps to these. Empty (no temporal data) → `[]`; the caller
 * degrades to a single "now" stop.
 */
export function scrubberStops(
  nodes: readonly Pick<GraphNodeWire, 'firstSeenAt' | 'change'>[],
): number[] {
  const set = new Set<number>();
  for (const n of nodes) {
    const born = epoch(n.firstSeenAt);
    if (born != null) set.add(born);
    const at = epoch(n.change?.afterAt);
    if (at != null) set.add(at);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Composed node opacity for the scrubber (plan 2026-06-16-001): the time-ghost
 * wins over hover emphasis. Returns a number in `[0,1]` — the eased-tween
 * target. (The authed/null path keeps its own `''`-reset instant logic in
 * graph-canvas and never calls this.)
 */
export function composeNodeOpacity(
  timeDimmed: boolean,
  hasEmphasis: boolean,
  isNeighbour: boolean,
  dim: number,
): number {
  if (timeDimmed) return dim;
  if (hasEmphasis) return isNeighbour ? 1 : 0.2;
  return 1;
}
