/**
 * GET /api/chat/history — integration tests.
 *
 * Covers auth, the chronological slice, user-scoping, and metadata
 * decoding (including the tolerant parse that degrades malformed
 * metadata to null rather than 500-ing).
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
import { createChatMessage } from '@/lib/chat/repo';

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

describe('GET /api/chat/history', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns messages in chronological order with decoded metadata', async () => {
    const userId = await makeTestUser(prisma, 'history-happy');
    currentUserMock.mockResolvedValue({ id: userId });

    await createChatMessage(prisma, userId, 'user', 'first question');
    await createChatMessage(prisma, userId, 'assistant', 'first answer', {
      topicKey: 'iron',
      classification: 'clinical-safe',
      citations: [],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: Array<{
        id: string;
        role: string;
        content: string;
        metadata: unknown;
        createdAt: string;
      }>;
    };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toBe('first question');
    expect(body.messages[0].metadata).toBeNull();
    expect(body.messages[1].role).toBe('assistant');
    expect(body.messages[1].metadata).toMatchObject({
      topicKey: 'iron',
      classification: 'clinical-safe',
    });
  });

  it('scopes strictly to the signed-in user', async () => {
    const userA = await makeTestUser(prisma, 'history-userA');
    const userB = await makeTestUser(prisma, 'history-userB');
    await createChatMessage(prisma, userA, 'user', 'from A');
    await createChatMessage(prisma, userB, 'user', 'from B');

    currentUserMock.mockResolvedValue({ id: userA });
    const res = await GET();
    const body = (await res.json()) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.map((m) => m.content)).toEqual(['from A']);
  });

  it('tolerates malformed metadata by returning null rather than erroring', async () => {
    const userId = await makeTestUser(prisma, 'history-badmeta');
    currentUserMock.mockResolvedValue({ id: userId });
    await prisma.chatMessage.create({
      data: {
        userId,
        role: 'assistant',
        content: 'legacy row',
        metadata: '{not-valid-json',
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: Array<{ content: string; metadata: unknown }>;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].metadata).toBeNull();
  });

  it('caps the response at 50 messages (newest 50 in chronological order)', async () => {
    const userId = await makeTestUser(prisma, 'history-cap');
    currentUserMock.mockResolvedValue({ id: userId });
    for (let i = 0; i < 60; i++) {
      await createChatMessage(prisma, userId, i % 2 === 0 ? 'user' : 'assistant', `m-${i}`);
    }
    const res = await GET();
    const body = (await res.json()) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages).toHaveLength(50);
    // Chronological: last entry is the newest ("m-59").
    expect(body.messages[body.messages.length - 1].content).toBe('m-59');
    expect(body.messages[0].content).toBe('m-10');
  });
});
