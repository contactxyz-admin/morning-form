import { describe, it, expect } from 'vitest';
import { resolveDemoSlug, listDemoSlugs } from './demo';

describe('resolveDemoSlug', () => {
  it('returns the demo-navigable-record mapping', () => {
    const record = resolveDemoSlug('demo-navigable-record');
    expect(record).toMatchObject({
      slug: 'demo-navigable-record',
      email: 'demo@morningform.com',
      enabled: true,
    });
  });

  it('returns null for an unknown slug', () => {
    expect(resolveDemoSlug('no-such-slug')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveDemoSlug('')).toBeNull();
  });
});

describe('listDemoSlugs', () => {
  it('returns only enabled slugs', () => {
    const slugs = listDemoSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs.every((s) => s.enabled)).toBe(true);
  });
});
