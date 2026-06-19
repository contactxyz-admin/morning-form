import { describe, expect, it } from 'vitest';
import { decollideLabels, type LabelBox } from './labels';

const box = (id: string, x: number, y: number, width = 100, height = 10): LabelBox => ({
  id,
  x,
  y,
  width,
  height,
});

describe('decollideLabels', () => {
  it('returns no offsets for an empty or single-label set', () => {
    expect(decollideLabels([], { maxShift: 20 }).size).toBe(0);
    expect(decollideLabels([box('a', 0, 0)], { maxShift: 20 }).size).toBe(0);
  });

  it('leaves horizontally-disjoint labels untouched', () => {
    // Same y, but x-ranges don't overlap (centres 200 apart, half-widths 50+50).
    const offsets = decollideLabels([box('a', 0, 0), box('b', 200, 0)], { maxShift: 20 });
    expect(offsets.size).toBe(0);
  });

  it('pushes the lower of two stacked labels down by the overlap', () => {
    // a: top 0, bottom 10. b: top 5 — overlaps by 5; clears to top 10 → shift 5.
    const offsets = decollideLabels([box('a', 0, 0), box('b', 0, 5)], { maxShift: 20 });
    expect(offsets.get('a')).toBeUndefined(); // top label stays put
    expect(offsets.get('b')).toBe(5);
  });

  it('keeps an extra yPad gap between stacked labels', () => {
    const offsets = decollideLabels([box('a', 0, 0), box('b', 0, 5)], { maxShift: 20, yPad: 2 });
    expect(offsets.get('b')).toBe(7); // clears to bottom(10) + yPad(2) = 12, from top 5
  });

  it('caps the shift at maxShift even when more room is needed', () => {
    const offsets = decollideLabels([box('a', 0, 0), box('b', 0, 1)], { maxShift: 3 });
    expect(offsets.get('b')).toBe(3); // needs 9, capped to 3
  });

  it('cascades cumulatively down a stack (each still capped)', () => {
    const offsets = decollideLabels(
      [box('a', 0, 0), box('b', 0, 2), box('c', 0, 4)],
      { maxShift: 100 },
    );
    expect(offsets.get('b')).toBe(8); // a.bottom 10 - b.top 2
    expect(offsets.get('c')).toBe(16); // b.bottom 20 - c.top 4
  });

  it('respects horizontal padding when deciding shared columns', () => {
    // Centres 100 apart, half-widths 50+50 = touching exactly; xPad makes them share.
    const noPad = decollideLabels([box('a', 0, 0), box('b', 100, 0)], { maxShift: 20 });
    expect(noPad.size).toBe(0);
    const withPad = decollideLabels([box('a', 0, 0), box('b', 100, 0)], { maxShift: 20, xPad: 4 });
    expect(withPad.get('b')).toBe(10);
  });

  it('is deterministic and does not mutate the input', () => {
    const input = [box('b', 0, 2), box('a', 0, 0)];
    const first = Array.from(decollideLabels(input, { maxShift: 20 }).entries());
    const second = Array.from(decollideLabels(input, { maxShift: 20 }).entries());
    expect(first).toEqual(second);
    expect(input[0].id).toBe('b'); // original order preserved
  });
});
