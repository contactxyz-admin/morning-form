/**
 * Terra API Client
 *
 * Terra is Morning Form's live aggregation layer for Garmin. Dev/test keep
 * deterministic mock returns, but production must fail loud when credentials
 * are missing so connected users never receive silent mock health data.
 */

import { z } from 'zod';

export interface TerraSession {
  sessionId: string;
  url: string;
  expiresAt: string;
}

export interface TerraWidgetSessionOptions {
  providers?: 'GARMIN' | 'APPLE' | 'SAMSUNG' | string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
  language?: string;
}

export interface TerraUserInfo {
  user_id: string;
  provider?: string;
  reference_id?: string | null;
  active?: boolean;
  scopes?: string | string[] | null;
  last_webhook_update?: string | null;
}

export interface TerraSleepData {
  start_time: string;
  end_time: string;
  duration_seconds: number;
  sleep_efficiency: number;
  deep_sleep_seconds: number;
  rem_sleep_seconds: number;
  light_sleep_seconds: number;
  awake_seconds: number;
  avg_hr: number;
  min_hr: number;
  avg_hrv: number;
  respiratory_rate: number;
  raw?: unknown;
}

export interface TerraActivityData {
  start_time: string;
  end_time: string;
  steps: number;
  calories: number;
  active_duration_seconds: number;
  avg_hr: number;
  max_hr: number;
  distance_meters: number;
  raw?: unknown;
}

export interface TerraBodyData {
  timestamp: string;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  temperature_delta: number | null;
  raw?: unknown;
}

export interface TerraDailyData {
  date: string;
  steps: number;
  calories: number;
  active_minutes: number;
  resting_hr: number;
  avg_hrv: number;
  stress_level: number | null;
  recovery_score: number | null;
  raw?: unknown;
}

export class TerraConfigError extends Error {
  constructor(message = 'terra credentials are required for live Terra requests') {
    super(message);
    this.name = 'TerraConfigError';
  }
}

export class TerraAuthError extends Error {
  constructor(message = 'terra credentials rejected') {
    super(message);
    this.name = 'TerraAuthError';
  }
}

export class TerraRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('terra rate limited');
    this.name = 'TerraRateLimitError';
  }
}

export class TerraTransientError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `terra transient error: ${status}`);
    this.name = 'TerraTransientError';
  }
}

const widgetSessionSchema = z.object({
  session_id: z.string().min(1),
  url: z.string().min(1),
  expires_in: z.number().optional(),
  status: z.string().optional(),
});

const terraUserSchema = z.object({
  user_id: z.string().min(1),
  provider: z.string().optional(),
  reference_id: z.string().nullable().optional(),
  active: z.boolean().optional(),
  scopes: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  last_webhook_update: z.string().nullable().optional(),
}).passthrough();

const deauthResponseSchema = z.object({
  status: z.string(),
}).passthrough();

const dataResponseSchema = z.object({
  data: z.array(z.unknown()).default([]),
}).passthrough();

const userInfoResponseSchema = z.union([
  terraUserSchema,
  z.array(terraUserSchema),
  z.object({ user: terraUserSchema }).passthrough(),
  z.object({ users: z.array(terraUserSchema) }).passthrough(),
]);

export class TerraClient {
  private apiKey: string;
  private devId: string;
  private baseUrl = 'https://api.tryterra.co/v2';

  constructor(apiKey?: string, devId?: string) {
    this.apiKey = apiKey || process.env.TERRA_API_KEY || '';
    this.devId = devId || process.env.TERRA_DEV_ID || '';
  }

