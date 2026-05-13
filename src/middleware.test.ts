import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from './middleware';

interface RequestOptions {
  cookie?: string;
  country?: string;
}

function makeRequest(url: string, options: RequestOptions | string = {}): NextRequest {
  // Backwards-compat: existing tests pass a cookie string as the second arg.
  const opts = typeof options === 'string' ? { cookie: options } : options;
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.country) headers.set('x-vercel-ip-country', opts.country);
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

describe('middleware', () => {
  it('returns 401 for protected paths without mf_session cookie', () => {
    const res = middleware(makeRequest('/api/intake/documents'));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('mf_session');
  });

  it('passes through when mf_session cookie is present', () => {
    const res = middleware(makeRequest('/api/intake/documents', 'mf_session=raw-token-value'));
    expect(res.status).toBe(200);
  });

  it('401s even when cookie name is close-but-wrong (mf_session_email)', () => {
    const res = middleware(
      makeRequest('/api/intake/documents', 'mf_session_email=legacy@example.com'),
    );
    expect(res.status).toBe(401);
  });

  describe('public-surface security headers', () => {
    // The /share, /r, and /demo branches don't require auth — they pass
    // through with a fixed set of headers that prevent indexing, framing,
    // CDN caching, and MIME-sniffing. Lock the full set so a future edit
    // can't silently drop one (e.g. nosniff was added late by COR-equivalent
    // SEC-002).
    const expected: ReadonlyArray<readonly [string, string | RegExp]> = [
      ['X-Robots-Tag', 'noindex, nofollow, noarchive'],
      ['X-Frame-Options', 'DENY'],
      ['Content-Security-Policy', "frame-ancestors 'none'"],
      ['Referrer-Policy', 'no-referrer'],
      ['X-Content-Type-Options', 'nosniff'],
      ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains'],
      ['Cache-Control', 'private, no-store'],
    ];

    function assertPublicHeaders(path: string) {
      const res = middleware(makeRequest(path));
      expect(res.status).toBe(200);
      for (const [name, value] of expected) {
        const got = res.headers.get(name);
        if (value instanceof RegExp) {
          expect(got).toMatch(value);
        } else {
          expect(got).toBe(value);
        }
      }
    }

    it('applies the full header set on /demo (overview)', () => {
      assertPublicHeaders('/demo');
    });

    it('applies the full header set on /demo/ask', () => {
      assertPublicHeaders('/demo/ask');
    });

    it('applies the full header set on /share/<token>', () => {
      assertPublicHeaders('/share/abc123');
    });

    it('applies the full header set on /r/<slug>', () => {
      assertPublicHeaders('/r/iron-protocol');
    });

    it('does not 401 the /demo branch when mf_session cookie is absent', () => {
      const res = middleware(makeRequest('/demo'));
      expect(res.headers.get('WWW-Authenticate')).toBeNull();
      expect(res.status).toBe(200);
    });

    // Boundary tests — guard against accidental scope widening if the
    // matcher is ever refactored to a naive `startsWith('/demo')`.
    it('does not treat /demos (no trailing slash) as part of the /demo public branch', () => {
      // Hits the function directly, bypassing the route-matcher; this
      // verifies the in-function check distinguishes `/demo` (public)
      // from `/demos` (would fall through to auth).
      const res = middleware(makeRequest('/demos'));
      expect(res.status).toBe(401);
      expect(res.headers.get('X-Robots-Tag')).toBeNull();
    });

    it('does not treat /share (no trailing slash) as part of the /share/ public branch', () => {
      const res = middleware(makeRequest('/share'));
      expect(res.status).toBe(401);
      expect(res.headers.get('X-Robots-Tag')).toBeNull();
    });
  });

  describe('multi-market geo redirect at /', () => {
    // U1 of the SEO/GEO plan: visitor lands on `/`, gets routed to `/uk`
    // or `/us` based on Vercel Edge geo (`x-vercel-ip-country`). Cookie
    // (mf_market) wins over geo when present, so banner override sticks.
    // Sub-paths under `/uk/...` and `/us/...` are NOT in the matcher and
    // should never enter middleware (we don't test them here — Next's
    // matcher handles that).

    function expectRedirectTo(res: ReturnType<typeof middleware>, target: string | RegExp) {
      // Pin the redirect contract loosely (any 3xx status) so a Next.js
      // upgrade that flips between 307/308 doesn't break every test.
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get('location');
      if (typeof target === 'string') {
        expect(location).toBe(target);
      } else {
        expect(location).toMatch(target);
      }
    }

    it('redirects / to /uk for GB visitors with no cookie', () => {
      const res = middleware(makeRequest('/', { country: 'GB' }));
      expectRedirectTo(res, /\/uk$/);
    });

    it('redirects / to /us for US visitors with no cookie', () => {
      const res = middleware(makeRequest('/', { country: 'US' }));
      expectRedirectTo(res, /\/us$/);
    });

    it('redirects / to /us for visitors from unsupported countries (default fallback)', () => {
      const res = middleware(makeRequest('/', { country: 'FR' }));
      expectRedirectTo(res, /\/us$/);
    });

    it('redirects / to /us when no country header is present (preview deployments)', () => {
      const res = middleware(makeRequest('/'));
      expectRedirectTo(res, /\/us$/);
    });

    it('honours mf_market cookie over geo header (cookie wins)', () => {
      const res = middleware(
        makeRequest('/', { cookie: 'mf_market=us', country: 'GB' }),
      );
      expectRedirectTo(res, /\/us$/);
    });

    it('honours mf_market=uk cookie even when geo says US', () => {
      const res = middleware(
        makeRequest('/', { cookie: 'mf_market=uk', country: 'US' }),
      );
      expectRedirectTo(res, /\/uk$/);
    });

    it('falls through to geo when mf_market cookie has invalid value', () => {
      const res = middleware(
        makeRequest('/', { cookie: 'mf_market=fr', country: 'GB' }),
      );
      // Invalid cookie ignored; geo wins.
      expectRedirectTo(res, /\/uk$/);
    });

    it('preserves the query string through the redirect (paid-search attribution)', () => {
      const res = middleware(
        makeRequest('/?utm_source=google&utm_campaign=fatigue&gclid=xyz', {
          country: 'GB',
        }),
      );
      expectRedirectTo(
        res,
        /\/uk\?utm_source=google&utm_campaign=fatigue&gclid=xyz$/,
      );
    });

    it('preserves the URL hash through the redirect', () => {
      const res = middleware(makeRequest('/#how', { country: 'US' }));
      expectRedirectTo(res, /\/us#how$/);
    });
  });

  describe('marketing tree (/uk/*, /us/*) anonymous-visitor cookie', () => {
    it('sets mf_anon cookie on first visit to a market homepage', () => {
      const res = middleware(makeRequest('/uk'));
      expect(res.status).toBe(200);
      const setCookie = res.cookies.get('mf_anon');
      expect(setCookie?.value).toBeTruthy();
      // UUID v4-ish — 36 chars with hyphens.
      expect(setCookie?.value).toMatch(/^[0-9a-f-]{36}$/);
      expect(setCookie?.httpOnly).toBe(true);
      expect(setCookie?.sameSite).toBe('lax');
    });

    it('sets mf_anon cookie on first visit to a slug page', () => {
      const res = middleware(makeRequest('/uk/fatigue-in-men'));
      expect(res.status).toBe(200);
      expect(res.cookies.get('mf_anon')?.value).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('preserves an existing mf_anon cookie (does not overwrite on every request)', () => {
      const existing = '12345678-1234-1234-1234-123456789012';
      const res = middleware(makeRequest('/uk/fatigue-in-men', { cookie: `mf_anon=${existing}` }));
      expect(res.status).toBe(200);
      // Middleware only sets the cookie when missing; an existing cookie
      // means no Set-Cookie header for mf_anon on this response.
      expect(res.cookies.get('mf_anon')).toBeUndefined();
    });

    it('does not require a session cookie for marketing pages (public)', () => {
      const res = middleware(makeRequest('/uk/fatigue-in-men'));
      expect(res.status).toBe(200);
      expect(res.headers.get('WWW-Authenticate')).toBeNull();
    });
  });

  describe('matcher invariants — MCP auth boundary', () => {
    // The bearer-only `/api/mcp` endpoint must NOT be cookie-session-gated.
    // A regression that widens the matcher to include it would 401 every
    // valid MCP request and break every Claude Desktop / Claude Code /
    // Cursor installation. Lock the invariant.
    it('matcher includes /api/mcp/tokens/:path* (cookie-session-authed)', () => {
      expect(config.matcher).toContain('/api/mcp/tokens/:path*');
    });

    it('matcher does NOT include /api/mcp itself (bearer-only)', () => {
      // Critical: the bearer-only endpoint must escape the session gate.
      // Any string containing '/api/mcp' that does NOT explicitly scope to
      // '/api/mcp/tokens' would silently catch the root MCP route.
      const badMatches = config.matcher.filter(
        (m) => typeof m === 'string' && m.startsWith('/api/mcp') && !m.startsWith('/api/mcp/tokens'),
      );
      expect(badMatches).toEqual([]);
    });
  });
});
