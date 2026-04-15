/**
 * Dexcom API Client
 * OAuth 2.0 + Estimated Glucose Values (EGVs) pull.
 * Mock mode when DEXCOM_CLIENT_ID is unset — returns a deterministic
 * 24-hour series (15-minute cadence → 96 readings) so sync + suggestions
 * can exercise the glucose path without real credentials.
 */

import { z } from 'zod';
import type { HealthProvider } from '@/types';
import type { HealthProviderStrategy, ProviderCapabilities } from './strategy';
import { HEALTH_PROVIDERS } from './providers';

// Typed error classes mirror libre.ts so sync.ts can branch on response
// category rather than string-matching error messages.
export class DexcomAuthError extends Error {
  constructor(message = 'dexcom session invalid or expired') {
    super(message);
    this.name = 'DexcomAuthError';
  }
}
export class DexcomRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('dexcom rate limited');
    this.name = 'DexcomRateLimitError';
  }
}
export class DexcomTransientError extends Error {
  constructor(public status: number) {
    super(`dexcom transient error: ${status}`);
    this.name = 'DexcomTransientError';
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
});

// Dexcom V2 returns `{ egvs: [...] }` on /users/self/egvs. Older docs reference
// `records` — accept either so a minor API field rename doesn't nuke the sync.
const egvSchema = z.object({
  systemTime: z.string(),
  displayTime: z.string(),
  value: z.number(),
  trend: z.string().optional(),
  trendRate: z.number().optional(),
  unit: z.literal('mg/dL'),
});
const egvResponseSchema = z.object({
  egvs: z.array(egvSchema).optional(),
  records: z.array(egvSchema).optional(),
});

export interface DexcomTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DexcomEgv {
  systemTime: string;
  displayTime: string;
  value: number;
  trend?: string;
  trendRate?: number;
  unit: 'mg/dL';
}

export class DexcomClient implements HealthProviderStrategy {
  readonly provider: HealthProvider = 'dexcom';
  readonly capabilities: ProviderCapabilities = HEALTH_PROVIDERS.dexcom.capabilities;
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://api.dexcom.com/v2';

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.DEXCOM_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.DEXCOM_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'offline_access',
    });
    return `${this.baseUrl}/oauth2/login?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<DexcomTokens> {
    if (!this.clientId || !this.clientSecret) {
      return { access_token: `mock_dexcom_${code}`, refresh_token: 'mock_refresh', expires_in: 3600 };
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (response.status === 401) throw new DexcomAuthError('token exchange rejected');
    if (!response.ok) throw new DexcomTransientError(response.status);

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new DexcomTransientError(response.status);
    return parsed.data;
  }

  async refreshToken(refreshToken: string): Promise<DexcomTokens> {
    if (!this.clientId || !this.clientSecret) {
      return { access_token: `mock_refreshed_${Date.now()}`, refresh_token: 'mock_refresh_new', expires_in: 3600 };
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (response.status === 401) throw new DexcomAuthError('refresh token rejected');
    if (!response.ok) throw new DexcomTransientError(response.status);

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new DexcomTransientError(response.status);
    return parsed.data;
  }

  /**
   * Estimated Glucose Values. 15-minute cadence, mg/dL.
   * Mock series is deterministic so tests and characterization can lock values:
   * a gentle diurnal pattern centered on 100 mg/dL with a morning dip and a
   * post-meal bump, clamped to a physiologic range [70, 180].
   */
  async getEgvs(startDate: string, endDate: string, accessToken?: string): Promise<DexcomEgv[]> {
    if (!this.clientId || !this.clientSecret || !accessToken) {
      return generateMockEgvs(startDate);
    }

    // Dexcom requires ISO-8601 timestamps, not bare YYYY-MM-DD dates.
    const startParam = `${startDate}T00:00:00`;
    const endParam = `${endDate}T23:59:59`;
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/users/self/egvs?startDate=${startParam}&endDate=${endParam}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (response.status === 401) throw new DexcomAuthError();
    if (!response.ok) throw new DexcomTransientError(response.status);

    const parsed = egvResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new DexcomTransientError(response.status);
    return parsed.data.egvs ?? parsed.data.records ?? [];
  }

  // Bounded retry with jitter for 429 + 5xx. Each attempt has its own 10s
  // timeout. 401 and 4xx (not 429) are not retried — they're surfaced by the
  // caller as auth or transient errors. Max 3 attempts total.
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const maxAttempts = 3;
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      lastResponse = response;
      if (response.status === 429) {
        if (attempt === maxAttempts) {
          const retryAfter = Number(response.headers.get('retry-after')) || undefined;
          throw new DexcomRateLimitError(retryAfter);
        }
        await this.backoff(attempt);
        continue;
      }
      if (response.status >= 500 && response.status < 600) {
        if (attempt === maxAttempts) return response;
        await this.backoff(attempt);
        continue;
      }
      return response;
    }
    return lastResponse!;
  }

  private backoff(attempt: number): Promise<void> {
    const base = 200 * 2 ** (attempt - 1); // 200, 400, 800 ms
    const jitter = Math.floor(Math.random() * base);
    return new Promise((r) => setTimeout(r, base + jitter));
  }
}

/**
 * Deterministic 24-hour EGV series (15-minute cadence → 96 readings). Includes
 * one hyperglycemic postprandial spike (>180 mg/dL) around 1pm and one
 * overnight hypoglycemic dip (<70 mg/dL) around 3am so downstream suggestion
 * rules (Unit 5) can exercise out-of-range paths against the default mock.
 * Clamp is wider than physiologic normal to preserve those excursions.
 */
function generateMockEgvs(startDate: string): DexcomEgv[] {
  const readings: DexcomEgv[] = [];
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  for (let i = 0; i < 96; i++) {
    const t = new Date(start + i * 15 * 60 * 1000);
    const hour = (i * 15) / 60;
    const diurnal = 8 * Math.sin((hour / 24) * 2 * Math.PI - Math.PI / 2);
    const mealBump = hour >= 8 && hour < 10 ? 30 : hour >= 12 && hour < 14 ? 95 : hour >= 18 && hour < 20 ? 22 : 0;
    const nocturnalDip = hour >= 2.75 && hour < 3.5 ? -45 : 0;
    const raw = 100 + diurnal + mealBump + nocturnalDip;
    const value = Math.max(40, Math.min(250, Math.round(raw)));
    const iso = t.toISOString();
    readings.push({ systemTime: iso, displayTime: iso, value, unit: 'mg/dL' });
  }
  return readings;
}
