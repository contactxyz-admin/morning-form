import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserMock = vi.fn().mockResolvedValue({ id: 'demo-user-1' });
const findManyMock = vi.fn().mockResolvedValue([]);
const findUniqueMock = vi.fn().mockResolvedValue(null);
const upsertMock = vi.fn().mockResolvedValue({});
const deauthenticateUserMock = vi.fn().mockResolvedValue({ status: 'success' });
const incrementDiagnosticMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    healthConnection: {
      findMany: (args: unknown) => findManyMock(args),
      findUnique: (args: unknown) => findUniqueMock(args),
      upsert: (args: unknown) => upsertMock(args),
    },
  },
}));

vi.mock('@/lib/health/terra', () => ({
  TerraClient: vi.fn().mockImplementation(function TerraClientMock() {
    return {
      deauthenticateUser: (terraUserId: string) => deauthenticateUserMock(terraUserId),
    };
  }),
}));

vi.mock('@/lib/marketing/diagnostic', () => ({
  incrementDiagnostic: (key: string) => incrementDiagnosticMock(key),
}));

import { DELETE } from './route';

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: 'demo-user-1' });
  findManyMock.mockClear();
  findUniqueMock.mockReset().mockResolvedValue(null);
  upsertMock.mockClear();
  deauthenticateUserMock.mockReset().mockResolvedValue({ status: 'success' });
  incrementDiagnosticMock.mockClear();
});

function deleteRequest(provider: string): Request {
  return new Request('https://app.test/api/health/connections', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
}

describe('DELETE /api/health/connections', () => {
  it('returns 401 without clearing state when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest('garmin'));

    expect(res.status).toBe(401);
    expect(deauthenticateUserMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects unknown providers without writing a disconnect row', async () => {
    const res = await DELETE(deleteRequest('not-a-provider'));
    const body = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid provider' });
    expect(deauthenticateUserMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deauthenticates a connected Garmin Terra user before clearing local state', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'conn-1',
      userId: 'demo-user-1',
      provider: 'garmin',
      terraUserId: 'terra-user-1',
      metadata: '{"mode":"terra"}',
    });

    const res = await DELETE(deleteRequest('garmin'));
    const body = await res.json() as { success: boolean };

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(deauthenticateUserMock).toHaveBeenCalledWith('terra-user-1');
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_provider: { userId: 'demo-user-1', provider: 'garmin' } },
      update: expect.objectContaining({
        status: 'disconnected',
        terraUserId: null,
        metadata: null,
      }),
    }));
  });

  it('still clears local Garmin state when Terra deauth fails and records diagnostics', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'conn-1',
      userId: 'demo-user-1',
      provider: 'garmin',
      terraUserId: 'terra-user-1',
      metadata: '{"mode":"terra"}',
    });
    deauthenticateUserMock.mockRejectedValue(new Error('terra unavailable'));

    const res = await DELETE(deleteRequest('garmin'));

    expect(res.status).toBe(200);
    expect(incrementDiagnosticMock).toHaveBeenCalledWith('terra-deauth-failed');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0] as { update: { metadata: string } };
    expect(JSON.parse(arg.update.metadata)).toMatchObject({
      mode: 'terra',
      terraDeauthError: 'terra unavailable',
    });
  });
});
