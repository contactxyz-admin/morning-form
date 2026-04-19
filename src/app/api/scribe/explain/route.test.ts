/**
 * POST /api/scribe/explain — integration tests.
 *
 * These pin the runtime SSE contract end-to-end: auth, validation, the
 * scribe-execute call, and the post-gate fallback semantics. A stubbed
 * `ScribeLLMClient` feeds deterministic turns via `setScribeLLMForTest`.
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
import { addNode } from '@/lib/graph/mutations';
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
  setScribeLLMForTest(null);
});

function scriptedLLM(turns: ScribeLLMTurn[]): ScribeLLMClient {
  const queue = [...turns];
  return {
    async turn() {
      const next = queue.shift();
      if (!next) throw new Error('scriptedLLM: queue exhausted');
      return next;
    },
  };
}

function makeRequest(body: unknown): Request {
  return new Request('https://app.test/api/scribe/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// The route handler types its input as NextRequest; Request is the runtime
// base and works at the call site. The test suite's type mismatch is known
// and tolerated (see src/app/api/share/create/route.test.ts).
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

function endTurn(text: string): ScribeLLMTurn {
  return {
    stopReason: 'end_turn',
    text,
    toolCalls: [],
    modelVersion: 'gpt-4.1-2026-01-01',
  };
}

describe('POST /api/scribe/explain', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    setScribeLLMForTest(scriptedLLM([endTurn('unused')]));
    const res = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'Ferritin 18 ug/L' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (empty selection)', async () => {
    const userId = await makeTestUser(prisma, 'explain-400-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    setScribeLLMForTest(scriptedLLM([endTurn('unused')]));
    const res = await callPost(
      makeRequest({ topicKey: 'iron', selection: '' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown topicKey', async () => {
    const userId = await makeTestUser(prisma, 'explain-400-topic');
    currentUserMock.mockResolvedValue({ id: userId });
    setScribeLLMForTest(scriptedLLM([endTurn('unused')]));
    const res = await callPost(
      makeRequest({ topicKey: 'not-a-real-topic', selection: 'Ferritin 18' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 503 when no scribe LLM client is configured', async () => {
    const userId = await makeTestUser(prisma, 'explain-503');
    currentUserMock.mockResolvedValue({ id: userId });
    // No setScribeLLMForTest() — factory throws.
    const res = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'Ferritin 18 ug/L' }),
    );
    expect(res.status).toBe(503);
  });

  it('happy path — streams an SSE response, passes the safety gate, writes a runtime audit row', async () => {
    const userId = await makeTestUser(prisma, 'explain-happy');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: {
        latestValue: 18,
        referenceRangeLow: 30,
        referenceRangeHigh: 300,
        unit: 'ug/L',
      },
    });

    const safeOutput =
      'Your ferritin reading of 18 ug/L sits below the 30-300 reference range. This is a factual comparison, not a diagnosis.';
    currentUserMock.mockResolvedValue({ id: userId });
    setScribeLLMForTest(scriptedLLM([endTurn(safeOutput)]));

    const res = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'Ferritin 18 ug/L' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const events = await readSseEvents(res);
    const kinds = events.map((e) => e.event);
    expect(kinds[0]).toBe('meta');
    expect(kinds[kinds.length - 1]).toBe('done');
    expect(kinds.filter((k) => k === 'token').length).toBeGreaterThan(0);

    const done = events[events.length - 1].data as {
      classification: string;
      output: string;
      citations: unknown[];
    };
    // The route declares `pattern-vs-own-history` (valid for all three v1
    // policies, no sections gate) so a clean scribe output must classify
    // as clinical-safe. If this ever regresses to `out-of-scope-routed` the
    // runtime surface would unconditionally render the GP-prep fallback.
    expect(done.classification).toBe('clinical-safe');
    expect(done.output).toBe(safeOutput);

    // Token frames carry the same safe output — a regression that streamed
    // the raw output via tokens while defaulting `done.output` to fallback
    // would be caught here.
    const tokenText = events
      .filter((e) => e.event === 'token')
      .map((e) => (e.data as { text: string }).text)
      .join('');
    expect(tokenText).toBe(safeOutput);

    const auditRows = await prisma.scribeAudit.findMany({
      where: { userId, mode: 'runtime' },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].topicKey).toBe('iron');
  });

  it('rejects forbidden-phrase output and degrades to a fixed GP-prep fallback; audit records rejection', async () => {
    const userId = await makeTestUser(prisma, 'explain-reject');
    currentUserMock.mockResolvedValue({ id: userId });

    const drugMention =
      'Take 325 mg of ferrous sulfate daily to raise your ferritin level.';
    setScribeLLMForTest(scriptedLLM([endTurn(drugMention)]));

    const res = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'Ferritin 18 ug/L' }),
    );
    expect(res.status).toBe(200);

    const events = await readSseEvents(res);
    const done = events[events.length - 1].data as {
      classification: string;
      output: string;
    };
    expect(done.classification).toBe('rejected');
    expect(done.output).not.toContain('ferrous sulfate');
    expect(done.output).not.toMatch(/325\s*mg/i);

    // The token stream is the wire the client actually renders — assert that
    // the raw drug mention does not leak there either. Without this, a
    // regression that streamed `result.output` via tokens while defaulting
    // `done.output` to fallback would silently leak to the UI.
    const tokenText = events
      .filter((e) => e.event === 'token')
      .map((e) => (e.data as { text: string }).text)
      .join('');
    expect(tokenText).not.toContain('ferrous sulfate');
    expect(tokenText).not.toMatch(/325\s*mg/i);

    // Audit row still landed (D11).
    const auditRows = await prisma.scribeAudit.findMany({
      where: { userId, mode: 'runtime' },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].safetyClassification).toBe('rejected');
    // The audit captures the ORIGINAL drug mention for the compliance trail,
    // even though the client never saw it.
    expect(auditRows[0].output).toContain('ferrous sulfate');
  });

  it('reuses a client-provided requestId so retries fold into one audit row', async () => {
    const userId = await makeTestUser(prisma, 'explain-idempotent');
    const requestId = '44444444-4444-4444-8444-444444444444';
    currentUserMock.mockResolvedValue({ id: userId });

    // Two distinct LLM outputs — first-write-wins on the audit means we
    // should see the FIRST output persisted, not the second.
    const first = 'First response text.';
    const second = 'Second response text.';

    setScribeLLMForTest(scriptedLLM([endTurn(first)]));
    const res1 = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'same selection', requestId }),
    );
    await readSseEvents(res1);

    setScribeLLMForTest(scriptedLLM([endTurn(second)]));
    const res2 = await callPost(
      makeRequest({ topicKey: 'iron', selection: 'same selection', requestId }),
    );
    await readSseEvents(res2);

    const rows = await prisma.scribeAudit.findMany({
      where: { userId, requestId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].output).toBe(first);
  });
});