  private get headers() {
    return {
      'dev-id': this.devId,
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async generateWidgetSession(
    referenceId: string,
    options: TerraWidgetSessionOptions = {},
  ): Promise<TerraSession> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return this.mockSession(referenceId);
    }

    const body: Record<string, string> = {
      language: options.language ?? 'en',
      reference_id: referenceId,
    };
    if (options.providers) body.providers = options.providers;
    if (options.successRedirectUrl) body.auth_success_redirect_url = options.successRedirectUrl;
    if (options.failureRedirectUrl) body.auth_failure_redirect_url = options.failureRedirectUrl;

    const response = await this.fetchWithRetry(`${this.baseUrl}/auth/generateWidgetSession`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const parsed = widgetSessionSchema.safeParse(await response.json());
    if (!parsed.success) throw new TerraTransientError(response.status, 'terra widget session malformed');

    const expiresInSeconds = parsed.data.expires_in ?? 900;
    return {
      sessionId: parsed.data.session_id,
      url: parsed.data.url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async getUserInfo(args: { userId?: string; referenceId?: string }): Promise<TerraUserInfo[]> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return [];
    }
    const params: Record<string, string> = {};
    if (args.userId) params.user_id = args.userId;
    if (args.referenceId) params.reference_id = args.referenceId;
    const response = await this.fetchWithRetry(this.url('/userInfo', params), {
      headers: this.headers,
    });
    const parsed = userInfoResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new TerraTransientError(response.status, 'terra user info malformed');
    const data = parsed.data as TerraUserInfo | TerraUserInfo[] | { user: TerraUserInfo } | { users: TerraUserInfo[] };
    if (Array.isArray(data)) return data;
    if ('users' in data) return data.users;
    if ('user' in data) return [data.user];
    return [data];
  }

  async deauthenticateUser(terraUserId: string): Promise<{ status: string }> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return { status: 'success' };
    }
    const response = await this.fetchWithRetry(
      this.url('/auth/deauthenticateUser', { user_id: terraUserId }),
      {
        method: 'DELETE',
        headers: this.headers,
      },
    );
    const parsed = deauthResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new TerraTransientError(response.status, 'terra deauth malformed');
    return { status: parsed.data.status };
  }

  async getSleep(terraUserId: string, startDate: string, endDate: string): Promise<TerraSleepData[]> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return this.mockSleep(startDate, endDate);
    }
    const data = await this.getHistoricalData('/sleep', terraUserId, startDate, endDate);
    return data.map((raw) => mapSleep(raw, startDate, endDate));
  }

  async getActivity(terraUserId: string, startDate: string, endDate: string): Promise<TerraActivityData[]> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return this.mockActivity(startDate);
    }
    const data = await this.getHistoricalData('/activity', terraUserId, startDate, endDate);
    return data.map((raw) => mapActivity(raw, startDate));
  }

  async getBody(terraUserId: string, startDate: string, endDate: string): Promise<TerraBodyData[]> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return this.mockBody(startDate);
    }
    const data = await this.getHistoricalData('/body', terraUserId, startDate, endDate);
    return data.map((raw) => mapBody(raw, startDate));
  }

  async getDaily(terraUserId: string, startDate: string, endDate: string): Promise<TerraDailyData[]> {
    if (!this.isLiveConfigured()) {
      this.assertMockAllowed();
      return this.mockDaily(startDate);
    }
    const data = await this.getHistoricalData('/daily', terraUserId, startDate, endDate);
    return data.map((raw) => mapDaily(raw, startDate));
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    const type = payload.type as string;
    switch (type) {
      case 'sleep':
      case 'activity':
      case 'body':
      case 'daily':
        // Process and store data
        console.log(`[Terra] Received ${type} webhook for user ${payload.user?.toString()}`);
        break;
      case 'auth':
        console.log('[Terra] Auth webhook — user connected');
        break;
      case 'deauth':
        console.log('[Terra] Deauth webhook — user disconnected');
        break;
      default:
        console.log(`[Terra] Unknown webhook type: ${type}`);
    }
  }

  private async getHistoricalData(
    path: '/activity' | '/body' | '/daily' | '/sleep',
    terraUserId: string,
    startDate: string,
    endDate: string,
  ): Promise<unknown[]> {
    const response = await this.fetchWithRetry(
      this.url(path, {
        user_id: terraUserId,
        start_date: startDate,
        end_date: endDate,
        to_webhook: 'false',
      }),
      { headers: this.headers },
    );
    const parsed = dataResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new TerraTransientError(response.status, `terra ${path} malformed`);
    return parsed.data.data;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const maxAttempts = 3;
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      lastResponse = response;
      if (response.status === 401 || response.status === 403) throw new TerraAuthError();
      if (response.status === 429) {
        if (attempt === maxAttempts) {
          const retryAfter = Number(response.headers.get('retry-after')) || undefined;
          throw new TerraRateLimitError(retryAfter);
        }
        await this.backoff(attempt);
        continue;
      }
      if (response.status >= 500 && response.status < 600) {
        if (attempt === maxAttempts) return response;
        await this.backoff(attempt);
        continue;
      }
      if (!response.ok) throw new TerraTransientError(response.status);
      return response;
    }
    return lastResponse!;
  }

  private backoff(attempt: number): Promise<void> {
    if (process.env.VITEST || process.env.NODE_ENV === 'test') return Promise.resolve();
    const base = 200 * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * base);
    return new Promise((resolve) => setTimeout(resolve, base + jitter));
  }

  private url(path: string, params: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  private isLiveConfigured(): boolean {
    return Boolean(this.apiKey && this.devId);
  }

  private assertMockAllowed(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new TerraConfigError();
    }
  }

  private mockSession(referenceId: string): TerraSession {
    return {
      sessionId: `session_${Date.now()}`,
      url: `https://widget.tryterra.co/session/mock_${referenceId}`,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
  }

  private mockSleep(startDate: string, endDate: string): TerraSleepData[] {
    return [{
      start_time: `${startDate}T23:15:00Z`,
      end_time: `${endDate}T06:45:00Z`,
      duration_seconds: 27000,
      sleep_efficiency: 0.87,
      deep_sleep_seconds: 5400,
      rem_sleep_seconds: 6300,
      light_sleep_seconds: 12600,
      awake_seconds: 2700,
      avg_hr: 54,
      min_hr: 48,
      avg_hrv: 65,
      respiratory_rate: 14.5,
    }];
  }

  private mockActivity(startDate: string): TerraActivityData[] {
    return [{
      start_time: `${startDate}T07:00:00Z`,
      end_time: `${startDate}T08:15:00Z`,
      steps: 8430,
      calories: 2180,
      active_duration_seconds: 4500,
      avg_hr: 135,
      max_hr: 168,
      distance_meters: 6200,
    }];
  }

  private mockBody(startDate: string): TerraBodyData[] {
    return [{
      timestamp: `${startDate}T07:00:00Z`,
      weight_kg: 75.2,
      body_fat_percentage: 14.5,
      temperature_delta: -0.1,
    }];
  }

  private mockDaily(startDate: string): TerraDailyData[] {
    return [{
      date: startDate,
      steps: 8430,
      calories: 2180,
      active_minutes: 45,
      resting_hr: 52,
      avg_hrv: 68,
      stress_level: 35,
      recovery_score: 74,
    }];
  }
}

