/**
 * GET /api/scribe/audit — integration tests.
 *
 * These exercise the real `listAudits` repo against the test DB. We seed
 * audits by calling `recordAudit` directly rather than round-tripping
 * through the scribe loop — that keeps the test focused on the listing
 * surface (auth, scope, pagination, filtering).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import {
  getOrCreateScribeForTopic,
  recordAudit,
} from '@/lib/scribe/repo';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();

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
    NEXT_PUBLIC_APP_URL: 'https://app.contact.xyz',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
    MOCK_LLM: 'true',
    ANTHROPIC_API_KEY: '',
  },
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
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
});

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

async function callGet(req: Request): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET(req as any);
}

async function seedAudit(
  userId: string,
  topicKey: string,
  requestId: string,
  output: string,
): Promise<string> {
  const scribe = await getOrCreateScribeForTopic(prisma, userId, topicKey, {
    modelVersion: 'test-v1',
  });
  const row = await recordAudit(prisma, userId, scribe.id, {
    requestId,
    topicKey,
    mode: 'runtime',
    prompt: `prompt for ${requestId}`,
    toolCalls: [],
    output,
    citations: [],
    safetyClassification: 'clinical-safe',
    modelVersion: 'test-v1',
  });
  return row.id;
}

describe('GET /api/scribe/audit', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await callGet(makeRequest('https://app.test/api/scribe/audit'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when limit is out of range', async () => {
    const userId = await makeTestUser(prisma, 'audit-400-limit');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callGet(
      makeRequest('https://app.test/api/scribe/audit?limit=0'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown topicKey filter — avoids leaking via 200 with an empty list', async () => {
    const userId = await makeTestUser(prisma, 'audit-404-topic');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callGet(
      makeRequest('https://app.test/api/scribe/audit?topicKey=not-a-real-topic'),
    );
    expect(res.status).toBe(404);
  });

  it('happy path — lists the caller\'s audits, newest first, with parsed JSON fields', async () => {
    const userId = await makeTestUser(prisma, 'audit-happy');
    currentUserMock.mockResolvedValue({ id: userId });
    await seedAudit(userId, 'iron', 'req-1', 'first output');
    // Slight delay so createdAt differs — the order we assert depends on it.
    await new Promise((r) => setTimeout(r, 10));
    await seedAudit(userId, 'iron', 'req-2', 'second output');

    const res = await callGet(makeRequest('https://app.test/api/scribe/audit'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ output: string; toolCalls: unknown; citations: unknown }>;
      nextCursor: string | null;
    };
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].output).toBe('second output');
    expect(body.rows[1].output).toBe('first output');
    // The route parses the DB's JSON-string columns back into arrays so
    // agents don't have to understand the storage encoding.
    expect(body.rows[0].toolCalls).toEqual([]);
    expect(body.rows[0].citations).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('scopes to the caller — user A cannot see user B\'s audits', async () => {
    const userA = await makeTestUser(prisma, 'audit-scope-a');
    const userB = await makeTestUser(prisma, 'audit-scope-b');
    await seedAudit(userA, 'iron', 'req-a-1', 'A-only');
    await seedAudit(userB, 'iron', 'req-b-1', 'B-only');

    currentUserMock.mockResolvedValue({ id: userA });
    const res = await callGet(makeRequest('https://app.test/api/scribe/audit'));
    const body = (await res.json()) as {
      rows: Array<{ output: string }>;
    };
    expect(body.rows.map((r) => r.output)).toEqual(['A-only']);
  });

  it('paginates via cursor — limit + nextCursor walks the full set without duplicates or gaps', async () => {
    const userId = await makeTestUser(prisma, 'audit-paginate');
    currentUserMock.mockResolvedValue({ id: userId });
    // Seed 5 audits with distinct createdAt timestamps (sleep between writes).
    for (let i = 1; i <= 5; i++) {
      await seedAudit(userId, 'iron', `req-${i}`, `output-${i}`);
      await new Promise((r) => setTimeout(r, 5));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const url = cursor
        ? `https://app.test/api/scribe/audit?limit=2&cursor=${cursor}`
        : 'https://app.test/api/scribe/audit?limit=2';
      const res = await callGet(makeRequest(url));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        rows: Array<{ id: string; output: string }>;
        nextCursor: string | null;
      };
      for (const row of body.rows) seen.push(row.output);
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual([
      'output-5',
      'output-4',
      'output-3',
      'output-2',
      'output-1',
    ]);
  });

  it('filters by topicKey when supplied', async () => {
    const userId = await makeTestUser(prisma, 'audit-topic-filter');
    currentUserMock.mockResolvedValue({ id: userId });
    await seedAudit(userId, 'iron', 'req-i1', 'iron-output');
    await new Promise((r) => setTimeout(r, 5));
    await seedAudit(userId, 'sleep-recovery', 'req-s1', 'sleep-output');

    const res = await callGet(
      makeRequest('https://app.test/api/scribe/audit?topicKey=sleep-recovery'),
    );
    const body = (await res.json()) as {
      rows: Array<{ topicKey: string; output: string }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].topicKey).toBe('sleep-recovery');
    expect(body.rows[0].output).toBe('sleep-output');
  });
});
