import { NextResponse, type NextRequest } from 'next/server';
import { assertAuthEnv } from '@/lib/env';
import { SESSION_COOKIE } from '@/lib/session-cookie';

// Module-scope boot check: fails the first Edge invocation fast if prod
// is missing SESSION_SECRET or RESEND_API_KEY, instead of silently falling
// through to dev defaults on hot paths. No-ops outside production.
assertAuthEnv();

/**
 * Edge gate for authenticated API surfaces and public share pages.
 *
 * For `/api/*` matches, the middleware only checks for cookie presence —
 * it cannot verify the session against the DB from the Edge runtime.
 * Route handlers still call `getCurrentUser()` for the authoritative
 * check (which rejects tampered tokens that don't match a Session row).
 *
 * For `/share/*` matches (the public DPP view) and `/r/*` matches (the
 * public demo-slug URL), we do NOT require auth. We do set security
 * headers so these pages can't be indexed, framed, or embedded:
 * no-index/no-cache for crawlers, DENY for framing, and a
 * `frame-ancestors 'none'` CSP as belt-and-braces. Token / slug
 * resolution still happens in the SSR handler itself.
 *
 * Marketing pages, the sign-in flow, auth endpoints, and provider
 * webhooks stay public and are excluded by the matcher below.
 */
export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/share/') || path.startsWith('/r/')) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Authentication required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Cookie name="mf_session"' } },
  );
}

/**
 * Match every `/api/*` path except the auth endpoints (which must remain
 * reachable when logged out) and the Terra webhook (provider-signed, not
 * user-authenticated).
 */
export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/assessment',
    '/api/check-in',
    '/api/guide',
    '/api/graph/:path*',
    '/api/health/connect',
    '/api/health/connections',
    '/api/health/sync',
    '/api/health/apple-health',
    '/api/health/callback/:path*',
    '/api/intake/:path*',
    '/api/scribe/:path*',
    '/api/share/:path*',
    '/api/suggestions',
    '/api/topics/:path*',
    '/share/:path*',
    '/r/:path*',
  ],
};