function mapDaily(raw: unknown, startDate: string): TerraDailyData {
  const row = asRecord(raw);
  const metadata = asRecord(row.metadata);
  const distance = asRecord(row.distance_data);
  const calories = asRecord(row.calories_data);
  const durations = asRecord(row.active_durations_data);
  const heart = asRecord(row.heart_rate_data);
  const heartSummary = asRecord(heart.summary);
  const stress = asRecord(row.stress_data);
  const scores = asRecord(row.scores);
  return {
    date: dateFrom(firstString(row.date, metadata.start_time), startDate),
    steps: numberFrom(firstNumber(row.steps, distance.steps), 0),
    calories: numberFrom(firstNumber(row.calories, calories.total_burned_calories), 0),
    active_minutes: numberFrom(firstNumber(row.active_minutes, secondsToMinutes(durations.activity_seconds)), 0),
    resting_hr: numberFrom(firstNumber(row.resting_hr, heartSummary.resting_hr_bpm), 0),
    avg_hrv: numberFrom(firstNumber(row.avg_hrv, heartSummary.hrv_rmssd), 0),
    stress_level: nullableNumber(firstNumber(row.stress_level, stress.avg_stress_level)),
    recovery_score: nullableNumber(firstNumber(row.recovery_score, scores.recovery)),
    raw,
  };
}

