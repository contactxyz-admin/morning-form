import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

async function loadEnvModule(overrides: NodeJS.ProcessEnv) {
  vi.resetModules();
  process.env = { ...originalEnv, ...overrides };
  return import('./env');
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('assertAuthEnv', () => {
  it('requires RESEND_FROM in production', async () => {
    const { assertAuthEnv } = await loadEnvModule({
      NODE_ENV: 'production',
      SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM: '',
    });

    expect(() => assertAuthEnv()).toThrow(/RESEND_FROM/);
  });

  it('accepts complete production auth email config', async () => {
    const { assertAuthEnv } = await loadEnvModule({
      NODE_ENV: 'production',
      SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM: 'login@example.com',
    });

    expect(() => assertAuthEnv()).not.toThrow();
  });
});
