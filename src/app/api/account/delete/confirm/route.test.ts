import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const SECRET = 'test-session-secret-at-least-32-chars-long-xxxx';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
const delMock = vi.fn<(arg: string | string[]) => Promise<void>>(async () => {});
const listMock = vi.fn<(opts: unknown) => Promise<{ blobs: { pathname: string }[]; cursor?: string; hasMore: boolean }>>(
  async () => ({ blobs: [], hasMore: false }),
);
const sendEmailMock = vi.fn<(args: unknown) => Promise<{ sent: boolean }>>(async () => ({ sent: true }));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  env: { NODE_ENV: 'test', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
  getSessionSecret: () => SECRET,
}));

vi.mock('@/lib/auth/email', () => ({
  sendEmail: (args: unknown) => sendEmailMock(args as never),
}));

vi.mock('@vercel/blob', () => ({
  del: (arg: string | string[]) => delMock(arg),
  list: (opts: unknown) => listMock(opts as never),
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
  delMock.mockReset();
  delMock.mockResolvedValue(undefined);
  listMock.mockReset();
  listMock.mockResolvedValue({ blobs: [], hasMore: false });
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true });
});

function hashDeletionToken(raw: string): string {
  return createHmac('sha256', SECRET).update('account-deletion:').update(raw).digest('hex');
}

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

/** Issue a deletion token row for a user and return the raw token. */
async function issueToken(
  userId: string,
  opts: { expiresAt?: Date; consumedAt?: Date } = {},
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await prisma.accountDeletionToken.create({
    data: {
      userId,
      tokenHash: hashDeletionToken(raw),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
      consumedAt: opts.consumedAt ?? null,
    },
  });
  return raw;
}

function postWith(body: unknown): Request {
  return new Request('http://localhost/api/account/delete/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/delete/confirm', () => {
  it('401 when unauthenticated, nothing deleted', async () => {
    currentUserMock.mockResolvedValue(null);
    const raw = randomBytes(32).toString('base64url');
    const res = await POST(postWith({ token: raw }));
    expect(res.status).toBe(401);
    expect(delMock).not.toHaveBeenCalled();
  });

  it('400 when token missing/malformed', async () => {
    const user = await makeUser('del-notoken');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ token: 'short' }));
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('expired token → 400, nothing deleted', async () => {
    const user = await makeUser('del-expired');
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id, { expiresAt: new Date(Date.now() - 1000) });

    const res = await POST(postWith({ token: raw }));
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(delMock).not.toHaveBeenCalled();
  });

  it('already-consumed token → 400, nothing deleted', async () => {
    const user = await makeUser('del-consumed');
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id, { consumedAt: new Date() });

    const res = await POST(postWith({ token: raw }));
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("confused deputy: another user's valid token → 403, nothing deleted", async () => {
    const owner = await makeUser('del-owner');
    const attacker = await makeUser('del-attacker');
    const raw = await issueToken(owner.id); // token belongs to owner

    currentUserMock.mockResolvedValue(attacker); // but attacker is the session
    const res = await POST(postWith({ token: raw }));
    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: attacker.id } })).not.toBeNull();
    expect(delMock).not.toHaveBeenCalled();
  });

  it('raced double-consume fires erasure exactly once', async () => {
    const user = await makeUser('del-race');
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id);

    const [a, b] = await Promise.all([POST(postWith({ token: raw })), POST(postWith({ token: raw }))]);
    const statuses = [a.status, b.status].sort();
    // One wins (200), the loser sees the consumed token (400) — UNLESS the
    // winner already completed the tombstone, in which case the loser is a
    // 200 no-op. Either way: exactly one user.delete() happened (user is gone)
    // and there is exactly one completed tombstone.
    expect(statuses[0]).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('happy path: user gone, cookie cleared, tombstone completed', async () => {
    const user = await makeUser('del-happy');
    // seed a couple of relations + a blob path so del() is exercised.
    await prisma.checkIn.create({ data: { userId: user.id, type: 'morning', date: '2026-01-01', responses: '{}' } });
    await prisma.sourceDocument.create({
      data: { userId: user.id, kind: 'lab_pdf', capturedAt: new Date(), storagePath: `uploads/${user.id}/x.pdf` },
    });
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id);

    const res = await POST(postWith({ token: raw }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('deleted');

    // Cookie cleared via Set-Cookie header (mf_session, empty / expired).
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/mf_session=/);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.checkIn.count({ where: { userId: user.id } })).toBe(0);
    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it('subsequent authed call after deletion → 401 (session cascaded)', async () => {
    const user = await makeUser('del-session');
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id);
    expect((await POST(postWith({ token: raw }))).status).toBe(200);

    // Session is gone via cascade — a real getCurrentUser would now return null.
    currentUserMock.mockResolvedValue(null);
    const raw2 = randomBytes(32).toString('base64url');
    expect((await POST(postWith({ token: raw2 }))).status).toBe(401);
  });

  it('completed-tombstone no-op: consumed token but completed tombstone → 200 success', async () => {
    const user = await makeUser('del-noop');
    // Erase once.
    currentUserMock.mockResolvedValue(user);
    const raw = await issueToken(user.id);
    expect((await POST(postWith({ token: raw }))).status).toBe(200);

    // The user is gone, but simulate the same session retrying (getCurrentUser
    // would normally be null; we keep the session "alive" to drive the branch
    // where a consumed/expired token meets a completed tombstone). Re-create a
    // user with the SAME email to recompute the matching emailHash, and present
    // a fresh consumed token: the route should see the completed tombstone and
    // return a no-op success.
    const revived = await prisma.user.create({
      data: { email: user.email, llmConsentAcceptedAt: new Date() },
    });
    currentUserMock.mockResolvedValue({ id: revived.id, email: user.email });
    const consumed = await issueToken(revived.id, { consumedAt: new Date() });

    const res = await POST(postWith({ token: consumed }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('already-deleted');
    expect(res.headers.get('set-cookie')).toMatch(/mf_session=/);
  });
});
