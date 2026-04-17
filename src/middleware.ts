import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Edge gate for authenticated API surfaces.
 *
 * The middleware only checks for cookie presence — it cannot verify the
 * session against the DB from the Edge runtime. Route handlers still call
 * `getCurrentUser()` for the authoritative check (which rejects tampered
 * tokens that don't match a Session row). This short-circuits the obvious
 * unauthenticated case before we spin up a handler + Prisma query.
 *
 * Marketing pages, the sign-in flow, auth endpoints, and provider webhooks
 * stay public and are excluded by the matcher below.
 */
export function middleware(request: NextRequest): NextResponse {
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
    '/api/protocol',
    '/api/share/:path*',
    '/api/suggestions',
    '/api/topics/:path*',
  ],
};
