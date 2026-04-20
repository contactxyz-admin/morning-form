import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import {
  createChatMessage,
  loadRecentMessages,
  parseMessageMetadata,
  updateChatMessageMetadata,
} from './repo';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('createChatMessage', () => {
  it('persists a message with null metadata by default and returns the row', async () => {
    const userId = await makeTestUser(prisma, 'chat-repo-create');
    const msg = await createChatMessage(prisma, userId, 'user', 'hello');
    expect(msg.userId).toBe(userId);
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(msg.metadata).toBeNull();
  });

  it('serialises a provided metadata object to JSON', async () => {
    const userId = await makeTestUser(prisma, 'chat-repo-meta');
    const msg = await createChatMessage(prisma, userId, 'user', 'question', {
      routed: { topicKey: 'iron', confidence: 0.9, reasoning: 'ferritin' },
    });
    expect(msg.metadata).toBe(
      JSON.stringify({
        routed: { topicKey: 'iron', confidence: 0.9, reasoning: 'ferritin' },
      }),
    );
  });
});

describe('updateChatMessageMetadata', () => {
  it('overwrites the metadata JSON on an existing row', async () => {
    const userId = await makeTestUser(prisma, 'chat-repo-update');
    const msg = await createChatMessage(prisma, userId, 'user', 'text');
    await updateChatMessageMetadata(prisma, msg.id, {
      error: 'router failed',
    });
    const reloaded = await prisma.chatMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(JSON.parse(reloaded.metadata!)).toEqual({ error: 'router failed' });
  });
});

describe('loadRecentMessages', () => {
  it('returns messages in chronological order, capped at the limit', async () => {
    const userId = await makeTestUser(prisma, 'chat-repo-load');
    for (let i = 0; i < 5; i++) {
      await createChatMessage(prisma, userId, i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`);
    }
    const rows = await loadRecentMessages(prisma, userId, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((m) => m.content)).toEqual(['msg-2', 'msg-3', 'msg-4']);
  });

  it('scopes strictly to the given userId', async () => {
    const userA = await makeTestUser(prisma, 'chat-repo-userA');
    const userB = await makeTestUser(prisma, 'chat-repo-userB');
    await createChatMessage(prisma, userA, 'user', 'from-A');
    await createChatMessage(prisma, userB, 'user', 'from-B');
    const rowsA = await loadRecentMessages(prisma, userA);
    const rowsB = await loadRecentMessages(prisma, userB);
    expect(rowsA.map((m) => m.content)).toEqual(['from-A']);
    expect(rowsB.map((m) => m.content)).toEqual(['from-B']);
  });

  it('returns an empty array for a user with no history', async () => {
    const userId = await makeTestUser(prisma, 'chat-repo-empty');
    const rows = await loadRecentMessages(prisma, userId);
    expect(rows).toEqual([]);
  });
});

describe('parseMessageMetadata', () => {
  it('returns null for null or empty input', () => {
    expect(parseMessageMetadata(null)).toBeNull();
    expect(parseMessageMetadata('')).toBeNull();
  });

  it('returns the parsed object on valid JSON', () => {
    expect(parseMessageMetadata('{"topicKey":"iron"}')).toEqual({ topicKey: 'iron' });
  });

  it('returns null when the JSON parses to a non-object (array, primitive)', () => {
    expect(parseMessageMetadata('[1,2,3]')).toBeNull();
    expect(parseMessageMetadata('42')).toBeNull();
    expect(parseMessageMetadata('"string"')).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(parseMessageMetadata('{not-json')).toBeNull();
    expect(parseMessageMetadata('undefined')).toBeNull();
  });
});
