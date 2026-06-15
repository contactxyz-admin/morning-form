import { describe, expect, it } from 'vitest';
import { tickPosition, nextPlayIndex } from './scrubber';

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
