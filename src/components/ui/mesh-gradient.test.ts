import { describe, expect, it } from 'vitest';
import { generateMeshGradient, hashString } from './mesh-gradient-core';

describe('hashString', () => {
  it('is deterministic for the same input', () => {
    expect(hashString('source-abc')).toBe(hashString('source-abc'));
  });

  it('distinguishes distinct inputs', () => {
    expect(hashString('source-abc')).not.toBe(hashString('source-xyz'));
  });

  it('returns a non-negative integer', () => {
    const h = hashString('anything');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });
});

describe('generateMeshGradient', () => {
  it('is deterministic for the same seed', () => {
    expect(generateMeshGradient('x')).toBe(generateMeshGradient('x'));
  });

  it('variant tweaks the output', () => {
    expect(generateMeshGradient('x', 'pdf')).not.toBe(generateMeshGradient('x', 'intake'));
  });

  it('different seeds produce different gradients', () => {
    expect(generateMeshGradient('source-1')).not.toBe(generateMeshGradient('source-2'));
  });

  it('composes exactly three radial stops plus a base color', () => {
    const out = generateMeshGradient('any');
    const radials = out.match(/radial-gradient/g);
    expect(radials).toHaveLength(3);
    // Base color is the final comma-separated layer.
    expect(out.endsWith(')')).toBe(true);
  });

  it('stays within the paper palette (lightness 76–92, saturation ≤ 50)', () => {
    // Sample 50 seeds — exhaustively check every hsl() tuple lies in bounds.
    for (let i = 0; i < 50; i += 1) {
      const out = generateMeshGradient(`seed-${i}`);
      const tuples = Array.from(out.matchAll(/hsl\((-?\d+), (\d+)%, (\d+)%\)/g));
      expect(tuples.length).toBeGreaterThanOrEqual(4);
      for (const [, , satStr, litStr] of tuples) {
        const sat = Number(satStr);
        const lit = Number(litStr);
        expect(sat).toBeLessThanOrEqual(50);
        expect(sat).toBeGreaterThanOrEqual(12);
        expect(lit).toBeGreaterThanOrEqual(76);
        expect(lit).toBeLessThanOrEqual(92);
      }
    }
  });
});
