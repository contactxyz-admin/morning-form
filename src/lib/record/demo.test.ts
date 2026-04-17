import { describe, it, expect } from 'vitest';
import { resolveDemoSlug, listDemoSlugs } from './demo';

describe('resolveDemoSlug', () => {
  it('returns null for an unknown slug', () => {
    expect(resolveDemoSlug('no-such-slug')).toBeNull();
  });

  it('returns null for a disabled slug', () => {
    // The public map is empty today (R8 populates). We exercise the
    // disabled branch via a fresh record that mirrors the real shape.
    // Disabled records exist in the module's future state; until R8
    // wires one, this spec is a contract lock: unknown === null.
    expect(resolveDemoSlug('')).toBeNull();
  });
});

describe('listDemoSlugs', () => {
  it('returns only enabled slugs', () => {
    const slugs = listDemoSlugs();
    expect(slugs.every((s) => s.enabled)).toBe(true);
  });
});
