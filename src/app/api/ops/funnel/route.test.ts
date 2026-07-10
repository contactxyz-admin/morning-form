import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { GET } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  envMock.COMPANY_OPS_ENABLED = 'true';
});

describe('GET /api/ops/funnel', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 's1', email: 'reuben@contact.xyz' });
    expect((await GET()).status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('403 for a signed-in member who is not staff', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'member@example.com' });
    expect((await GET()).status).toBe(403);
  });

  it('200 for staff with the aggregate snapshot shape (counts only)', async () => {
    currentUserMock.mockResolvedValue({ id: 's1', email: 'reuben@contact.xyz' });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.members).toBe('number');
    expect(typeof body.protocolsDelivered).toBe('number');
    expect(typeof body.drawsCompleted).toBe('number');
    expect(body.bookingRequests).toHaveProperty('byStatus');
    expect(body.bookingRequests).toHaveProperty('retestLinked');
    expect(body).toHaveProperty('eventStages');
    // Counts only — the payload must never carry an email address.
    expect(JSON.stringify(body)).not.toContain('@');
  });
});
