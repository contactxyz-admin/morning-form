import { describe, expect, it, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn().mockResolvedValue({});
const findUniqueMock = vi.fn().mockResolvedValue(null);
const updateMock = vi.fn().mockResolvedValue({});
const { generateWidgetSessionMock, MockTerraConfigError } = vi.hoisted(() => {
  class MockTerraConfigError extends Error {
    constructor() {
      super('missing terra config');
      this.name = 'TerraConfigError';
    }
  }
  return {
    MockTerraConfigError,
    generateWidgetSessionMock: vi.fn().mockResolvedValue({
      sessionId: 'terra-session-1',
      url: 'https://widget.tryterra.co/session/terra-session-1',
      expiresAt: '2026-06-02T12:00:00.000Z',
    }),
  };
});
const getCurrentUserMock = vi.fn().mockResolvedValue({ id: 'demo-user-1' });

vi.mock('@/lib/db', () => ({
  prisma: {
    healthConnection: {
      upsert: (args: unknown) => upsertMock(args),
      findUnique: (args: unknown) => findUniqueMock(args),
      update: (args: unknown) => updateMock(args),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://app.test' },
}));

vi.mock('@/lib/health/terra', () => ({
  TerraClient: vi.fn().mockImplementation(function TerraClientMock() {
    return {
      generateWidgetSession: (referenceId: string, options?: unknown) => generateWidgetSessionMock(referenceId, options),
    };
  }),
  TerraConfigError: MockTerraConfigError,
  TerraAuthError: class TerraAuthError extends Error {},
  TerraRateLimitError: class TerraRateLimitError extends Error {},
  TerraTransientError: class TerraTransientError extends Error {},
}));

import { POST } from './route';

beforeEach(() => {
  upsertMock.mockClear();
  findUniqueMock.mockReset().mockResolvedValue(null);
  updateMock.mockClear();
  generateWidgetSessionMock.mockReset().mockResolvedValue({
    sessionId: 'terra-session-1',
    url: 'https://widget.tryterra.co/session/terra-session-1',
    expiresAt: '2026-06-02T12:00:00.000Z',
  });
  getCurrentUserMock.mockReset().mockResolvedValue({ id: 'demo-user-1' });
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/health/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/health/connect — libre credential auth', () => {
  it('returns 400 when libre is requested without email', async () => {
    const res = await POST(makeRequest({ provider: 'libre', password: 'pw' }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when libre is requested without password', async () => {
    const res = await POST(makeRequest({ provider: 'libre', email: 'a@b.com' }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when libre is requested with neither', async () => {
    const res = await POST(makeRequest({ provider: 'libre' }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('persists a session (never the password) when email+password are provided', async () => {
    const res = await POST(makeRequest({ provider: 'libre', email: 'user@example.com', password: 'secret' }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0] as {
      create: { accessToken: string; metadata: string };
      update: { accessToken: string; metadata: string };
    };
    // Token is persisted encrypted at rest — the plaintext mock token must
    // not appear in the stored row, but decrypting should recover it.
    const { decryptToken, isEncrypted } = await import('@/lib/health/crypto');
    expect(isEncrypted(arg.create.accessToken)).toBe(true);
    expect(decryptToken(arg.create.accessToken)).toMatch(/^mock_libre_/);
    // The raw password must never appear anywhere in the persisted row.
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain('secret');
  });
});

describe('POST /api/health/connect — garmin via Terra', () => {
  it('returns 401 without creating a Terra widget when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ provider: 'garmin' }));

    expect(res.status).toBe(401);
    expect(generateWidgetSessionMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns a Garmin-only Terra widget URL and persists pending session metadata', async () => {
    const res = await POST(makeRequest({ provider: 'garmin' }));
    const body = await res.json() as { authUrl: string; provider: string; callbackUrl: string };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      authUrl: 'https://widget.tryterra.co/session/terra-session-1',
      provider: 'garmin',
      callbackUrl: 'https://app.test/api/health/callback/garmin',
    });
    expect(generateWidgetSessionMock).toHaveBeenCalledWith('demo-user-1', {
      providers: 'GARMIN',
      successRedirectUrl: 'https://app.test/api/health/callback/garmin?terra_status=success',
      failureRedirectUrl: 'https://app.test/api/health/callback/garmin?terra_status=failure',
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0] as {
      where: unknown;
      update: { status: string; metadata: string; terraUserId: null };
      create: { status: string; metadata: string; terraUserId: null };
    };
    expect(arg.update.status).toBe('syncing');
    expect(arg.update.terraUserId).toBeNull();
    const metadata = JSON.parse(arg.update.metadata) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      mode: 'terra',
      provider: 'garmin',
      resource: 'GARMIN',
      terraWidgetSessionId: 'terra-session-1',
      terraWidgetExpiresAt: '2026-06-02T12:00:00.000Z',
      callbackUrl: 'https://app.test/api/health/callback/garmin',
    });
  });

  it('surfaces Terra configuration failure and marks an existing row as error', async () => {
    generateWidgetSessionMock.mockRejectedValue(new MockTerraConfigError());
    findUniqueMock.mockResolvedValue({ id: 'connection-1', metadata: '{"previous":true}' });

    const res = await POST(makeRequest({ provider: 'garmin' }));
    const body = await res.json() as { error: string; code: string };

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      error: 'Failed to initiate Garmin connection',
      code: 'terra_config_error',
    });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'connection-1' },
      data: expect.objectContaining({ status: 'error' }),
    }));
    const metadata = JSON.parse((updateMock.mock.calls[0][0] as { data: { metadata: string } }).data.metadata);
    expect(metadata).toMatchObject({
      previous: true,
      syncError: 'terra_config_error',
    });
  });
});
