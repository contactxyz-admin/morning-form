import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
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
});
