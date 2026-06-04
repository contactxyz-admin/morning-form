import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
const sendEmailMock = vi.fn<(args: SentEmail) => Promise<{ sent: boolean }>>(async () => ({ sent: true }));
const putMock =
  vi.fn<(pathname: string, body: unknown, opts: { access: string; multipart: boolean }) => Promise<unknown>>(
    async () => ({ url: 'https://blob.test/x.zip', pathname: 'x' }),
  );
const getMock = vi.fn();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('@/lib/auth/email', () => ({
  sendEmail: (args: SentEmail) => sendEmailMock(args),
}));

vi.mock('@vercel/blob', () => ({
  put: (pathname: string, body: unknown, opts: { access: string; multipart: boolean }) =>
    putMock(pathname, body, opts),
  get: (...args: unknown[]) => getMock(...args),
}));

import { GET, POST } from './route';

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
  putMock.mockReset();
  putMock.mockResolvedValue({ url: 'https://blob.test/x.zip', pathname: 'x' } as never);
  getMock.mockReset();
});

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

/** The export POST takes a Request (for resolveAppOrigin's host fallback). */
function postRequest(): Request {
  return new Request('http://localhost/api/account/export', { method: 'POST' });
}

describe('POST /api/account/export', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(postRequest());
    expect(res.status).toBe(401);
  });

  it('happy path: completes, uploads, emails notice + download link', async () => {
    const user = await makeUser('exp-happy');
    currentUserMock.mockResolvedValue(user);

    const res = await POST(postRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('complete');

    const row = await prisma.exportRequest.findUniqueOrThrow({ where: { id: json.id } });
    expect(row.status).toBe('complete');
    expect(row.blobPath).toBe(`uploads/${user.id}/exports/${row.id}.zip`);
    expect(row.expiresAt).toBeTruthy();

    expect(putMock).toHaveBeenCalledTimes(1);
    const putOpts = putMock.mock.calls[0][2];
    expect(putOpts.access).toBe('private');
    expect(putOpts.multipart).toBe(true);

    // Two emails: notice + download link.
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const emails = sendEmailMock.mock.calls.map((c) => c[0]);
    const subjects = emails.map((e) => e.subject);
    expect(subjects.some((s) => /requested/i.test(s))).toBe(true);
    expect(subjects.some((s) => /ready/i.test(s))).toBe(true);
    // Download email points at the in-app proxy, NOT the blob URL.
    const downloadEmail = emails.find((e) => e.text.includes('/api/account/export/download'));
    expect(downloadEmail?.text).toContain('/api/account/export/download?id=');
    expect(downloadEmail?.text).not.toContain('blob.test');
  });

  it('rate limit: third non-failed request within 24h returns 429 + Retry-After', async () => {
    const user = await makeUser('exp-rl');
    currentUserMock.mockResolvedValue(user);

    await POST(postRequest());
    await POST(postRequest());
    const third = await POST(postRequest());
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBeTruthy();
    expect(Number(third.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('a failed request does NOT consume a rate-limit slot', async () => {
    const user = await makeUser('exp-failslot');
    currentUserMock.mockResolvedValue(user);

    // First request fails (blob upload throws).
    putMock.mockRejectedValueOnce(new Error('blob down'));
    const failed = await POST(postRequest());
    expect(failed.status).toBe(500);
    const failedJson = await failed.json();
    const failedRow = await prisma.exportRequest.findUniqueOrThrow({ where: { id: failedJson.id } });
    expect(failedRow.status).toBe('failed');

    // Two more should still succeed (failed one not counted), third 429.
    expect((await POST(postRequest())).status).toBe(200);
    expect((await POST(postRequest())).status).toBe(200);
    expect((await POST(postRequest())).status).toBe(429);
  });

  it('notice email rejects: export still completes (row complete, download sent)', async () => {
    const user = await makeUser('exp-noticefail');
    currentUserMock.mockResolvedValue(user);
    // First sendEmail call (the notice) rejects; the download email (2nd call)
    // resolves. The export must still complete.
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(postRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('complete');
    const row = await prisma.exportRequest.findUniqueOrThrow({ where: { id: json.id } });
    expect(row.status).toBe('complete');
  });

  it('download email rejects: response still success, row stays complete', async () => {
    const user = await makeUser('exp-dlfail');
    currentUserMock.mockResolvedValue(user);
    // Notice email (1st call) resolves; download email (2nd call) rejects. The
    // archive is already built + stored, so the row must stay complete and the
    // response succeed — a mailer outage must not flip it to failed.
    sendEmailMock
      .mockResolvedValueOnce({ sent: true })
      .mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(postRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('complete');
    const row = await prisma.exportRequest.findUniqueOrThrow({ where: { id: json.id } });
    expect(row.status).toBe('complete');
  });

  it('blob upload failure: row failed, notice email sent, no download email', async () => {
    const user = await makeUser('exp-blobfail');
    currentUserMock.mockResolvedValue(user);
    putMock.mockRejectedValueOnce(new Error('upload boom'));

    const res = await POST(postRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    const row = await prisma.exportRequest.findUniqueOrThrow({ where: { id: json.id } });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain('upload boom');

    // Notice email WAS sent; download email was NOT (only 1 email total).
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const subject = sendEmailMock.mock.calls[0][0].subject;
    expect(subject).toMatch(/requested/i);
  });
});

describe('GET /api/account/export', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns latest request status (null when none)', async () => {
    const user = await makeUser('exp-status-empty');
    currentUserMock.mockResolvedValue(user);
    const empty = await GET();
    expect((await empty.json()).request).toBeNull();

    currentUserMock.mockResolvedValue(user);
    await POST(postRequest());
    currentUserMock.mockResolvedValue(user);
    const after = await GET();
    const json = await after.json();
    expect(json.request.status).toBe('complete');
  });
});
