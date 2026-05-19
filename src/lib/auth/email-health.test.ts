import { describe, expect, it, vi, beforeEach } from 'vitest';

// Must be hoisted before the module under test is imported so the mock
// replaces the real incrementDiagnostic at the time email-health.ts binds it.
const incrementMock = vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined);

vi.mock('@/lib/marketing/diagnostic', () => ({
  incrementDiagnostic: (key: string) => incrementMock(key),
}));

// email-health imports ResendAuthError / ResendTransientError from email.ts.
// We re-export the real constructors so our test can instantiate them without
// hitting the Resend network.
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    ALLOW_DEMO_BYPASS: '',
  },
  assertAuthEnv: () => {},
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
}));

import { recordEmailSendFailure, COUNTER_KEYS } from './email-health';
import { ResendAuthError, ResendTransientError } from './email';

beforeEach(() => {
  incrementMock.mockClear();
});

describe('recordEmailSendFailure', () => {
  it('increments the resend-auth counter for ResendAuthError', async () => {
    await recordEmailSendFailure(new ResendAuthError());
    expect(incrementMock).toHaveBeenCalledOnce();
    expect(incrementMock).toHaveBeenCalledWith(COUNTER_KEYS.resendAuth);
  });

  it('increments the resend-transient counter for ResendTransientError', async () => {
    await recordEmailSendFailure(new ResendTransientError(503));
    expect(incrementMock).toHaveBeenCalledOnce();
    expect(incrementMock).toHaveBeenCalledWith(COUNTER_KEYS.resendTransient);
  });

  it('increments the unknown counter for generic errors', async () => {
    await recordEmailSendFailure(new Error('network error'));
    expect(incrementMock).toHaveBeenCalledOnce();
    expect(incrementMock).toHaveBeenCalledWith(COUNTER_KEYS.unknown);
  });

  it('increments the unknown counter for non-Error thrown values', async () => {
    await recordEmailSendFailure('string thrown');
    expect(incrementMock).toHaveBeenCalledOnce();
    expect(incrementMock).toHaveBeenCalledWith(COUNTER_KEYS.unknown);
  });

  it('never throws even when incrementDiagnostic rejects', async () => {
    incrementMock.mockRejectedValueOnce(new Error('db down'));
    await expect(recordEmailSendFailure(new ResendAuthError())).resolves.toBeUndefined();
  });
});
