/**
 * Unit tests for the node-env-testable pure pieces of useGraphState
 * (Plan 2026-06-08-001 R5). The hook itself needs a DOM/SVG; here we only
 * exercise the extracted `computeMotionAllowed` decision, which must be
 * safe in node/SSR and honour prefers-reduced-motion.
 */
import { describe, expect, it } from 'vitest';
import { computeMotionAllowed } from './use-graph-state';

describe('computeMotionAllowed', () => {
  it('returns false when window is undefined (SSR / node)', () => {
    expect(computeMotionAllowed(undefined)).toBe(false);
  });

  it('returns false when matchMedia is absent on window', () => {
    const win = {} as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(false);
  });

  it('returns false when the user prefers reduced motion', () => {
    const win = {
      matchMedia: (q: string) => ({
        matches: q.includes('reduce'),
      }),
    } as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(false);
  });

  it('returns true when motion is allowed (no reduce preference)', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(true);
  });

  it('does not throw when called with the default (real or absent window)', () => {
    expect(() => computeMotionAllowed()).not.toThrow();
  });
});
