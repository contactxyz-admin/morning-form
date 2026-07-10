import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string; name?: string | null; signupMarket?: string | null } | null>>();
const sendEmailMock = vi.fn<(args: { to: string; subject: string; text: string }) => Promise<{ sent: boolean }>>(
  async () => ({ sent: true }),
);

const envMock = {
  NODE_ENV: 'test',
  CONCIERGE_BOOKING_ENABLED: 'true',
  OPS_EMAIL: 'ops@example.com',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
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

vi.mock('@/lib/auth/email', () => ({
  sendEmail: (args: { to: string; subject: string; text: string }) => sendEmailMock(args),
}));

import { POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true });
  envMock.CONCIERGE_BOOKING_ENABLED = 'true';
  envMock.OPS_EMAIL = 'ops@example.com';
});

async function makeUser(suffix: string, signupMarket?: string): Promise<{ id: string; email: string; signupMarket?: string | null }> {
  const id = await makeTestUser(prisma, suffix);
  if (signupMarket) {
    await prisma.user.update({ where: { id }, data: { signupMarket } });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email, signupMarket: user.signupMarket };
}

function postWith(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/booking/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// A canonical marker present in the content layer.
const CANONICAL = 'hs-CRP';

describe('POST /api/booking/request', () => {
  it('404 when the flag is off', async () => {
    envMock.CONCIERGE_BOOKING_ENABLED = '';
    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
    expect(res.status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('400 on a non-canonical marker, no row', async () => {
    const user = await makeUser('req-noncanon');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ markerNames: ['Definitely Not A Marker'], market: 'uk' }));
    expect(res.status).toBe(400);
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(0);
  });

  it('422 for a blocked US state, no row and state never persisted', async () => {
    const user = await makeUser('req-blocked', 'us');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'us', usState: 'NY' }));
    expect(res.status).toBe(422);
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('422 when US market is missing the state', async () => {
    const user = await makeUser('req-nostate', 'us');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'us' }));
    expect(res.status).toBe(422);
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(0);
  });

  it('400 on market mismatch vs signupMarket', async () => {
    const user = await makeUser('req-mismatch', 'uk');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'us', usState: 'CA' }));
    expect(res.status).toBe(400);
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(0);
  });

  it('happy path: creates a row, ops email is reference-only, user confirmation sent', async () => {
    const user = await makeUser('req-happy', 'uk');
    currentUserMock.mockResolvedValue(user);

    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
    expect(res.status).toBe(201);

    const rows = await prisma.bookingRequest.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('requested');

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const opsEmail = sendEmailMock.mock.calls.find((c) => c[0].to === 'ops@example.com')![0];
    // Reference-only: no marker name, no identity.
    expect(opsEmail.text).not.toContain(CANONICAL);
    expect(opsEmail.text).not.toContain(user.email);
    expect(opsEmail.text).toContain(rows[0].id);

    const userEmail = sendEmailMock.mock.calls.find((c) => c[0].to === user.email)![0];
    // No redemption code promised in email.
    expect(userEmail.text).not.toContain(CANONICAL);
  });

  it('links an owned open measure Action', async () => {
    const user = await makeUser('req-action', 'uk');
    currentUserMock.mockResolvedValue(user);
    const action = await prisma.action.create({
      data: { userId: user.id, scribeRequestId: `r-${user.id}`, verb: 'measure', label: 'Check', markerName: CANONICAL },
    });

    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk', actionId: action.id }));
    expect(res.status).toBe(201);
    const row = await prisma.bookingRequest.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.actionId).toBe(action.id);
  });

  it('rejects a foreign actionId with 400, no row', async () => {
    const owner = await makeUser('req-owner', 'uk');
    const attacker = await makeUser('req-attacker', 'uk');
    const foreignAction = await prisma.action.create({
      data: { userId: owner.id, scribeRequestId: `r-${owner.id}`, verb: 'measure', label: 'Check', markerName: CANONICAL },
    });
    currentUserMock.mockResolvedValue(attacker);

    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk', actionId: foreignAction.id }));
    expect(res.status).toBe(400);
    expect(await prisma.bookingRequest.count({ where: { userId: attacker.id } })).toBe(0);
  });

  it('ops-email failure → row deleted + 502', async () => {
    const user = await makeUser('req-emailfail', 'uk');
    currentUserMock.mockResolvedValue(user);
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
    expect(res.status).toBe(502);
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(0);
  });

  it('fires BOOKING_REQUESTED once per created row, keyed to the booking id', async () => {
    const user = await makeUser('req-funnel', 'uk');
    currentUserMock.mockResolvedValue(user);

    const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
    expect(res.status).toBe(201);
    const row = await prisma.bookingRequest.findFirstOrThrow({ where: { userId: user.id } });

    const events = await prisma.funnelEvent.findMany({
      where: { funnelId: row.id, event: 'booking_requested' },
    });
    expect(events).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(events[0].properties))).toMatchObject({
      market: 'uk',
      retestLinked: false,
    });
  });

  it('no BOOKING_REQUESTED event on the ops-email-failure (deleted row) path', async () => {
    const user = await makeUser('req-funnelfail', 'uk');
    currentUserMock.mockResolvedValue(user);
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    expect((await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }))).status).toBe(502);
    expect(
      await prisma.funnelEvent.count({ where: { userId: user.id, event: 'booking_requested' } }),
    ).toBe(0);
  });

  it('rate-limits after the per-user window is exhausted → 429, no extra row', async () => {
    const user = await makeUser('req-ratelimit', 'uk');
    currentUserMock.mockResolvedValue(user);

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await POST(postWith({ markerNames: [CANONICAL], market: 'uk' }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    // 5 allowed rows max in the window.
    expect(await prisma.bookingRequest.count({ where: { userId: user.id } })).toBe(5);
  });
});
