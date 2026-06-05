import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const SECRET = 'test-session-secret-at-least-32-chars-long-xxxx';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
const sendEmailMock = vi.fn<(args: { to: string; subject: string; text: string; html?: string }) => Promise<{ sent: boolean }>>(
  async () => ({ sent: true }),
);

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
  sendEmail: (args: { to: string; subject: string; text: string; html?: string }) => sendEmailMock(args),
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
});

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

function postWith(body: unknown): Request {
  return new Request('http://localhost/api/account/delete/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/delete/request', () => {
  it('401 when unauthenticated, no token issued', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(postWith({ confirm: 'DELETE' }));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('400 when typed confirmation missing/wrong, no token issued', async () => {
    const user = await makeUser('req-noconfirm');
    currentUserMock.mockResolvedValue(user);
    const res = await POST(postWith({ confirm: 'delete' }));
    expect(res.status).toBe(400);
    expect(await prisma.accountDeletionToken.count({ where: { userId: user.id } })).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('happy path: issues single-use token, emails confirmation page link', async () => {
    const user = await makeUser('req-happy');
    currentUserMock.mockResolvedValue(user);

    const res = await POST(postWith({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);

    const tokens = await prisma.accountDeletionToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].consumedAt).toBeNull();
    // ~15 min expiry.
    const ttl = tokens[0].expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(13 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const email = sendEmailMock.mock.calls[0][0];
    expect(email.to).toBe(user.email);
    // Link points at the side-effect-free PAGE, not the API route.
    expect(email.text).toContain('/account/delete/confirm?token=');
    expect(email.text).not.toContain('/api/account/delete/confirm');

    // The emailed raw token hashes to the stored hash.
    const rawToken = email.text.match(/token=([^\s&]+)/)?.[1];
    expect(rawToken).toBeTruthy();
    const hash = createHmac('sha256', SECRET)
      .update('account-deletion:')
      .update(decodeURIComponent(rawToken!))
      .digest('hex');
    expect(hash).toBe(tokens[0].tokenHash);
  });

  it('502 when the confirmation email fails to send', async () => {
    const user = await makeUser('req-emailfail');
    currentUserMock.mockResolvedValue(user);
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(postWith({ confirm: 'DELETE' }));
    expect(res.status).toBe(502);
  });
});
