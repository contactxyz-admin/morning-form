/**
 * Motion primitives tests (Plan 2026-06-08-001 U1). Pure, DOM-free.
 */
import { describe, expect, it } from 'vitest';
import { smooth, easeOutCubic, entranceFrame } from './motion';

describe('smooth', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
  });

  it('clamps outside [0,1]', () => {
    expect(smooth(-0.5)).toBe(0);
    expect(smooth(1.5)).toBe(1);
  });

  it('is monotonic non-decreasing', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const v = smooth(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('midpoint is strictly between 0 and 1', () => {
    const mid = smooth(0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('easeOutCubic', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('clamps outside [0,1]', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('starts faster than linear (ease-out property)', () => {
    // At t=0.25, ease-out should be ahead of linear.
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });
});

describe('entranceFrame', () => {
  const start = [
    { id: 'a', x: 100, y: 200 },
    { id: 'b', x: 300, y: 400 },
  ];
  const target = [
    { id: 'a', x: 150, y: 250 },
    { id: 'b', x: 350, y: 350 },
  ];

  it('returns start at alpha=0', () => {
    const result = entranceFrame(start, target, 0);
    expect(result).toEqual(start);
  });

  it('returns target at alpha=1', () => {
    const result = entranceFrame(start, target, 1);
    expect(result).toEqual(target);
  });

  it('midpoint is strictly between per-node', () => {
    const result = entranceFrame(start, target, 0.5);
    expect(result[0].x).toBeGreaterThan(100);
    expect(result[0].x).toBeLessThan(150);
    expect(result[0].y).toBeGreaterThan(200);
    expect(result[0].y).toBeLessThan(250);
    expect(result[1].x).toBeGreaterThan(300);
    expect(result[1].x).toBeLessThan(350);
  });

  it('handles empty arrays', () => {
    expect(entranceFrame([], [], 0.5)).toEqual([]);
  });

  it('handles single node', () => {
    const s = [{ id: 'a', x: 0, y: 0 }];
    const t = [{ id: 'a', x: 10, y: 20 }];
    const result = entranceFrame(s, t, 0.5);
    expect(result[0].x).toBe(5);
    expect(result[0].y).toBe(10);
  });

  it('keeps nodes removed from target at their start position', () => {
    const s = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }];
    const t = [{ id: 'a', x: 10, y: 10 }];
    const result = entranceFrame(s, t, 0.5);
    expect(result[1].x).toBe(1);
    expect(result[1].y).toBe(1);
  });

  it('clamps alpha outside [0,1]', () => {
    expect(entranceFrame(start, target, -0.5)).toEqual(start);
    expect(entranceFrame(start, target, 1.5)).toEqual(target);
  });
});
