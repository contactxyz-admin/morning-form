/**
 * POST /api/chat/send — integration tests.
 *
 * Pin the SSE wire contract end-to-end: auth, validation, the routed →
 * token+ → done flow, and the out-of-scope fallback. The scribe LLM is
 * scripted via `setScribeLLMForTest`; the router LLM runs in mock mode
 * with `setMockHandlers` registered per test.
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
  clearMockHandlers,
  setMockHandlers,
} from '@/lib/llm/client';
import { getOrCreateScribeForTopic } from '@/lib/scribe/repo';
import type {
  ScribeLLMClient,
  ScribeLLMTurn,
} from '@/lib/scribe/execute';
import { setScribeLLMForTest } from '@/lib/scribe/llm';

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
  clearMockHandlers();
  setScribeLLMForTest(null);
});

function scriptedScribe(turns: ScribeLLMTurn[]): ScribeLLMClient {
  const queue = [...turns];
  return {
    async turn() {
      const next = queue.shift();
      if (!next) throw new Error('scriptedScribe: queue exhausted');
      return next;
    },
  };
}

function mockRouter(topicKey: string | null, confidence: number, reasoning = 'test') {
  setMockHandlers([
    {
      key: '<current_utterance>',
      handler: () => ({ topicKey, confidence, reasoning }),
    },
  ]);
}

function endTurn(text: string): ScribeLLMTurn {
  return {
    stopReason: 'end_turn',
    text,
    toolCalls: [],
    modelVersion: 'v1',
  };
}

function makeRequest(body: unknown): Request {
  return new Request('https://app.test/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPost(req: Request): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

async function readSseEvents(
  res: Response,
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: Array<{ event: string; data: unknown }> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const eventMatch = frame.match(/^event:\s*(.+)$/m);
      const dataMatch = frame.match(/^data:\s*(.+)$/m);
      if (eventMatch && dataMatch) {
        events.push({
          event: eventMatch[1].trim(),
          data: JSON.parse(dataMatch[1]),
        });
      }
      idx = buffer.indexOf('\n\n');
    }
  }
  return events;
}

describe('POST /api/chat/send', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    setScribeLLMForTest(scriptedScribe([endTurn('unused')]));
    const res = await callPost(makeRequest({ text: 'hi' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty body text', async () => {
    const userId = await makeTestUser(prisma, 'send-400-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    setScribeLLMForTest(scriptedScribe([endTurn('unused')]));
    const res = await callPost(makeRequest({ text: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when text exceeds 2000 chars', async () => {
    const userId = await makeTestUser(prisma, 'send-400-long');
    currentUserMock.mockResolvedValue({ id: userId });
    setScribeLLMForTest(scriptedScribe([endTurn('unused')]));
    const res = await callPost(makeRequest({ text: 'x'.repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when no scribe LLM client is configured', async () => {
    const userId = await makeTestUser(prisma, 'send-503');
    currentUserMock.mockResolvedValue({ id: userId });
    // No setScribeLLMForTest() — factory throws.
    const res = await callPost(makeRequest({ text: 'hi' }));
    expect(res.status).toBe(503);
  });

  it('happy path — streams routed → token+ → done, persists both messages, writes audit', async () => {
    const userId = await makeTestUser(prisma, 'send-happy');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'v1',
    });
    currentUserMock.mockResolvedValue({ id: userId });
    mockRouter('iron', 0.95, 'ferritin mention');

    const safe = 'Your ferritin is below the typical reference range for adults.';
    setScribeLLMForTest(scriptedScribe([endTurn(safe)]));

    const res = await callPost(makeRequest({ text: 'Why is my ferritin low?' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const events = await readSseEvents(res);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('routed');
    expect(kinds[kinds.length - 1]).toBe('done');
    expect(kinds.filter((k) => k === 'token').length).toBeGreaterThan(0);

    const routed = events[0].data as {
      topicKey: string;
      confidence: number;
    };
    expect(routed.topicKey).toBe('iron');
    expect(routed.confidence).toBe(0.95);

    const done = events[events.length - 1].data as {
      classification: string;
      output: string;
      topicKey: string;
      assistantMessageId: string;
    };
    expect(done.classification).toBe('clinical-safe');
    expect(done.output).toBe(safe);
    expect(done.topicKey).toBe('iron');
    expect(done.assistantMessageId).toBeTruthy();

    // Both messages landed.
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');

    // Audit row via D11.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('router-null path — falls through to the general scribe and writes an audit row', async () => {
    // Unit 2: router `null` no longer short-circuits to a static fallback; it
    // routes to the general scribe so every conversation produces a real,
    // audited turn. The OOS-routed surface is now driven by the scribe (and
    // its policy engine), not by router nulls.
    const userId = await makeTestUser(prisma, 'send-router-null');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'general', {
      modelVersion: 'v1',
    });
    currentUserMock.mockResolvedValue({ id: userId });
    mockRouter(null, 0.8, 'no specialist topic fits');

    const safe = "I can talk through that — here's what I'd think about first.";
    setScribeLLMForTest(scriptedScribe([endTurn(safe)]));

    const res = await callPost(makeRequest({ text: 'general life advice please' }));
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);

    const routed = events[0].data as { topicKey: string | null };
    expect(routed.topicKey).toBeNull();

    const done = events[events.length - 1].data as {
      classification: string;
      output: string;
      topicKey: string | null;
      assistantMessageId: string;
    };
    expect(done.classification).toBe('clinical-safe');
    expect(done.output).toBe(safe);
    // The done event surfaces the resolved scribe topic, so the user-facing
    // attribution is `general` rather than the router's null.
    expect(done.topicKey).toBe('general');
    expect(done.assistantMessageId).toBeTruthy();

    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('rejected output — token stream carries the fallback, not the raw drug mention', async () => {
    const userId = await makeTestUser(prisma, 'send-reject');
    currentUserMock.mockResolvedValue({ id: userId });
    mockRouter('iron', 0.9, 'iron question');

    const drugMention = 'Take 325 mg of ferrous sulfate daily to raise ferritin.';
    setScribeLLMForTest(scriptedScribe([endTurn(drugMention)]));

    const res = await callPost(makeRequest({ text: 'what should I take?' }));
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);

    const tokenText = events
      .filter((e) => e.event === 'token')
      .map((e) => (e.data as { text: string }).text)
      .join('');
    expect(tokenText).not.toContain('ferrous sulfate');
    expect(tokenText).not.toMatch(/325\s*mg/i);

    const done = events[events.length - 1].data as {
      classification: string;
      output: string;
    };
    expect(done.classification).toBe('rejected');
    expect(done.output).not.toContain('ferrous sulfate');
  });

  it('router error — emits an error event, no assistant message persisted', async () => {
    const userId = await makeTestUser(prisma, 'send-router-err');
    currentUserMock.mockResolvedValue({ id: userId });
    // No mock handler registered → router LLM throws.
    setScribeLLMForTest({
      async turn() {
        throw new Error('scribe unreached');
      },
    });

    const res = await callPost(makeRequest({ text: 'something' }));
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);
    const last = events[events.length - 1];
    expect(last.event).toBe('error');

    const messages = await prisma.chatMessage.findMany({ where: { userId } });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });
});
