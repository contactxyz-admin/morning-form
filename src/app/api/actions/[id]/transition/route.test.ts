import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = { NODE_ENV: 'test', DECISIONS_ENABLED: 'true' };

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
  envMock.DECISIONS_ENABLED = 'true';
});

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

async function makeAction(
  userId: string,
  overrides: Partial<{ state: string; verb: string; markerName: string | null }> = {},
): Promise<string> {
  const a = await prisma.action.create({
    data: {
      userId,
      scribeRequestId: `req-${userId}-${Math.random().toString(36).slice(2)}`,
      verb: overrides.verb ?? 'measure',
      label: 'Re-check ferritin',
      markerName: overrides.markerName === undefined ? 'Ferritin' : overrides.markerName,
      state: overrides.state ?? 'suggested',
    },
  });
  return a.id;
}

function postWith(id: string, body: unknown): { req: NextRequest; ctx: { params: { id: string } } } {
  const req = new NextRequest(`http://localhost/api/actions/${id}/transition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: { id } } };
}

describe('POST /api/actions/[id]/transition', () => {
  it('404 when DECISIONS_ENABLED is off', async () => {
    envMock.DECISIONS_ENABLED = '';
    const user = await makeUser('tr-flagoff');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id);
    const { req, ctx } = postWith(id, { to: 'accepted' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    // State unchanged.
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('suggested');
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const { req, ctx } = postWith('any-id', { to: 'accepted' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('suggested → accepted persists state + acceptedAt', async () => {
    const user = await makeUser('tr-accept');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id);
    const { req, ctx } = postWith(id, { to: 'accepted' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('accepted');
    expect(row.acceptedAt).toBeInstanceOf(Date);
  });

  it('invalid suggested → completed → 409, no change', async () => {
    const user = await makeUser('tr-invalid');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id);
    const { req, ctx } = postWith(id, { to: 'completed' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('suggested');
  });

  it('P0 regression: to:"outcome-measured" → 400, state unchanged, no ActionOutcome', async () => {
    const user = await makeUser('tr-bypass');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id, { state: 'completed', verb: 'measure' });
    const { req, ctx } = postWith(id, { to: 'outcome-measured' });

    const res = await POST(req, ctx);
    // Rejected by zod (outcome-measured not in the enum) → 400.
    expect(res.status).toBe(400);
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('completed');
    const outcomes = await prisma.actionOutcome.count({ where: { actionId: id } });
    expect(outcomes).toBe(0);
  });

  it("another user's action → 404 (no existence leak)", async () => {
    const owner = await makeUser('tr-owner');
    const attacker = await makeUser('tr-attacker');
    const id = await makeAction(owner.id);
    currentUserMock.mockResolvedValue(attacker);
    const { req, ctx } = postWith(id, { to: 'accepted' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('suggested');
  });

  it('race double-submit: exactly one accepted→completed succeeds', async () => {
    const user = await makeUser('tr-race');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id, { state: 'accepted' });

    const a = postWith(id, { to: 'completed' });
    const b = postWith(id, { to: 'completed' });
    const [r1, r2] = await Promise.all([POST(a.req, a.ctx), POST(b.req, b.ctx)]);

    const statuses = [r1.status, r2.status].sort();
    // One succeeds (200), the loser sees the state already moved (409).
    expect(statuses).toEqual([200, 409]);
    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('completed');
  });

  it('dismissed is terminal: dismissed → accepted rejected (409)', async () => {
    const user = await makeUser('tr-terminal');
    currentUserMock.mockResolvedValue(user);
    const id = await makeAction(user.id, { state: 'dismissed' });
    const { req, ctx } = postWith(id, { to: 'accepted' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
  });
});