function mapSleep(raw: unknown, startDate: string, endDate: string): TerraSleepData {
  const row = asRecord(raw);
  const metadata = asRecord(row.metadata);
  const sleepDurations = asRecord(row.sleep_durations_data);
  const asleep = asRecord(sleepDurations.asleep);
  const awake = asRecord(sleepDurations.awake);
  const deep = asRecord(sleepDurations.deep);
  const rem = asRecord(sleepDurations.rem);
  const light = asRecord(sleepDurations.light);
  const heart = asRecord(row.heart_rate_data);
  const heartSummary = asRecord(heart.summary);
  const respiration = asRecord(row.respiration_data);
  return {
    start_time: firstString(row.start_time, metadata.start_time) ?? `${startDate}T23:15:00Z`,
    end_time: firstString(row.end_time, metadata.end_time) ?? `${endDate}T06:45:00Z`,
    duration_seconds: numberFrom(firstNumber(row.duration_seconds, asleep.duration_seconds, asleep.duration), 0),
    sleep_efficiency: numberFrom(firstNumber(row.sleep_efficiency, row.sleep_efficiency_percentage), 0),
    deep_sleep_seconds: numberFrom(firstNumber(row.deep_sleep_seconds, deep.duration_seconds), 0),
    rem_sleep_seconds: numberFrom(firstNumber(row.rem_sleep_seconds, rem.duration_seconds), 0),
    light_sleep_seconds: numberFrom(firstNumber(row.light_sleep_seconds, light.duration_seconds), 0),
    awake_seconds: numberFrom(firstNumber(row.awake_seconds, awake.duration_seconds, awake.duration), 0),
    avg_hr: numberFrom(firstNumber(row.avg_hr, heartSummary.avg_hr_bpm), 0),
    min_hr: numberFrom(firstNumber(row.min_hr, heartSummary.min_hr_bpm), 0),
    avg_hrv: numberFrom(firstNumber(row.avg_hrv, heartSummary.hrv_rmssd), 0),
    respiratory_rate: numberFrom(firstNumber(row.respiratory_rate, respiration.avg_breaths_per_min), 0),
    raw,
  };
}

function mapActivity(raw: unknown, startDate: string): TerraActivityData {
  const row = asRecord(raw);
  const metadata = asRecord(row.metadata);
  const distance = asRecord(row.distance_data);
  const calories = asRecord(row.calories_data);
  const durations = asRecord(row.active_durations_data);
  const heart = asRecord(row.heart_rate_data);
  const heartSummary = asRecord(heart.summary);
  return {
    start_time: firstString(row.start_time, metadata.start_time) ?? `${startDate}T07:00:00Z`,
    end_time: firstString(row.end_time, metadata.end_time) ?? `${startDate}T08:15:00Z`,
    steps: numberFrom(firstNumber(row.steps, distance.steps), 0),
    calories: numberFrom(firstNumber(row.calories, calories.net_activity_calories, calories.total_burned_calories), 0),
    active_duration_seconds: numberFrom(firstNumber(row.active_duration_seconds, durations.activity_seconds), 0),
    avg_hr: numberFrom(firstNumber(row.avg_hr, heartSummary.avg_hr_bpm), 0),
    max_hr: numberFrom(firstNumber(row.max_hr, heartSummary.max_hr_bpm), 0),
    distance_meters: numberFrom(firstNumber(row.distance_meters, distance.distance_meters), 0),
    raw,
  };
}

function mapBody(raw: unknown, startDate: string): TerraBodyData {
  const row = asRecord(raw);
  const metadata = asRecord(row.metadata);
  const measurements = asRecord(row.measurements_data);
  return {
    timestamp: firstString(row.timestamp, metadata.start_time, metadata.end_time) ?? `${startDate}T07:00:00Z`,
    weight_kg: nullableNumber(firstNumber(row.weight_kg, measurements.weight_kg)),
    body_fat_percentage: nullableNumber(firstNumber(row.body_fat_percentage, measurements.bodyfat_percentage)),
    temperature_delta: nullableNumber(firstNumber(row.temperature_delta, measurements.temperature_delta)),
    raw,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function numberFrom(value: number | null, fallback: number): number {
  return value ?? fallback;
}

function nullableNumber(value: number | null): number | null {
  return value ?? null;
}

function secondsToMinutes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 60 : null;
}

function dateFrom(value: string | null, fallback: string): string {
  return value ? value.split('T')[0] : fallback;
}
