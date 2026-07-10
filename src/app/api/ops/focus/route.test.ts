import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { currentWeekStartUtc } from '@/app/ops/intelligence';

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

import { PUT } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
});

function putReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ops/focus', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/ops/focus', () => {
  it('creates the current-week row keyed to Monday 00:00 UTC, then upserts in place', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    const res = await PUT(putReq({ items: ['Ship the deck', 'Sign the partner'] }));
    expect(res.status).toBe(200);
    const { focus } = (await res.json()) as { focus: { weekStart: string; items: string } };
    expect(new Date(focus.weekStart).getTime()).toBe(currentWeekStartUtc(new Date()));
    expect(JSON.parse(focus.items)).toEqual(['Ship the deck', 'Sign the partner']);

    currentUserMock.mockResolvedValue({ id: 'u2', email: 'joe@contact.xyz' });
    const res2 = await PUT(putReq({ items: ['Only one thing'] }));
    expect(res2.status).toBe(200);
    const rows = await prisma.companyOpsFocus.findMany({ where: { board: 'pilot' } });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].items)).toEqual(['Only one thing']);
    expect(rows[0].updatedBy).toBe('joe@contact.xyz');
  });

  it('rejects empty or oversized item lists', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await PUT(putReq({ items: [] }))).status).toBe(400);
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await PUT(putReq({ items: ['a', 'b', 'c', 'd'] }))).status).toBe(400);
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'reuben@contact.xyz' });
    expect((await PUT(putReq({ items: ['   '] }))).status).toBe(400);
  });
});
