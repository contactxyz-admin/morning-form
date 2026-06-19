import { describe, expect, it } from 'vitest';
import { median, percentile, round1, round2 } from './stats';

describe('stats', () => {
  it('percentile interpolates and handles single/odd/even input', () => {
    expect(percentile([5], 0.5)).toBe(5);
    expect(percentile([1, 2, 3], 0.5)).toBe(2); // odd → middle
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5); // even → mean of two middle
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3.25);
    expect(() => percentile([], 0.5)).toThrow();
  });

  it('median equals the 50th percentile', () => {
    expect(median([4, 8])).toBe(6);
    expect(median([3, 1, 2])).toBe(2);
  });

  it('round1 / round2 round to 1 / 2 decimals', () => {
    expect(round1(12.34)).toBe(12.3);
    expect(round2(12.345)).toBe(12.35);
  });
});
