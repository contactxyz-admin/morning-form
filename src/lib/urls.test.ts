import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// resolveAppOrigin reads NEXT_PUBLIC_APP_URL via @/lib/env and the Vercel/
// NODE_ENV vars off process.env directly. Mock env with a mutable object so
// each test can set NEXT_PUBLIC_APP_URL, and snapshot/restore process.env.
const { envMock } = vi.hoisted(() => ({
  envMock: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } as { NEXT_PUBLIC_APP_URL: string },
}));

vi.mock('@/lib/env', () => ({ env: envMock }));

import { resolveAppOrigin } from './urls';

const VERCEL_KEYS = [
  'VERCEL_ENV',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  // Start each test from a clean slate: no Vercel hints, NODE_ENV unset
  // (the production-throw branch is opt-in per test via vi.stubEnv).
  saved = {};
  for (const k of VERCEL_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  envMock.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
});

afterEach(() => {
  for (const k of VERCEL_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllEnvs();
});

function req(url = 'https://request-host.example/api/x'): Request {
  return new Request(url);
}

describe('resolveAppOrigin', () => {
  it('uses NEXT_PUBLIC_APP_URL when explicitly configured (trailing slash stripped)', () => {
    envMock.NEXT_PUBLIC_APP_URL = 'https://app.morningform.com/';
    expect(resolveAppOrigin(req())).toBe('https://app.morningform.com');
  });

  it('uses VERCEL_PROJECT_PRODUCTION_URL on Vercel production', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'morning-form.vercel.app';
    expect(resolveAppOrigin(req())).toBe('https://morning-form.vercel.app');
  });

  it('uses VERCEL_BRANCH_URL on Vercel preview', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_BRANCH_URL = 'morning-form-git-feat.vercel.app';
    expect(resolveAppOrigin(req())).toBe('https://morning-form-git-feat.vercel.app');
  });

  it('throws in production when no trusted origin is configured (host-poisoning guard)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    // No NEXT_PUBLIC_APP_URL override, no VERCEL_ENV → must refuse the request host.
    expect(() => resolveAppOrigin(req('https://attacker.example/x'))).toThrow(/trusted app origin/i);
  });

  it('falls back to the request origin in dev', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveAppOrigin(req('https://dev-host.example/api/x'))).toBe('https://dev-host.example');
  });
});
