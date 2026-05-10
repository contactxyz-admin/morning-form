/**
 * Slug allowlist + page registry.
 *
 * Phase 0: explicit imports. Type-safe, build-time-validated, and the
 * single source of truth for which marketing pages exist. The visit-beacon
 * (U3 of plan) validates inbound `slug` values against this list to
 * prevent analytics pollution; `generateStaticParams` consumes the same
 * list to enumerate the build-time route table.
 *
 * Phase 2: the marketing-scaffold CLI edits this file as part of the
 * scaffolding flow. Glob-based variants are deferred until the scaffolder
 * is the bottleneck.
 */
import fatigueUk from '../../../content/marketing/uk/fatigue-in-men';
import fatigueUs from '../../../content/marketing/us/fatigue-in-men';

import type { Market } from './constants';
import type { MarketingPage } from './page-schema';

const REGISTRY: ReadonlyArray<MarketingPage> = [fatigueUk, fatigueUs];

/**
 * Lookup a single page by market + slug. Returns null when the page
 * does not exist (used by [market]/[slug]/page.tsx to 404 unknown slugs).
 */
export function getMarketingPage(market: Market, slug: string): MarketingPage | null {
  return REGISTRY.find((p) => p.market === market && p.slug === slug) ?? null;
}

/**
 * All slugs currently published, grouped by market. Used by sitemap
 * generation (U4) and by `generateStaticParams` for the dynamic route.
 */
export function getAllSlugs(): ReadonlyArray<{ market: Market; slug: string }> {
  return REGISTRY.map((p) => ({ market: p.market, slug: p.slug }));
}

/**
 * Slugs available for a given market. Used by hreflang generation —
 * a UK page with no US equivalent emits no en-US hreflang, and vice
 * versa.
 */
export function getSlugsForMarket(market: Market): ReadonlyArray<string> {
  return REGISTRY.filter((p) => p.market === market).map((p) => p.slug);
}

/**
 * True when both UK and US versions of a slug exist. Pages cross-link
 * via hreflang only when their counterpart actually ships.
 */
export function hasCounterpart(market: Market, slug: string): boolean {
  const other: Market = market === 'uk' ? 'us' : 'uk';
  return REGISTRY.some((p) => p.market === other && p.slug === slug);
}
