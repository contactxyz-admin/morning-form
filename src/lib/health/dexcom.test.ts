import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DexcomClient,
  DexcomAuthError,
  DexcomRateLimitError,
  DexcomTransientError,
} from './dexcom';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

describe('DexcomClient.getAuthUrl', () => {
  it('builds a Dexcom OAuth URL with expected params', () => {
    const client = new DexcomClient('client-abc', 'secret');
    const url = new URL(client.getAuthUrl('https://app.example.com/cb'));
    expect(url.origin + url.pathname).toBe('https://api.dexcom.com/v2/oauth2/login');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('offline_access');
  });
});

describe('DexcomClient.exchangeCode + refreshToken (mock mode)', () => {
  it('returns a deterministic mock token payload when client id/secret are absent', async () => {
    const client = new DexcomClient('', '');
    const tokens = await client.exchangeCode('auth-code-1', 'https://x/cb');
    expect(tokens).toMatchObject({
      access_token: 'mock_dexcom_auth-code-1',
      refresh_token: 'mock_refresh',
      expires_in: 3600,
    });
  });

  it('mock refreshToken returns a new access token', async () => {
    const client = new DexcomClient('', '');
    const refreshed = await client.refreshToken('old');
    expect(refreshed.access_token).toMatch(/^mock_refreshed_/);
    expect(refreshed.expires_in).toBe(3600);
  });
});

describe('DexcomClient.getEgvs (mock mode)', () => {
  it('returns ≥96 readings (15-min cadence × 24h)', async () => {
    const client = new DexcomClient('', '');
    const egvs = await client.getEgvs('2026-04-13', '2026-04-14');
    expect(egvs.length).toBe(96);
  });

  it('every reading has finite numeric value + ISO systemTime + mg/dL unit', async () => {
    const client = new DexcomClient('', '');
    const egvs = await client.getEgvs('2026-04-13', '2026-04-14');
    for (const r of egvs) {
      expect(Number.isFinite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(40);
      expect(r.value).toBeLessThanOrEqual(250);
      expect(r.unit).toBe('mg/dL');
      expect(() => new Date(r.systemTime).toISOString()).not.toThrow();
      expect(new Date(r.systemTime).toISOString()).toBe(r.systemTime);
    }
  });

  it('includes at least one hypoglycemic (<70) and one hyperglycemic (>180) excursion so Unit 5 rules can fire', async () => {
    const egvs = await new DexcomClient('', '').getEgvs('2026-04-13', '2026-04-14');
    expect(egvs.some((r) => r.value < 70)).toBe(true);
    expect(egvs.some((r) => r.value > 180)).toBe(true);
  });

  it('is deterministic across calls with the same startDate', async () => {
    const a = await new DexcomClient('', '').getEgvs('2026-04-13', '2026-04-14');
    const b = await new DexcomClient('', '').getEgvs('2026-04-13', '2026-04-14');
    expect(a).toEqual(b);
  });
});

describe('DexcomClient real-path error handling', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fetchMock.mockReset();
  });

  function installFetch() {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  }

  function realClient() {
    return new DexcomClient('client-id', 'client-secret');
  }

  it('exchangeCode: 401 throws DexcomAuthError (no retry)', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(realClient().exchangeCode('code', 'https://x/cb')).rejects.toBeInstanceOf(
      DexcomAuthError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshToken: 401 throws DexcomAuthError (no retry)', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(realClient().refreshToken('old-refresh')).rejects.toBeInstanceOf(
      DexcomAuthError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getEgvs: 401 throws DexcomAuthError', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(
      realClient().getEgvs('2026-04-13', '2026-04-14', 'tok'),
    ).rejects.toBeInstanceOf(DexcomAuthError);
  });

  it('getEgvs: 429 retries up to 3 times then throws DexcomRateLimitError with retry-after', async () => {
    installFetch();
    fetchMock.mockResolvedValue(
      new Response('', { status: 429, headers: { 'retry-after': '11' } }),
    );
    const err = await realClient()
      .getEgvs('2026-04-13', '2026-04-14', 'tok')
      .catch((e) => e);
    expect(err).toBeInstanceOf(DexcomRateLimitError);
    expect((err as DexcomRateLimitError).retryAfterSeconds).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('getEgvs: 5xx retries then returns data on eventual success', async () => {
    installFetch();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(
        jsonResponse({
          egvs: [
            { systemTime: '2026-04-13T10:00:00.000Z', displayTime: '2026-04-13T10:00:00.000Z', value: 112, unit: 'mg/dL' },
          ],
        }),
      );
    const egvs = await realClient().getEgvs('2026-04-13', '2026-04-14', 'tok');
    expect(egvs).toHaveLength(1);
    expect(egvs[0].value).toBe(112);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('getEgvs: malformed payload throws DexcomTransientError', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ egvs: [{ wrong: 'shape' }] }));
    await expect(
      realClient().getEgvs('2026-04-13', '2026-04-14', 'tok'),
    ).rejects.toBeInstanceOf(DexcomTransientError);
  });

  it('getEgvs: happy path sends Bearer header and hits /users/self/egvs', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        egvs: [
          { systemTime: '2026-04-13T07:00:00.000Z', displayTime: '2026-04-13T07:00:00.000Z', value: 101, unit: 'mg/dL' },
          { systemTime: '2026-04-13T07:15:00.000Z', displayTime: '2026-04-13T07:15:00.000Z', value: 108, unit: 'mg/dL' },
        ],
      }),
    );
    const egvs = await realClient().getEgvs('2026-04-13', '2026-04-14', 'real-token');
    expect(egvs).toHaveLength(2);
    expect(egvs[0]).toMatchObject({ value: 101, unit: 'mg/dL' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/self/egvs');
    expect(url).toContain('startDate=2026-04-13T00:00:00');
    expect(url).toContain('endDate=2026-04-14T23:59:59');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer real-token');
  });
});
