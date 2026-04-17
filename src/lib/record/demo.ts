/**
 * Public demo-slug registry for `/r/[slug]` URLs.
 *
 * Slugs are a tiny hand-maintained TS map: `slug → userId`. No DB schema.
 * Promote to a `DemoSlug` model when we need a second slug or dynamic
 * enable/disable. `enabled: false` returns 404, not 500, so we can hide
 * a slug without tearing down the route.
 *
 * The URL shape — `/r/<slug>` — stays stable across re-seeds: we can
 * rebuild the demo user (new UUID) without breaking the shared link.
 *
 * Seeding of the demo user itself lives in R8. Until R8 runs, the map
 * is empty and every `/r/*` request 404s.
 */

export interface DemoSlugRecord {
  slug: string;
  userId: string;
  enabled: boolean;
}

const DEMO_SLUGS: Readonly<Record<string, DemoSlugRecord>> = {
  // R8 populates this map with the seeded demo user id.
};

export function resolveDemoSlug(slug: string): DemoSlugRecord | null {
  const record = DEMO_SLUGS[slug];
  if (!record || !record.enabled) return null;
  return record;
}

/** Enumerate every enabled slug. Used by tests and any future index page. */
export function listDemoSlugs(): DemoSlugRecord[] {
  return Object.values(DEMO_SLUGS).filter((r) => r.enabled);
}
