/**
 * Pure label de-collision for the graph canvas's always-on (tier-1) labels
 * (plan 2026-06-17-001). DOM-free: the hook measures each label's box via
 * `getBBox` and hands the geometry here, so the nudge logic is unit-testable in
 * vitest's `node` env. Labels only — this NEVER moves a node; it returns a
 * small downward `dy` offset per label that needed room.
 */

export interface LabelBox {
  readonly id: string;
  /** Horizontal centre of the label box in graph space (text-anchor=middle). */
  readonly x: number;
  /** Top edge of the label box in graph space (matches `getBBox().y` semantics). */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DecollideOptions {
  /** Max downward shift applied to any single label (px) — caps the nudge. */
  readonly maxShift: number;
  /** Extra horizontal slack when deciding two labels "share a column" (px). */
  readonly xPad?: number;
  /** Vertical gap kept between two stacked labels (px). */
  readonly yPad?: number;
}

/**
 * Greedy single top→bottom pass: a label that vertically overlaps an
 * already-placed label it shares a column with is pushed DOWN just enough to
 * clear it (capped at `maxShift`). Returns `id → extra downward dy`, only for
 * the labels that moved. Deterministic (stable sort by `y` then `id`); the
 * input array is never mutated.
 *
 * A capped shift may leave a residual overlap — that's the intended "small
 * nudge", not a full label-placement solver (see plan Scope Boundaries).
 */
export function decollideLabels(
  boxes: readonly LabelBox[],
  opts: DecollideOptions,
): Map<string, number> {
  const xPad = opts.xPad ?? 0;
  const yPad = opts.yPad ?? 0;
  const offsets = new Map<string, number>();
  if (boxes.length < 2) return offsets;

  // Sort top→bottom (id tiebreak for determinism); place on effective copies.
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const placed: Array<{ x: number; bottom: number; halfW: number }> = [];

  for (const box of sorted) {
    const halfW = box.width / 2;
    let top = box.y;
    // Push below every already-placed label whose column this one shares.
    let minTop = top;
    for (const p of placed) {
      const sharesColumn = Math.abs(box.x - p.x) < halfW + p.halfW + xPad;
      if (sharesColumn) minTop = Math.max(minTop, p.bottom + yPad);
    }
    const shift = Math.min(Math.max(minTop - top, 0), opts.maxShift);
    if (shift > 0) {
      offsets.set(box.id, shift);
      top += shift;
    }
    placed.push({ x: box.x, bottom: top + box.height, halfW });
  }
  return offsets;
}
