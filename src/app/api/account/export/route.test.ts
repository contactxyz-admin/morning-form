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
// The assembler is mocked so individual tests can force it to throw (archive
// limit / generic) without seeding data. By default it delegates to the real
// implementation so happy-path tests exercise the real ZIP build.
const assembleArchiveMock = vi.fn<(prisma: unknown, userId: string) => Promise<unknown>>();

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

vi.mock('@/lib/account/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/account/export')>();
  return {
    ...actual,
    assembleExportArchive: (prismaArg: unknown, userId: string) =>
      assembleArchiveMock(prismaArg, userId),
  };
});

import { ARCHIVE_LIMIT_MESSAGE } from '@/lib/account/export';
import { GET, POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

let realAssembleExportArchive: typeof import('@/lib/account/export').assembleExportArchive;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/lib/account/export')>('@/lib/account/export');
  realAssembleExportArchive = actual.assembleExportArchive;
});

afterEach(() => {
  currentUserMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true });
  putMock.mockReset();
  putMock.mockResolvedValue({ url: 'https://blob.test/x.zip', pathname: 'x' } as never);
  getMock.mockReset();
  // Default: delegate to the real assembler (real ZIP build over mocked blob).
  assembleArchiveMock.mockReset();
  assembleArchiveMock.mockImplementation((prismaArg, userId) =>
    realAssembleExportArchive(prismaArg as never, userId),
  );
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
    // The 500 body carries only { error } — find the row by userId.
    const failedRow = await prisma.exportRequest.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
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
    // The 500 body carries only { error }, not the row id — find by userId.
    const row = await prisma.exportRequest.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.status).toBe('failed');
    // The raw SDK error must NOT leak to the user-visible failureReason — it is
    // sanitized to a generic message (the raw error goes to console.error only).
    expect(row.failureReason).toBe('Export failed. Please try again.');
    expect(row.failureReason).not.toContain('upload boom');

    // Notice email WAS sent; download email was NOT (only 1 email total).
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const subject = sendEmailMock.mock.calls[0][0].subject;
    expect(subject).toMatch(/requested/i);
  });

  it('archive-limit failure: failureReason is the exact ARCHIVE_LIMIT_MESSAGE, notice sent, no download email', async () => {
    const user = await makeUser('exp-archlimit');
    currentUserMock.mockResolvedValue(user);
    // Assembler throws the user-meaningful archive-limit error — it must pass
    // through verbatim to failureReason (it is the one internal error we surface).
    assembleArchiveMock.mockRejectedValueOnce(new Error(ARCHIVE_LIMIT_MESSAGE));

    const res = await POST(postRequest());
    expect(res.status).toBe(500);
    const row = await prisma.exportRequest.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe(ARCHIVE_LIMIT_MESSAGE);

    // Notice email sent (1), no download email.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].subject).toMatch(/requested/i);
  });

  it('generic assembler failure: failureReason is the sanitized generic message (raw error not leaked)', async () => {
    const user = await makeUser('exp-genericfail');
    currentUserMock.mockResolvedValue(user);
    assembleArchiveMock.mockRejectedValueOnce(new Error('internal prisma column boom'));

    const res = await POST(postRequest());
    expect(res.status).toBe(500);
    const row = await prisma.exportRequest.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe('Export failed. Please try again.');
    expect(row.failureReason).not.toContain('boom');
  });

  it('concurrent double-POST never creates more than the allowed non-failed rows', async () => {
    const user = await makeUser('exp-concurrent');
    currentUserMock.mockResolvedValue(user);

    // Fire several POSTs concurrently. Each may 200 (won a slot) or 429 (lost a
    // slot / serialization conflict). The invariant we assert is on the rows:
    // at most RATE_LIMIT_MAX (2) non-failed rows can exist in the window.
    const responses = await Promise.all([
      POST(postRequest()),
      POST(postRequest()),
      POST(postRequest()),
      POST(postRequest()),
    ]);
    for (const res of responses) {
      expect([200, 429]).toContain(res.status);
    }

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nonFailed = await prisma.exportRequest.count({
      where: { userId: user.id, status: { not: 'failed' }, createdAt: { gte: windowStart } },
    });
    expect(nonFailed).toBeLessThanOrEqual(2);
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
