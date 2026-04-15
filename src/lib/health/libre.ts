/**
 * LibreLinkUp client.
 *
 * LibreLinkUp is an unofficial endpoint that Abbott does not formally support;
 * tolerate breakage. Credentials are email + password (not OAuth). We exchange
 * them for a session token at auth time and never persist the password —
 * callers are responsible for dropping the password after passing it to
 * `login`.
 *
 * Mock mode is on when LIBRE_ENABLED is not set to "true". Mock mode returns
 * a deterministic 96-reading 24-hour series (15-minute cadence) with one
 * hyperglycemic postprandial spike and one overnight hypoglycemic dip so
 * downstream suggestion rules (Unit 5) can exercise out-of-range paths.
 */

import { z } from 'zod';
import type { HealthProvider } from '@/types';
import type { HealthProviderStrategy, ProviderCapabilities } from './strategy';
import { HEALTH_PROVIDERS } from './providers';

// Typed error classes so sync.ts can branch on response category rather than
// string-matching error messages.
export class LibreAuthError extends Error {
  constructor(message = 'libre session invalid or expired') {
    super(message);
    this.name = 'LibreAuthError';
  }
}
export class LibreRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('libre rate limited');
    this.name = 'LibreRateLimitError';
  }
}
export class LibreTransientError extends Error {
  constructor(public status: number) {
    super(`libre transient error: ${status}`);
    this.name = 'LibreTransientError';
  }
}

const graphResponseSchema = z.object({
  data: z
    .object({
      graphData: z
        .array(z.object({ Timestamp: z.string(), Value: z.number() }))
        .default([]),
    })
    .optional(),
});

const loginResponseSchema = z.object({
  data: z.object({
    authTicket: z.object({ token: z.string().min(1), expires: z.number() }),
    user: z.object({ id: z.string().min(1) }),
  }),
});

export interface LibreAuthResponse {
  accessToken: string;
  expiresAt: number;
  patientId: string;
}

export interface LibreGlucoseReading {
  timestamp: string;
  value: number;
  unit: 'mg/dL';
}

export class LibreClient implements HealthProviderStrategy {
  readonly provider: HealthProvider = 'libre';
  readonly capabilities: ProviderCapabilities = HEALTH_PROVIDERS.libre.capabilities;
  private baseUrl = 'https://api.libreview.io';
  private enabled: boolean;

  constructor(enabled?: boolean) {
    // Libre is opt-in (LIBRE_ENABLED=true), not auto-enabled by presence of
    // secrets like the OAuth clients. The endpoint is unofficial and can
    // break without notice, so we default to mock even in production unless
    // the operator explicitly opts in.
    this.enabled = enabled ?? process.env.LIBRE_ENABLED === 'true';
  }

  /**
   * Exchange email + password for a session token. Returns the token and the
   * patient id to use in later graph calls. Caller must NOT persist the
   * password.
   */
  async login(email: string, password: string): Promise<LibreAuthResponse> {
    if (!this.enabled) {
      return {
        accessToken: `mock_libre_${hashForMock(email)}`,
        expiresAt: Date.now() + 3600_000,
        patientId: `mock_patient_${hashForMock(email)}`,
      };
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/llu/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'product': 'llu.ios', 'version': '4.7.0' },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) throw new LibreAuthError('invalid credentials');
    if (!response.ok) throw new LibreTransientError(response.status);

    const parsed = loginResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new LibreTransientError(response.status);
    }
    return {
      accessToken: parsed.data.data.authTicket.token,
      expiresAt: parsed.data.data.authTicket.expires * 1000,
      patientId: parsed.data.data.user.id,
    };
  }

  async getGlucoseGraph(
    patientId: string,
    accessToken?: string,
    startDate = new Date().toISOString().split('T')[0],
  ): Promise<LibreGlucoseReading[]> {
    if (!this.enabled || !accessToken) {
      return generateMockGlucoseGraph(startDate);
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/llu/connections/${patientId}/graph`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'product': 'llu.ios',
        'version': '4.7.0',
      },
    });

    if (response.status === 401) throw new LibreAuthError();
    if (!response.ok) throw new LibreTransientError(response.status);

    const parsed = graphResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new LibreTransientError(response.status);
    }
    const graph = parsed.data.data?.graphData ?? [];
    return graph.map((g) => ({
      timestamp: new Date(g.Timestamp).toISOString(),
      value: g.Value,
      unit: 'mg/dL',
    }));
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
          throw new LibreRateLimitError(retryAfter);
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
    // Unreachable — the loop always either returns or throws on the last
    // attempt — but the type checker can't see that.
    return lastResponse!;
  }

  private backoff(attempt: number): Promise<void> {
    const base = 200 * 2 ** (attempt - 1); // 200, 400, 800 ms
    const jitter = Math.floor(Math.random() * base);
    return new Promise((r) => setTimeout(r, base + jitter));
  }
}

// Tiny non-cryptographic hash so mock tokens are deterministic per-email
// without pulling in a real hashing dep.
function hashForMock(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16);
}

function generateMockGlucoseGraph(startDate: string): LibreGlucoseReading[] {
  const readings: LibreGlucoseReading[] = [];
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  for (let i = 0; i < 96; i++) {
    const t = new Date(start + i * 15 * 60 * 1000);
    const hour = (i * 15) / 60;
    const diurnal = 6 * Math.sin((hour / 24) * 2 * Math.PI - Math.PI / 2);
    const mealBump = hour >= 7.5 && hour < 9.5 ? 35 : hour >= 12.5 && hour < 14.5 ? 90 : hour >= 18.5 && hour < 20.5 ? 25 : 0;
    const nocturnalDip = hour >= 3 && hour < 3.75 ? -40 : 0;
    const raw = 105 + diurnal + mealBump + nocturnalDip;
    const value = Math.max(45, Math.min(240, Math.round(raw)));
    readings.push({ timestamp: t.toISOString(), value, unit: 'mg/dL' });
  }
  return readings;
}
