import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendAuthError, ResendSenderError, ResendTransientError, sendMagicLinkEmail } from './email';

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

  it('classifies a Resend 401 as an API key auth error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'API key is invalid' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      sendMagicLinkEmail({
        to: 'user@example.com',
        verifyUrl: 'https://morning-form.vercel.app/api/auth/verify?token=x',
      }),
    ).rejects.toMatchObject({
      name: 'ResendAuthError',
      details: expect.stringContaining('API key is invalid'),
    } satisfies Partial<ResendAuthError>);
  });

  it('classifies a Resend 403 as a sender/domain authorization error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'The contact.xyz domain is not verified' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      sendMagicLinkEmail({
        to: 'user@example.com',
        verifyUrl: 'https://morning-form.vercel.app/api/auth/verify?token=x',
      }),
    ).rejects.toMatchObject({
      name: 'ResendSenderError',
      details: expect.stringContaining('domain is not verified'),
    } satisfies Partial<ResendSenderError>);
  });
});
