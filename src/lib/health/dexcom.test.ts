import { describe, expect, it } from 'vitest';
import { DexcomClient } from './dexcom';

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
