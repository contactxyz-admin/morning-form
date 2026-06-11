import type { MetadataRoute } from 'next';
import { MARKETS } from '@/lib/marketing/constants';
import { getAllSlugs } from '@/lib/marketing/slug-allowlist';
import { buildCanonicalUrl, getCanonicalOrigin } from '@/lib/marketing/seo';

/**
 * Single combined sitemap for both markets.
 *
 * Two-page launch volume doesn't justify a per-market sitemap-index
 * pattern; once we cross ~50 pages or need market-specific submission
 * cadence, split into /uk/sitemap.xml + /us/sitemap.xml + a top-level
 * sitemap-index.xml. For now, one sitemap with both markets is
 * simpler for Search Console + simpler to read.
 *
 * lastModified pulls from the page-data file so editorial reviews
 * automatically refresh the date in Search Console.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const homepages: MetadataRoute.Sitemap = MARKETS.map((market) => ({
    url: buildCanonicalUrl(market),
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1.0,
  }));

  const anchorPages: MetadataRoute.Sitemap = getAllSlugs().map(({ market, slug }) => ({
    url: buildCanonicalUrl(market, slug),
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  // Market-neutral trust pages (src/app/(info)/*) — linked from every
  // marketing footer; indexed deliberately, unlike the noindex /demo.
  const infoPages: MetadataRoute.Sitemap = ['/privacy', '/safety', '/contact'].map((path) => ({
    url: `${getCanonicalOrigin()}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  return [...homepages, ...anchorPages, ...infoPages];
}
