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
});
