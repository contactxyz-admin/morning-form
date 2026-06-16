import { describe, expect, it } from 'vitest';
import { tickPosition, nextPlayIndex, revealStaggerOrder } from './scrubber';

describe('tickPosition', () => {
  it('places the earliest stop at 0% and the latest at 100%', () => {
    expect(tickPosition(0, 0, 100)).toBe(0);
    expect(tickPosition(100, 0, 100)).toBe(100);
  });
  it('places a midpoint proportionally', () => {
    expect(tickPosition(25, 0, 100)).toBe(25);
    expect(tickPosition(50, 0, 100)).toBe(50);
  });
  it('degenerate track (single stop, max <= min) → 0% (no divide-by-zero)', () => {
    expect(tickPosition(5, 5, 5)).toBe(0);
  });
});

describe('nextPlayIndex', () => {
  it('advances toward the end', () => {
    expect(nextPlayIndex(0, 6)).toBe(1);
    expect(nextPlayIndex(4, 6)).toBe(5);
  });
  it('returns null at the last stop (timeline complete)', () => {
    expect(nextPlayIndex(5, 6)).toBeNull();
  });
  it('returns null when there is nothing to play (<= 1 stop)', () => {
    expect(nextPlayIndex(0, 1)).toBeNull();
    expect(nextPlayIndex(0, 0)).toBeNull();
  });
});

describe('revealStaggerOrder', () => {
  it('orders by tier ascending, then id', () => {
    const order = revealStaggerOrder([
      { id: 'b', tier: 2 },
      { id: 'a', tier: 1 },
      { id: 'c', tier: 1 },
    ]);
    expect(order.get('a')).toBe(0); // tier 1, id 'a'
    expect(order.get('c')).toBe(1); // tier 1, id 'c'
    expect(order.get('b')).toBe(2); // tier 2 last
  });
  it('a single revealing node gets index 0', () => {
    expect(revealStaggerOrder([{ id: 'x', tier: 3 }]).get('x')).toBe(0);
  });
  it('is deterministic — same input → same order', () => {
    const input = [
      { id: 'n2', tier: 1 },
      { id: 'n1', tier: 1 },
    ];
    expect(Array.from(revealStaggerOrder(input).entries())).toEqual(
      Array.from(revealStaggerOrder(input).entries()),
    );
  });
  it('does not mutate the input array', () => {
    const input = [
      { id: 'b', tier: 2 },
      { id: 'a', tier: 1 },
    ];
    revealStaggerOrder(input);
    expect(input[0].id).toBe('b'); // original order preserved
  });
});
