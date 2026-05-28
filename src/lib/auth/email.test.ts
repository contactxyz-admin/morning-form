import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendAuthError, ResendTransientError, sendMagicLinkEmail } from './email';

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'production',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'login@example.com',
  },
}));

vi.mock('@/lib/env', () => ({ env: envMock }));

beforeEach(() => {
  envMock.NODE_ENV = 'production';
  envMock.RESEND_API_KEY = 're_test_key';
  envMock.RESEND_FROM = 'login@example.com';
  vi.restoreAllMocks();
});

describe('sendMagicLinkEmail', () => {
  it('fails before calling Resend when RESEND_FROM is blank', async () => {
    envMock.RESEND_FROM = '';
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      sendMagicLinkEmail({
        to: 'user@example.com',
        verifyUrl: 'https://morning-form.vercel.app/api/auth/verify?token=x',
      }),
    ).rejects.toBeInstanceOf(ResendAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes the Resend 400 response body in the transient error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'The from address is invalid' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      sendMagicLinkEmail({
        to: 'user@example.com',
        verifyUrl: 'https://morning-form.vercel.app/api/auth/verify?token=x',
      }),
    ).rejects.toMatchObject({
      name: 'ResendTransientError',
      status: 400,
      details: expect.stringContaining('from address is invalid'),
    } satisfies Partial<ResendTransientError>);
  });
});
