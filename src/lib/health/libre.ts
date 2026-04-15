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

import type { HealthProvider } from '@/types';
import type { HealthProviderStrategy, ProviderCapabilities } from './strategy';
import { HEALTH_PROVIDERS } from './providers';

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

    const response = await fetch(`${this.baseUrl}/llu/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'product': 'llu.ios', 'version': '4.7.0' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Libre login failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      data: { authTicket: { token: string; expires: number }; user: { id: string } };
    };
    return {
      accessToken: body.data.authTicket.token,
      expiresAt: body.data.authTicket.expires * 1000,
      patientId: body.data.user.id,
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

    const response = await fetch(`${this.baseUrl}/llu/connections/${patientId}/graph`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'product': 'llu.ios',
        'version': '4.7.0',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Libre graph fetch failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: { graphData?: Array<{ Timestamp: string; Value: number }> };
    };
    const graph = body.data?.graphData ?? [];
    return graph.map((g) => ({
      timestamp: new Date(g.Timestamp).toISOString(),
      value: g.Value,
      unit: 'mg/dL',
    }));
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
