import { describe, expect, it } from 'vitest';
import { LibreClient } from './libre';

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
