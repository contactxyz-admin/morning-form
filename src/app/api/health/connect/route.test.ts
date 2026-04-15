import { describe, expect, it, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn().mockResolvedValue({});
vi.mock('@/lib/db', () => ({
  prisma: {
    healthConnection: {
      upsert: (args: unknown) => upsertMock(args),
    },
  },
}));

vi.mock('@/lib/demo-user', () => ({
  getOrCreateDemoUser: vi.fn().mockResolvedValue({ id: 'demo-user-1' }),
}));

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://app.test' },
}));

import { POST } from './route';

beforeEach(() => {
  upsertMock.mockClear();
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
    expect(arg.create.accessToken).toMatch(/^mock_libre_/);
    // The raw password must never appear anywhere in the persisted row.
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain('secret');
  });
});
