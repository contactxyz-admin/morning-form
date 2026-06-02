import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TerraAuthError,
  TerraClient,
  TerraConfigError,
  TerraRateLimitError,
  TerraTransientError,
} from './terra';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

describe('TerraClient mock mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a deterministic widget session shape in non-production without credentials', async () => {
    const session = await new TerraClient('', '').generateWidgetSession('user-1');
    expect(session).toEqual({
      sessionId: 'session_1780390800000',
      url: 'https://widget.tryterra.co/session/mock_user-1',
      expiresAt: '2026-06-02T09:10:00.000Z',
    });
  });

  it('keeps the existing Terra daily mock contract', async () => {
    const daily = await new TerraClient('', '').getDaily('terra-user-1', '2026-06-01', '2026-06-02');
    expect(daily).toEqual([
      {
        date: '2026-06-01',
        steps: 8430,
        calories: 2180,
        active_minutes: 45,
        resting_hr: 52,
        avg_hrv: 68,
        stress_level: 35,
        recovery_score: 74,
      },
    ]);
  });
});

describe('TerraClient live API surface', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T09:00:00.000Z'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('fails loud in production when Terra credentials are absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(new TerraClient('', '').generateWidgetSession('user-1')).rejects.toBeInstanceOf(
      TerraConfigError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generateWidgetSession sends Garmin-only provider and redirect URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        session_id: 'terra-session-1',
        url: 'https://widget.tryterra.co/session/terra-session-1',
        status: 'success',
        expires_in: 900,
      }),
    );

    const session = await new TerraClient('api-key', 'dev-id').generateWidgetSession('user-1', {
      providers: 'GARMIN',
      successRedirectUrl: 'https://app.test/api/health/callback/garmin?terra_status=success',
      failureRedirectUrl: 'https://app.test/api/health/callback/garmin?terra_status=failure',
    });

    expect(session).toEqual({
      sessionId: 'terra-session-1',
      url: 'https://widget.tryterra.co/session/terra-session-1',
      expiresAt: '2026-06-02T09:15:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tryterra.co/v2/auth/generateWidgetSession');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'dev-id': 'dev-id',
      'x-api-key': 'api-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      language: 'en',
      reference_id: 'user-1',
      providers: 'GARMIN',
      auth_success_redirect_url: 'https://app.test/api/health/callback/garmin?terra_status=success',
      auth_failure_redirect_url: 'https://app.test/api/health/callback/garmin?terra_status=failure',
    });
  });

  it('401 responses become TerraAuthError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(
      new TerraClient('api-key', 'dev-id').generateWidgetSession('user-1'),
    ).rejects.toBeInstanceOf(TerraAuthError);
  });

  it('429 retries up to three times then throws TerraRateLimitError', async () => {
    fetchMock.mockResolvedValue(
      new Response('', { status: 429, headers: { 'retry-after': '13' } }),
    );
    const err = await new TerraClient('api-key', 'dev-id')
      .getUserInfo({ userId: 'terra-user-1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TerraRateLimitError);
    expect((err as TerraRateLimitError).retryAfterSeconds).toBe(13);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('5xx retries then returns data on eventual success', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              metadata: { start_time: '2026-06-01T12:00:00Z' },
              distance_data: { steps: 9000 },
              calories_data: { total_burned_calories: 2400 },
              heart_rate_data: { summary: { resting_hr_bpm: 51 } },
            },
          ],
        }),
      );

    const daily = await new TerraClient('api-key', 'dev-id').getDaily(
      'terra-user-1',
      '2026-06-01',
      '2026-06-02',
    );
    expect(daily[0]).toMatchObject({ date: '2026-06-01', steps: 9000, calories: 2400, resting_hr: 51 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('historical pull requests pass user_id, date range, and to_webhook=false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await new TerraClient('api-key', 'dev-id').getActivity('terra-user-1', '2026-06-01', '2026-06-02');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.tryterra.co/v2/activity');
    expect(parsed.searchParams.get('user_id')).toBe('terra-user-1');
    expect(parsed.searchParams.get('start_date')).toBe('2026-06-01');
    expect(parsed.searchParams.get('end_date')).toBe('2026-06-02');
    expect(parsed.searchParams.get('to_webhook')).toBe('false');
  });

  it('malformed live responses fail visibly', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'success' }));
    await expect(
      new TerraClient('api-key', 'dev-id').generateWidgetSession('user-1'),
    ).rejects.toBeInstanceOf(TerraTransientError);
  });

  it('deauthenticateUser calls the Terra deauth endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'success' }));
    await expect(new TerraClient('api-key', 'dev-id').deauthenticateUser('terra-user-1')).resolves.toEqual({
      status: 'success',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.tryterra.co/v2/auth/deauthenticateUser');
    expect(parsed.searchParams.get('user_id')).toBe('terra-user-1');
    expect(init.method).toBe('DELETE');
  });
});

