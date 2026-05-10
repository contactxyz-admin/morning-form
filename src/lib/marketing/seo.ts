/**
 * SEO helpers for the marketing tree.
 *
 * Sitemap, robots.txt, and the [market]/[slug] layout's hreflang block
 * all derive URLs from the same origin resolver so a Vercel preview
 * deployment doesn't ship absolute URLs pointing at production (and a
 * production deploy doesn't accidentally publish preview-domain URLs
 * either).
 *
 * Mirrors the priority chain in src/app/api/auth/request-link/route.ts:
 *   1. NEXT_PUBLIC_APP_URL when explicitly configured.
 *   2. VERCEL_PROJECT_PRODUCTION_URL on Vercel production.
 *   3. VERCEL_BRANCH_URL or VERCEL_URL on Vercel preview.
 *   4. http://localhost:3000 fallback (dev only).
 *
 * Kept module-local rather than factored into a shared helper because
 * sitemap/robots run at build time on Vercel — the function does not
 * receive a request, so the request-origin fallback in the auth flow
 * is not applicable here.
 */
import { env } from '@/lib/env';
import type { Market } from './constants';

export function getCanonicalOrigin(): string {
  const configured = env.NEXT_PUBLIC_APP_URL;
  if (configured && configured !== 'http://localhost:3000') {
    return configured.replace(/\/$/, '');
  }
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (vercelEnv === 'preview') {
    const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }
  return 'http://localhost:3000';
}

/**
 * Build an absolute canonical URL for a marketing page. Pass slug for
 * anchor pages, omit it for the market homepage.
 */
export function buildCanonicalUrl(market: Market, slug?: string): string {
  const origin = getCanonicalOrigin();
  return slug ? `${origin}/${market}/${slug}` : `${origin}/${market}`;
}
