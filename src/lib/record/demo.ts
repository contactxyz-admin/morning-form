/**
 * Public demo-slug registry for `/r/[slug]` URLs.
 *
 * Slugs are a tiny hand-maintained TS map: `slug → email`. We use
 * the demo user's email as the stable identifier because `User.id`
 * is a cuid that changes on every fresh database — the email is
 * the one thing a re-seeded demo user always re-creates. The SSR
 * handler resolves the email to a `User.id` at request time.
 *
 * `enabled: false` returns `null` from `resolveDemoSlug`, letting
 * us hide a slug without removing the route.
 *
 * Promote to a `DemoSlug` model when we need a second slug or
 * dynamic enable/disable. The demo user itself is seeded by
 * `prisma/seed.ts` (R8).
 */

import { DEMO_NAVIGABLE_RECORD_SLUG } from '../../../prisma/fixtures/demo-navigable-record';

export { DEMO_NAVIGABLE_RECORD_SLUG };

export interface DemoSlugRecord {
  slug: string;
  /** Email used to locate the seeded demo user at request time. */
  email: string;
  enabled: boolean;
}

const DEMO_SLUGS: Readonly<Record<string, DemoSlugRecord>> = {
  [DEMO_NAVIGABLE_RECORD_SLUG]: {
    slug: DEMO_NAVIGABLE_RECORD_SLUG,
    email: 'demo@morningform.com',
    enabled: true,
  },
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
