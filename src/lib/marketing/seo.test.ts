import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCanonicalUrl, getCanonicalOrigin } from './seo';

describe('getCanonicalOrigin', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear Vercel env so tests are deterministic; restore after each.
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to localhost when no env is set', async () => {
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('http://localhost:3000');
  });

  it('honours NEXT_PUBLIC_APP_URL when explicitly configured', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://morning-form.vercel.app';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form.vercel.app');
  });

  it('strips trailing slash from NEXT_PUBLIC_APP_URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://morning-form.vercel.app/';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form.vercel.app');
  });

  it('treats the env.ts default localhost as "not set" so prod does not silently ship localhost URLs', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'morning-form.vercel.app';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form.vercel.app');
  });

  it('uses VERCEL_PROJECT_PRODUCTION_URL on production', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'morning-form.vercel.app';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form.vercel.app');
  });

  it('prefers VERCEL_BRANCH_URL over VERCEL_URL on preview', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_BRANCH_URL = 'morning-form-feat-x.vercel.app';
    process.env.VERCEL_URL = 'morning-form-abc123-team.vercel.app';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form-feat-x.vercel.app');
  });

  it('falls through to VERCEL_URL on preview when no branch URL exists', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'morning-form-abc123-team.vercel.app';
    const { getCanonicalOrigin: fn } = await import('./seo');
    expect(fn()).toBe('https://morning-form-abc123-team.vercel.app');
  });
});

describe('buildCanonicalUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://morning-form.vercel.app';
    vi.resetModules();
  });

  it('builds a market homepage URL when no slug is provided', async () => {
    const { buildCanonicalUrl: fn } = await import('./seo');
    expect(fn('uk')).toBe('https://morning-form.vercel.app/uk');
    expect(fn('us')).toBe('https://morning-form.vercel.app/us');
  });

  it('builds an anchor-page URL when slug is provided', async () => {
    const { buildCanonicalUrl: fn } = await import('./seo');
    expect(fn('uk', 'fatigue-in-men')).toBe(
      'https://morning-form.vercel.app/uk/fatigue-in-men',
    );
    expect(fn('us', 'fatigue-in-men')).toBe(
      'https://morning-form.vercel.app/us/fatigue-in-men',
    );
  });
});
