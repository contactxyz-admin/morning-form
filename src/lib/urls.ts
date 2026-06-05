import { env } from '@/lib/env';

/**
 * Resolve the canonical app origin (scheme + host, no trailing slash) for
 * building absolute links in emails. Shared by every route that emails an
 * absolute URL (account deletion confirmation, data-export download link) so
 * the fallback chain lives in exactly one place.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL when it is a real configured value (not the
 *      localhost dev default) — production/preview env override.
 *   2. Vercel-provided host: the production domain on production, the branch/
 *      deployment URL on preview.
 *   3. The incoming request's own origin — the dev/test last resort.
 *
 * In production, if every env-derived branch misses we throw rather than fall
 * back to the request origin: the request host is attacker-controllable
 * (x-forwarded-host poisoning), and emailing an absolute link built from it
 * would let an attacker redirect a victim's confirmation/download link. Vercel
 * always sets VERCEL_ENV (so branch 2 fires there), making the throw
 * unreachable on Vercel; it only guards a misconfigured self-hosted prod.
 */
export function resolveAppOrigin(request: Request): string {
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
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[urls] Cannot resolve a trusted app origin in production: set NEXT_PUBLIC_APP_URL or run on Vercel (VERCEL_ENV). Refusing to fall back to the request host (host-header poisoning guard).',
    );
  }
  return new URL(request.url).origin;
}
