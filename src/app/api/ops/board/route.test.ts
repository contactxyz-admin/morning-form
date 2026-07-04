import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  COMPANY_OPS_ENABLED: 'true',
  COMPANY_OPS_ALLOWLIST: 'reuben@contact.xyz,joe@contact.xyz',
  COMPANY_OPS_MEMBERS: '[]',
  COMPANY_OPS_SLACK_WEBHOOK: '',
  COMPANY_OPS_MCP_TOKENS: '[]',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
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

// Static import — vi.mock above is hoisted, so the mock is in effect before
// the route module loads.
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

function req(url = 'http://localhost/api/ops/board'): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/ops/board', () => {
  it('404 when COMPANY_OPS_ENABLED is off', async () => {
    envMock.COMPANY_OPS_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });

    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);

    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('403 when authenticated but not on the staff allowlist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'random@example.com' });

    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('200 lists tasks for the board, ordered by phase then orderIndex', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const board = `board-list-${Date.now()}`;

    await prisma.companyOpsTask.createMany({
      data: [
        { board, title: 'Second in phase 1', phase: '1 · Build', orderIndex: 1, createdBy: 'reuben@contact.xyz' },
        { board, title: 'First in phase 0', phase: '0 · Decide', orderIndex: 0, createdBy: 'reuben@contact.xyz' },
        { board, title: 'First in phase 1', phase: '1 · Build', orderIndex: 0, createdBy: 'reuben@contact.xyz' },
      ],
    });

    const res = await GET(req(`http://localhost/api/ops/board?board=${board}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ title: string }> };
    expect(body.tasks.map((t) => t.title)).toEqual([
      'First in phase 0',
      'First in phase 1',
      'Second in phase 1',
    ]);
  });

  it('defaults to the "pilot" board when no query param is given', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    await prisma.companyOpsTask.create({
      data: { board: 'pilot', title: 'Default board task', createdBy: 'reuben@contact.xyz' },
    });

    const res = await GET(req());
    const body = (await res.json()) as { tasks: Array<{ title: string; board: string }> };
    expect(body.tasks.some((t) => t.title === 'Default board task' && t.board === 'pilot')).toBe(true);
  });
});
