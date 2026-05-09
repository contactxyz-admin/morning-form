import { NextResponse, type NextRequest } from 'next/server';
import { assertAuthEnv } from '@/lib/env';
import {
  ANONYMOUS_COOKIE,
  ANONYMOUS_COOKIE_MAX_AGE_S,
  MARKET_COOKIE,
} from '@/lib/marketing/constants';
import { inferMarketFromCountryCode, isMarket } from '@/lib/marketing/market';
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
 * For `/share/*` matches (the public DPP view), `/r/*` matches (the
 * public demo-slug URL), and `/demo*` matches (the no-account
 * synthetic-persona walkthrough), we do NOT require auth. We do set
 * security headers so these pages can't be indexed, framed, or
 * embedded: no-index/no-cache for crawlers, DENY for framing, and a
 * `frame-ancestors 'none'` CSP as belt-and-braces. Token / slug
 * resolution still happens in the SSR handler itself.
 *
 * Marketing pages, the sign-in flow, auth endpoints, and provider
 * webhooks stay public and are excluded by the matcher below.
 */
export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  // Multi-market geo redirect at `/` (U1 of the SEO/GEO plan).
  // Cookie wins over geo so the in-page banner override sticks.
  // Sub-paths under `/uk/...` and `/us/...` are NOT in the matcher
  // and serve unconditionally per their market.
  if (path === '/') {
    const cookieMarket = request.cookies.get(MARKET_COOKIE)?.value;
    const market = isMarket(cookieMarket)
      ? cookieMarket
      : inferMarketFromCountryCode(request.headers.get('x-vercel-ip-country'));
    const target = new URL(`/${market}`, request.nextUrl);
    // Preserve search + hash so paid-search attribution (utm_*, gclid, ref)
    // survives the geo redirect. Without this, every visitor landing on `/`
    // from an ad loses their source params before reaching the market page.
    target.search = request.nextUrl.search;
    target.hash = request.nextUrl.hash;
    return NextResponse.redirect(target);
  }

  // Marketing tree (/uk/*, /us/*): public, no auth, but we set the
  // mf_anon cookie on first paint so the visit-beacon and the future
  // signup path can resolve a consistent anonymous-visitor id. Cookie is
  // httpOnly (the beacon API route reads it server-side; client never
  // needs the value) and ~13 months long so returning visits attribute
  // back to the same id.
  if (
    path === '/uk' ||
    path === '/us' ||
    path.startsWith('/uk/') ||
    path.startsWith('/us/')
  ) {
    const res = NextResponse.next();
    if (!request.cookies.get(ANONYMOUS_COOKIE)?.value) {
      res.cookies.set(ANONYMOUS_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ANONYMOUS_COOKIE_MAX_AGE_S,
        path: '/',
      });
    }
    return res;
  }

  if (
    path.startsWith('/share/') ||
    path.startsWith('/r/') ||
    path === '/demo' ||
    path.startsWith('/demo/')
  ) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains',
    );
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
    '/',
    '/uk',
    '/us',
    '/uk/:path*',
    '/us/:path*',
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
    '/api/insights/:path*',
    '/api/intake/:path*',
    '/api/scribe/:path*',
    '/api/share/:path*',
    '/api/suggestions',
    '/api/topics/:path*',
    '/share/:path*',
    '/r/:path*',
    '/demo',
    '/demo/:path*',
  ],
};
