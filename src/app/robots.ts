import type { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/lib/marketing/seo';

/**
 * robots.txt for the marketing tree.
 *
 * Allow: /, /uk, /us, /uk/*, /us/*. Disallow everything else — every
 * authenticated surface, every demo/share/r noindex route (already
 * X-Robots-Tag: noindex via middleware, but redundant signal in
 * robots.txt protects against header-stripping intermediaries), the
 * upload tree (Phase 1 surface — not yet ready, never indexable),
 * and every API endpoint.
 *
 * Sitemap pointer is absolute so Search Console + AI-engine crawlers
 * can fetch it without ambiguity about origin.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getCanonicalOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/uk', '/us'],
        disallow: [
          '/api/',
          '/sign-in',
          '/assessment',
          '/processing',
          '/reveal',
          '/setup',
          '/intake',
          '/record',
          '/home',
          '/graph',
          '/topics',
          '/insights',
          '/settings',
          '/protocol',
          '/check-in',
          '/guide',
          '/ask',
          '/you',
          '/share/',
          '/r/',
          '/demo',
          '/upload',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
