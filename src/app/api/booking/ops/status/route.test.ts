import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const OPS_SECRET = 'ops-secret-at-least-32-characters-long-xxxxx';

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/env', () => ({
  env: { NODE_ENV: 'test', OPS_SECRET: 'ops-secret-at-least-32-characters-long-xxxxx' },
}));

import { POST } from './route';
import { decryptToken } from '@/lib/health/crypto';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function seedBooking(suffix: string, status: string): Promise<{ id: string; userId: string }> {
  const userId = await makeTestUser(prisma, suffix);
  const row = await prisma.bookingRequest.create({
    data: { userId, markerNames: JSON.stringify(['hs-CRP']), market: 'uk', status },
  });
  return { id: row.id, userId };
}

function postWith(body: unknown, secret?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['authorization'] = `Bearer ${secret}`;
  return new NextRequest('http://localhost/api/booking/ops/status', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/booking/ops/status', () => {
  it('401 with no/empty authorization (non-ops caller)', async () => {
    const res = await POST(postWith({ action: 'list' }));
    expect(res.status).toBe(401);
  });

  it('401 with a wrong OPS_SECRET', async () => {
    const res = await POST(postWith({ action: 'list' }, 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('arrange: requested → arranged', async () => {
    const { id } = await seedBooking('ops-arrange', 'requested');
    const res = await POST(postWith({ action: 'arrange', bookingId: id }, OPS_SECRET));
    expect(res.status).toBe(200);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('arranged');
  });

  it('arrange rejects an invalid transition from delivered → 409', async () => {
    const { id } = await seedBooking('ops-arrange-bad', 'delivered');
    const res = await POST(postWith({ action: 'arrange', bookingId: id }, OPS_SECRET));
    expect(res.status).toBe(409);
  });

  it('deliver requires a codeReference (min length)', async () => {
    const { id } = await seedBooking('ops-deliver-nocode', 'arranged');
    const res = await POST(postWith({ action: 'deliver', bookingId: id }, OPS_SECRET));
    expect(res.status).toBe(400);
  });

  it('deliver stores the encrypted code, nulls markerNames, and the code decrypts', async () => {
    const { id } = await seedBooking('ops-deliver', 'arranged');
    const res = await POST(postWith({ action: 'deliver', bookingId: id, codeReference: 'REDEEM-ABC-123' }, OPS_SECRET));
    expect(res.status).toBe(200);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('delivered');
    expect(row.markerNames).toBeNull();
    expect(row.codeEncrypted).toBeTruthy();
    // Ciphertext, not plaintext.
    expect(row.codeEncrypted).not.toContain('REDEEM-ABC-123');
    expect(decryptToken(row.codeEncrypted!)).toBe('REDEEM-ABC-123');
  });

  it('deliver rejects a non-arranged booking → 409', async () => {
    const { id } = await seedBooking('ops-deliver-bad', 'requested');
    const res = await POST(postWith({ action: 'deliver', bookingId: id, codeReference: 'X' }, OPS_SECRET));
    expect(res.status).toBe(409);
  });

  it('concurrency: a stale conditional arrange returns 409 (status changed underneath)', async () => {
    const { id } = await seedBooking('ops-stale', 'requested');
    // Simulate a concurrent cancel landing first.
    await prisma.bookingRequest.update({ where: { id }, data: { status: 'cancelled' } });
    const res = await POST(postWith({ action: 'arrange', bookingId: id }, OPS_SECRET));
    expect(res.status).toBe(409);
  });

  it('cancel rejects a delivered booking → 409', async () => {
    const { id } = await seedBooking('ops-cancel-bad', 'delivered');
    const res = await POST(postWith({ action: 'cancel', bookingId: id }, OPS_SECRET));
    expect(res.status).toBe(409);
  });
});
