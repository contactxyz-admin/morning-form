import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { bookSlot } from '@/lib/pilot/booking';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  IN_GYM_BOOKING_ENABLED: 'true',
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

import { GET, POST } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  envMock.IN_GYM_BOOKING_ENABLED = 'true';
});

const STAFF = { id: 'staff-1', email: 'reuben@contact.xyz' };
const FUTURE_ISO = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function postWith(body: unknown) {
  return new NextRequest('http://localhost/api/pilot/slots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_SLOT = () => ({
  venueName: 'Third Space Soho',
  venueAddress: '67 Brewer St, London',
  startsAt: FUTURE_ISO(),
  capacity: 4,
});

describe('GET /api/pilot/slots — guards', () => {
  it('404 when IN_GYM_BOOKING_ENABLED is off', async () => {
    envMock.IN_GYM_BOOKING_ENABLED = '';
    currentUserMock.mockResolvedValue(STAFF);
    expect((await GET()).status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe('GET /api/pilot/slots — member view', () => {
  it('returns upcoming slots WITHOUT createdBy, plus the caller’s own booking', async () => {
    const userId = await makeTestUser(prisma, 'slots-get');
    currentUserMock.mockResolvedValue({ id: userId, email: 'member@example.com' });

    const slot = await prisma.pilotSlot.create({
      data: { ...VALID_SLOT(), startsAt: new Date(FUTURE_ISO()), createdBy: 'reuben@contact.xyz' },
    });
    await bookSlot(prisma, { userId, slotId: slot.id, signedName: 'Jane Doe' });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slots: Record<string, unknown>[];
      ownBooking: { slot: Record<string, unknown> } | null;
    };
    const mine = body.slots.find((s) => s.id === slot.id);
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty('createdBy');
    expect(body.ownBooking).not.toBeNull();
    expect(body.ownBooking?.slot).not.toHaveProperty('createdBy');
  });
});

describe('POST /api/pilot/slots — staff create', () => {
  it('403 for a signed-in member who is not staff', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'member@example.com' });
    expect((await POST(postWith(VALID_SLOT()))).status).toBe(403);
  });

  it('404 when the flag is off, even for staff', async () => {
    envMock.IN_GYM_BOOKING_ENABLED = '';
    currentUserMock.mockResolvedValue(STAFF);
    expect((await POST(postWith(VALID_SLOT()))).status).toBe(404);
  });

  it('creates a slot (201) stamped with the staff email', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    const res = await POST(postWith(VALID_SLOT()));
    expect(res.status).toBe(201);
    const { slot } = (await res.json()) as { slot: { id: string; createdBy: string } };
    expect(slot.createdBy).toBe('reuben@contact.xyz');
  });

  it('400 on a past startsAt', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    const past = { ...VALID_SLOT(), startsAt: new Date(Date.now() - 60_000).toISOString() };
    expect((await POST(postWith(past))).status).toBe(400);
  });

  it('400 on capacity outside 1..50', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    expect((await POST(postWith({ ...VALID_SLOT(), capacity: 0 }))).status).toBe(400);
    expect((await POST(postWith({ ...VALID_SLOT(), capacity: 51 }))).status).toBe(400);
  });

  it('400 on an empty venue name', async () => {
    currentUserMock.mockResolvedValue(STAFF);
    expect((await POST(postWith({ ...VALID_SLOT(), venueName: '  ' }))).status).toBe(400);
  });
});
