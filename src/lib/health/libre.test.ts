import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibreClient, LibreAuthError, LibreRateLimitError, LibreTransientError } from './libre';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

describe('LibreClient.login (mock mode)', () => {
  it('returns a deterministic session token + expiry + patientId for the given email', async () => {
    const client = new LibreClient(false);
    const a = await client.login('user@example.com', 'pw');
    const b = await client.login('user@example.com', 'different-pw');
    expect(a.accessToken).toBe(b.accessToken);
    expect(a.patientId).toBe(b.patientId);
    expect(a.accessToken).toMatch(/^mock_libre_/);
    expect(a.patientId).toMatch(/^mock_patient_/);
    expect(a.expiresAt).toBeGreaterThan(Date.now());
  });

  it('different emails produce different mock sessions', async () => {
    const client = new LibreClient(false);
    const a = await client.login('alice@example.com', 'x');
    const b = await client.login('bob@example.com', 'x');
    expect(a.accessToken).not.toBe(b.accessToken);
  });
});

describe('LibreClient.getGlucoseGraph (mock mode)', () => {
  it('returns exactly 96 readings (15-min cadence × 24h)', async () => {
    const client = new LibreClient(false);
    const readings = await client.getGlucoseGraph('p1');
    expect(readings.length).toBe(96);
  });

  it('every reading is mg/dL with a finite value and ISO timestamp', async () => {
    const client = new LibreClient(false);
    const readings = await client.getGlucoseGraph('p1', undefined, '2026-04-13');
    for (const r of readings) {
      expect(r.unit).toBe('mg/dL');
      expect(Number.isFinite(r.value)).toBe(true);
      expect(new Date(r.timestamp).toISOString()).toBe(r.timestamp);
    }
  });

  it('includes at least one hyper (>180) and one hypo (<70) excursion so Unit 5 rules can fire', async () => {
    const readings = await new LibreClient(false).getGlucoseGraph('p1', undefined, '2026-04-13');
    expect(readings.some((r) => r.value > 180)).toBe(true);
    expect(readings.some((r) => r.value < 70)).toBe(true);
  });

  it('is deterministic across calls with the same startDate', async () => {
    const a = await new LibreClient(false).getGlucoseGraph('p1', undefined, '2026-04-13');
    const b = await new LibreClient(false).getGlucoseGraph('p1', undefined, '2026-04-13');
    expect(a).toEqual(b);
  });
});

describe('LibreClient real-path error handling', () => {
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

  it('login: 401 throws LibreAuthError (no retry)', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(new LibreClient(true).login('a@b.c', 'pw')).rejects.toBeInstanceOf(LibreAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('login: malformed response body surfaces as LibreTransientError', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: 'shape' }));
    await expect(new LibreClient(true).login('a@b.c', 'pw')).rejects.toBeInstanceOf(LibreTransientError);
  });

  it('graph: 401 throws LibreAuthError', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(
      new LibreClient(true).getGlucoseGraph('p1', 'tok', '2026-04-13'),
    ).rejects.toBeInstanceOf(LibreAuthError);
  });

  it('graph: 429 retries up to 3 times then throws LibreRateLimitError', async () => {
    installFetch();
    fetchMock.mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '7' } }));
    const err = await new LibreClient(true)
      .getGlucoseGraph('p1', 'tok', '2026-04-13')
      .catch((e) => e);
    expect(err).toBeInstanceOf(LibreRateLimitError);
    expect((err as LibreRateLimitError).retryAfterSeconds).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('graph: 5xx retries then returns data on eventual success', async () => {
    installFetch();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { graphData: [{ Timestamp: '2026-04-13T10:00:00.000Z', Value: 110 }] } }),
      );
    const readings = await new LibreClient(true).getGlucoseGraph('p1', 'tok', '2026-04-13');
    expect(readings).toEqual([
      { timestamp: '2026-04-13T10:00:00.000Z', value: 110, unit: 'mg/dL' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('graph: malformed payload throws LibreTransientError', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { graphData: [{ wrong: 'shape' }] } }));
    await expect(
      new LibreClient(true).getGlucoseGraph('p1', 'tok', '2026-04-13'),
    ).rejects.toBeInstanceOf(LibreTransientError);
  });

  it('graph: happy path maps real LibreLinkUp response to mg/dL readings', async () => {
    installFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          graphData: [
            { Timestamp: '2026-04-13T07:00:00.000Z', Value: 101 },
            { Timestamp: '2026-04-13T07:15:00.000Z', Value: 108 },
          ],
        },
      }),
    );
    const readings = await new LibreClient(true).getGlucoseGraph('patient-42', 'real-token', '2026-04-13');
    expect(readings).toHaveLength(2);
    expect(readings[0]).toEqual({
      timestamp: '2026-04-13T07:00:00.000Z',
      value: 101,
      unit: 'mg/dL',
    });
    const callInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>).Authorization).toBe('Bearer real-token');
    expect(fetchMock.mock.calls[0][0]).toContain('patient-42');
  });
});
