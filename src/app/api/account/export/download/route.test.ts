import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
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
  env: { NODE_ENV: 'test', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('@vercel/blob', () => ({
  get: (...args: unknown[]) => getMock(...(args as [])),
}));

import { GET } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  getMock.mockReset();
});

function blobOk(bytes: Buffer) {
  return {
    statusCode: 200 as const,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
    headers: new Headers(),
    blob: {},
  };
}

function downloadRequest(id?: string): Request {
  const qs = id ? `?id=${id}` : '';
  return new Request(`https://app.test/api/account/export/download${qs}`);
}

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

async function makeCompleteExport(
  userId: string,
  opts: { expiresAt?: Date; blobPath?: string } = {},
): Promise<string> {
  const row = await prisma.exportRequest.create({
    data: {
      userId,
      status: 'complete',
      blobPath: opts.blobPath ?? `uploads/${userId}/exports/e.zip`,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
    },
  });
  return row.id;
}

describe('GET /api/account/export/download', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET(downloadRequest('x'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    const user = await makeUser('dl-noid');
    currentUserMock.mockResolvedValue(user);
    const res = await GET(downloadRequest());
    expect(res.status).toBe(400);
  });

  it('returns 404 for a different owner (no leak)', async () => {
    const owner = await makeUser('dl-owner');
    const other = await makeUser('dl-other');
    const id = await makeCompleteExport(owner.id);
    currentUserMock.mockResolvedValue(other);
    const res = await GET(downloadRequest(id));
    expect(res.status).toBe(404);
  });

  it('returns 404 when status is not complete', async () => {
    const user = await makeUser('dl-pending');
    currentUserMock.mockResolvedValue(user);
    const row = await prisma.exportRequest.create({ data: { userId: user.id, status: 'pending' } });
    const res = await GET(downloadRequest(row.id));
    expect(res.status).toBe(404);
  });

  it('returns 410 when expired', async () => {
    const user = await makeUser('dl-expired');
    currentUserMock.mockResolvedValue(user);
    const id = await makeCompleteExport(user.id, { expiresAt: new Date(Date.now() - 1000) });
    const res = await GET(downloadRequest(id));
    expect(res.status).toBe(410);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('returns 410 and marks stale when blob get() returns null', async () => {
    const user = await makeUser('dl-null');
    currentUserMock.mockResolvedValue(user);
    const id = await makeCompleteExport(user.id);
    getMock.mockResolvedValue(null);
    const res = await GET(downloadRequest(id));
    expect(res.status).toBe(410);
    const row = await prisma.exportRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toMatch(/no longer available/i);
  });

  it('happy path: streams the zip with attachment disposition', async () => {
    const user = await makeUser('dl-happy');
    currentUserMock.mockResolvedValue(user);
    const id = await makeCompleteExport(user.id);
    getMock.mockResolvedValue(blobOk(Buffer.from('PK-fake-zip', 'utf8')));

    const res = await GET(downloadRequest(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString('utf8')).toBe('PK-fake-zip');
  });
});
