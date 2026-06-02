import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const userFindUniqueMock = vi.fn().mockResolvedValue({ id: 'demo-user-1' });
const upsertMock = vi.fn().mockResolvedValue({});
const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
const captureRawPayloadMock = vi.fn().mockResolvedValue(undefined);
const incrementDiagnosticMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (args: unknown) => userFindUniqueMock(args),
    },
    healthConnection: {
      upsert: (args: unknown) => upsertMock(args),
      updateMany: (args: unknown) => updateManyMock(args),
    },
  },
}));

vi.mock('@/lib/health/raw-payload', () => ({
  captureRawPayload: (args: unknown) => captureRawPayloadMock(args),
}));

vi.mock('@/lib/marketing/diagnostic', () => ({
  incrementDiagnostic: (key: string) => incrementDiagnosticMock(key),
}));

import { POST } from './route';

const originalSecret = process.env.TERRA_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.TERRA_WEBHOOK_SECRET = 'terra-secret';
  userFindUniqueMock.mockReset().mockResolvedValue({ id: 'demo-user-1' });
  upsertMock.mockClear();
  updateManyMock.mockReset().mockResolvedValue({ count: 1 });
  captureRawPayloadMock.mockClear();
  incrementDiagnosticMock.mockClear();
});

afterAll(() => {
  process.env.TERRA_WEBHOOK_SECRET = originalSecret;
});

function signedRequest(payload: unknown, options: { secret?: string; timestamp?: number } = {}): Request {
  const rawBody = JSON.stringify(payload);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = options.secret ?? 'terra-secret';
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return new Request('https://app.test/api/health/terra/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'terra-signature': `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
}

describe('POST /api/health/terra/webhook', () => {
  it('accepts a signed Garmin auth success event and connects the matching user', async () => {
    const payload = {
      type: 'auth',
      status: 'success',
      resource: 'GARMIN',
      user: {
        user_id: 'terra-user-1',
        reference_id: 'demo-user-1',
        provider: 'GARMIN',
        scopes: ['daily', 'sleep'],
      },
    };

    const res = await POST(signedRequest(payload));
    const body = await res.json() as { received: boolean; processed: boolean };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ received: true, processed: true });
    expect(captureRawPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'demo-user-1',
      provider: 'garmin',
      source: 'push',
      payload,
    }));
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_provider: { userId: 'demo-user-1', provider: 'garmin' } },
      update: expect.objectContaining({
        status: 'connected',
        terraUserId: 'terra-user-1',
      }),
    }));
    const metadata = JSON.parse((upsertMock.mock.calls[0][0] as { update: { metadata: string } }).update.metadata);
    expect(metadata).toMatchObject({
      mode: 'terra',
      eventType: 'auth',
      provider: 'garmin',
      resource: 'GARMIN',
    });
  });

  it('accepts but does not create an orphan connection for an unknown reference id', async () => {
    userFindUniqueMock.mockResolvedValue(null);
    const payload = {
      type: 'auth',
      status: 'success',
      resource: 'GARMIN',
      user: {
        user_id: 'terra-user-1',
        reference_id: 'unknown-user',
        provider: 'GARMIN',
      },
    };

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(202);
    expect(captureRawPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'unknown-user',
      provider: 'garmin',
      source: 'push',
    }));
    expect(incrementDiagnosticMock).toHaveBeenCalledWith('terra-webhook-unmatched-user');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a missing signature when a webhook secret is configured', async () => {
    const res = await POST(new Request('https://app.test/api/health/terra/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'auth' }),
    }));

    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(captureRawPayloadMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature before parsing or writing state', async () => {
    const payload = { type: 'auth', user: { reference_id: 'demo-user-1' } };
    const res = await POST(signedRequest(payload, { secret: 'wrong-secret' }));

    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(captureRawPayloadMock).not.toHaveBeenCalled();
  });

  it('rejects a stale signature timestamp', async () => {
    const payload = { type: 'auth', user: { reference_id: 'demo-user-1' } };
    const staleTimestamp = Math.floor(Date.now() / 1000) - 15 * 60;

    const res = await POST(signedRequest(payload, { timestamp: staleTimestamp }));

    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(captureRawPayloadMock).not.toHaveBeenCalled();
  });

  it('marks Garmin disconnected on a signed deauth event', async () => {
    const payload = {
      type: 'deauth',
      resource: 'GARMIN',
      user: {
        user_id: 'terra-user-1',
        reference_id: 'demo-user-1',
        provider: 'GARMIN',
      },
    };

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'demo-user-1', provider: 'garmin' },
      data: expect.objectContaining({
        status: 'disconnected',
        terraUserId: null,
      }),
    }));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('marks Garmin disconnected by Terra user id when deauth omits reference id', async () => {
    const payload = {
      type: 'deauth',
      resource: 'GARMIN',
      user: {
        user_id: 'terra-user-1',
        provider: 'GARMIN',
      },
    };

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { terraUserId: 'terra-user-1', provider: 'garmin' },
      data: expect.objectContaining({
        status: 'disconnected',
        terraUserId: null,
      }),
    }));
    expect(incrementDiagnosticMock).not.toHaveBeenCalledWith('terra-webhook-missing-identifier');
  });

  it('marks Garmin auth failure by Terra user id when failure omits reference id', async () => {
    const payload = {
      type: 'auth',
      status: 'failure',
      resource: 'GARMIN',
      user: {
        user_id: 'terra-user-1',
        provider: 'GARMIN',
      },
    };

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { terraUserId: 'terra-user-1', provider: 'garmin' },
      data: expect.objectContaining({
        status: 'error',
      }),
    }));
    const metadata = JSON.parse((updateManyMock.mock.calls[0][0] as { data: { metadata: string } }).data.metadata);
    expect(metadata).toMatchObject({
      syncError: 'terra_auth_failed',
      provider: 'garmin',
    });
  });

  it('captures non-Garmin Terra data events without Garmin reconciliation', async () => {
    const payload = {
      type: 'daily',
      resource: 'APPLE',
      user: {
        user_id: 'terra-apple-user',
        reference_id: 'demo-user-1',
        provider: 'APPLE',
      },
    };

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(captureRawPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'demo-user-1',
      provider: 'apple',
      source: 'push',
    }));
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
