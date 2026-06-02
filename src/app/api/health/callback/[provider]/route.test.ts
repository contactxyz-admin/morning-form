import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn().mockResolvedValue({});
const getCurrentUserMock = vi.fn().mockResolvedValue({ id: 'demo-user-1' });
const getUserInfoMock = vi.fn().mockResolvedValue([{
  user_id: 'terra-user-1',
  provider: 'GARMIN',
  reference_id: 'demo-user-1',
  scopes: ['daily', 'sleep'],
}]);
const syncConnectionMock = vi.fn().mockResolvedValue({ pointsCreated: 0 });

vi.mock('@/lib/db', () => ({
  prisma: {
    healthConnection: {
      upsert: (args: unknown) => upsertMock(args),
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
      getUserInfo: (args: unknown) => getUserInfoMock(args),
    };
  }),
}));

vi.mock('@/lib/health/sync', () => ({
  HealthSyncService: vi.fn().mockImplementation(function HealthSyncServiceMock() {
    return {
      syncConnection: (...args: unknown[]) => syncConnectionMock(...args),
    };
  }),
}));

import { GET } from './route';

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  upsertMock.mockClear();
  getCurrentUserMock.mockReset().mockResolvedValue({ id: 'demo-user-1' });
  getUserInfoMock.mockReset().mockResolvedValue([{
    user_id: 'terra-user-1',
    provider: 'GARMIN',
    reference_id: 'demo-user-1',
    scopes: ['daily', 'sleep'],
  }]);
  syncConnectionMock.mockClear();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function callbackRequest(query: string): Request {
  return new Request(`https://app.test/api/health/callback/garmin?${query}`, {
    method: 'GET',
  });
}

function locationOf(response: Response): URL {
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location!);
}

describe('GET /api/health/callback/garmin', () => {
  it('confirms a Terra Garmin redirect and stores the Terra user id', async () => {
    const res = await GET(
      callbackRequest('terra_status=success&user_id=terra-user-1&resource=GARMIN&reference_id=demo-user-1'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.pathname).toBe('/settings/integrations');
    expect(redirect.searchParams.get('status')).toBe('connected');
    expect(redirect.searchParams.get('provider')).toBe('garmin');
    expect(getUserInfoMock).toHaveBeenCalledWith({ userId: 'terra-user-1' });
    expect(syncConnectionMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0] as {
      update: { status: string; terraUserId: string; metadata: string };
      create: { status: string; terraUserId: string; metadata: string };
    };
    expect(arg.update).toMatchObject({
      status: 'connected',
      terraUserId: 'terra-user-1',
    });
    const metadata = JSON.parse(arg.update.metadata) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      mode: 'terra',
      provider: 'garmin',
      resource: 'GARMIN',
      referenceId: 'demo-user-1',
      verificationMethod: 'terra_user_info',
    });
  });

  it('does not write a connection when the Terra reference id belongs to another user', async () => {
    const res = await GET(
      callbackRequest('terra_status=success&user_id=terra-user-1&resource=GARMIN&reference_id=other-user'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.searchParams.get('status')).toBe('error');
    expect(redirect.searchParams.get('message')).toBe('terra_reference_mismatch');
    expect(upsertMock).not.toHaveBeenCalled();
    expect(syncConnectionMock).not.toHaveBeenCalled();
  });

  it('leaves reconciliation pending when the redirect cannot be tied to the current user', async () => {
    getUserInfoMock.mockResolvedValue([]);

    const res = await GET(
      callbackRequest('terra_status=success&user_id=terra-user-1&resource=GARMIN'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.searchParams.get('status')).toBe('pending');
    expect(redirect.searchParams.get('message')).toBe('awaiting_terra_webhook');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does not trust reference-only Garmin redirects in production when Terra confirmation fails', async () => {
    process.env.NODE_ENV = 'production';
    getUserInfoMock.mockRejectedValue(new Error('terra unavailable'));

    const res = await GET(
      callbackRequest('terra_status=success&user_id=terra-user-1&resource=GARMIN&reference_id=demo-user-1'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.searchParams.get('status')).toBe('pending');
    expect(redirect.searchParams.get('message')).toBe('awaiting_terra_webhook');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does not allow mock query parameters to connect Garmin in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await GET(
      callbackRequest('mock=1'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.searchParams.get('status')).toBe('pending');
    expect(redirect.searchParams.get('message')).toBe('awaiting_terra_webhook');
    expect(getUserInfoMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(syncConnectionMock).not.toHaveBeenCalled();
  });

  it('records a visible Garmin callback error for an authenticated user', async () => {
    const res = await GET(
      callbackRequest('error=access_denied'),
      { params: { provider: 'garmin' } },
    );
    const redirect = locationOf(res);

    expect(redirect.searchParams.get('status')).toBe('error');
    expect(redirect.searchParams.get('message')).toBe('access_denied');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0] as {
      update: { status: string; metadata: string };
      create: { status: string; metadata: string };
    };
    expect(arg.update.status).toBe('error');
    expect(JSON.parse(arg.update.metadata)).toMatchObject({
      syncError: 'access_denied',
      callbackProvider: 'garmin',
    });
  });
});
