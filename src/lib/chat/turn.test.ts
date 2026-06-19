/**
 * runChatTurn integration tests — exercise the full pipeline against a
 * real Postgres test DB, a mocked router LLM, and a scripted scribe LLM.
 *
 * The invariants under test:
 *   - User message is persisted before any fallible work.
 *   - Router decision is stored in the user message metadata.
 *   - Event ordering is `routed → token* → done` on success.
 *   - Out-of-scope turns never call execute() and never write a
 *     ScribeAudit row (no scribe was invoked).
 *   - Scribe-path turns always produce a ScribeAudit row via execute()'s
 *     D11 guarantee, even on mid-stream failure.
 *   - On any error, the assistant message is NOT persisted.
 *   - History from turn N+1 includes messages from turn N.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import {
  addEdge,
  addNode,
  addSourceChunks,
  addSourceDocument,
} from '@/lib/graph/mutations';
import { clearMockHandlers, LLMClient, setMockHandlers } from '@/lib/llm/client';
import {
  getOrCreateScribeForTopic,
  ScribeAuditWriteError,
} from '@/lib/scribe/repo';
import type {
  ScribeLLMClient,
  ScribeLLMTurnRequest,
  ScribeLLMTurn,
} from '@/lib/scribe/execute';
import { __setReferralScribeLLMForTest } from '@/lib/scribe/tools/refer-to-specialist';
import { OUT_OF_SCOPE_FALLBACK, runChatTurn } from './turn';
import type { TurnEvent } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  clearMockHandlers();
  __setReferralScribeLLMForTest(null);
});

function scriptedScribe(
  turns: ScribeLLMTurn[],
  calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [],
): ScribeLLMClient {
  const queue = [...turns];
  return {
    async turn(req) {
      calls.push({ system: req.system });
      const next = queue.shift();
      if (!next) throw new Error('scriptedScribe: queue exhausted');
      return next;
    },
  };
}

function throwingScribe(err: Error): ScribeLLMClient {
  return {
    async turn() {
      throw err;
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

function mockRouterWithShape(
  topicKey: string | null,
  confidence: number,
  answerShape: 'standard' | 'investigations',
) {
  setMockHandlers([
    {
      key: '<current_utterance>',
      handler: () => ({ topicKey, confidence, reasoning: 'test', answerShape }),
    },
  ]);
}

/** Scribe that captures the full system prompt + tool list per turn. */
function capturingScribe(
  turns: ScribeLLMTurn[],
  calls: Array<{ system: string; toolNames: string[]; firstMessage: string }>,
): ScribeLLMClient {
  const queue = [...turns];
  return {
    async turn(req) {
      calls.push({
        system: req.system,
        toolNames: req.tools.map((t) => t.name),
        firstMessage: req.messages[0]?.content ?? '',
      });
      const next = queue.shift();
      if (!next) throw new Error('capturingScribe: queue exhausted');
      return next;
    },
  };
}

function routerClient(): LLMClient {
  return new LLMClient({ mock: true });
}

async function collect(gen: AsyncGenerator<TurnEvent, void, void>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('runChatTurn — remedial retry on forbidden-phrase rejection', () => {
  it('retries once and recovers a clinical-safe answer instead of dead-ending', async () => {
    const userId = await makeTestUser(prisma, 'turn-remedial-recover');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'v1',
    });
    mockRouter('iron', 0.9, 'sleep supplements');

    // First answer names a supplement + dose → enforce rejects. The remedial
    // retry returns a clean answer → clinical-safe (no dead-end).
    const calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [];
    const scribeLlm = scriptedScribe(
      [
        {
          stopReason: 'end_turn',
          text: 'Try melatonin 3mg before bed.',
          modelVersion: 'v1',
          toolCalls: [],
        },
        {
          stopReason: 'end_turn',
          text: 'A consistent wind-down and a cool, dark room help most people; supplements are best discussed with a clinician.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ],
      calls,
    );

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what can I take to improve my sleep',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).toBe('clinical-safe');
    expect(done.output).toMatch(/wind-down|clinician/i);
    expect(done.output).not.toMatch(/melatonin/i);

    // The retry ran (two scribe calls); the second carried the remedial addendum.
    expect(calls).toHaveLength(2);
    expect(calls[1].system).toMatch(/previous reply was discarded/i);

    // Two honest audit rows: the rejected attempt + the clinical-safe retry.
    // The surfaced answer maps to the retry's (clinical-safe) row.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(2);
    expect(audits.some((a) => a.safetyClassification === 'rejected')).toBe(true);
    const surfaced = audits.find((a) => a.requestId === done.requestId);
    expect(surfaced?.safetyClassification).toBe('clinical-safe');
  });

  it('leaves the rejected verdict untouched when the retry cannot recover', async () => {
    const userId = await makeTestUser(prisma, 'turn-remedial-fail');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'v1',
    });
    mockRouter('iron', 0.9, 'sleep supplements');

    // Only one scripted turn (rejected); the retry exhausts the queue and
    // throws → caught → original rejected verdict preserved, one audit row.
    const scribeLlm = scriptedScribe([
      {
        stopReason: 'end_turn',
        text: 'Try melatonin 3mg before bed.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what can I take to improve my sleep',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).toBe('rejected');
    expect(done.output).toBe(OUT_OF_SCOPE_FALLBACK);

    // The surfaced answer maps to the original rejected audit row.
    expect(done.requestId).toBeTruthy();
    const surfaced = await prisma.scribeAudit.findFirst({
      where: { userId, scribeId: scribe.id, requestId: done.requestId ?? undefined },
    });
    expect(surfaced?.safetyClassification).toBe('rejected');
  });
});

describe('runChatTurn — happy path (routed → scribe)', () => {
  it('routes to iron, streams tokens, persists both messages, and writes a ScribeAudit row', async () => {
    const userId = await makeTestUser(prisma, 'turn-happy');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'v1',
    });
    mockRouter('iron', 0.95, 'mentions ferritin');

    const scribeLlm = scriptedScribe([
      {
        stopReason: 'end_turn',
        text: 'Your ferritin is below the typical reference range for adults.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'Why is my ferritin low?',
        routerLlm: routerClient(),
        scribeLlm,
        requestId: '66666666-6666-4666-8666-666666666666',
      }),
    );

    // Event-order invariant: routed → token+ → done.
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('routed');
    expect(types.at(-1)).toBe('done');
    expect(types.slice(1, -1).every((t) => t === 'token')).toBe(true);

    const routed = events[0] as Extract<TurnEvent, { type: 'routed' }>;
    expect(routed.topicKey).toBe('iron');
    expect(routed.confidence).toBe(0.95);

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).toBe('clinical-safe');
    expect(done.topicKey).toBe('iron');
    expect(done.output).toMatch(/below the typical reference range/);

    // Persisted history matches what we yielded.
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Why is my ferritin low?');
    const userMeta = JSON.parse(messages[0].metadata!);
    expect(userMeta.routed).toEqual({
      topicKey: 'iron',
      confidence: 0.95,
      reasoning: 'mentions ferritin',
    });
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe(done.output);
    const asstMeta = JSON.parse(messages[1].metadata!);
    expect(asstMeta.topicKey).toBe('iron');
    expect(asstMeta.classification).toBe('clinical-safe');
    expect(asstMeta.requestId).toBe('66666666-6666-4666-8666-666666666666');

    // Exactly one audit row for this turn.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].topicKey).toBe('iron');
    expect(audits[0].safetyClassification).toBe('clinical-safe');
  });

  it('appends the Ask answer style contract to legacy topic default prompts', async () => {
    const userId = await makeTestUser(prisma, 'turn-style-default');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.95, 'mentions ferritin');

    const calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [];
    const scribeLlm = scriptedScribe(
      [
        {
          stopReason: 'end_turn',
          text: 'I do not have iron results in your record yet.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ],
      calls,
    );

    await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what do you know about my iron?',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    expect(calls[0].system).toContain('You are the specialist scribe for topic "iron".');
    expect(calls[0].system).toContain('Ask answer style contract:');
    expect(calls[0].system).toContain('Do not use Markdown tables');
    expect(calls[0].system).toContain('no diagnosis');
  });

  it('appends the Ask answer style contract to core specialty prompts', async () => {
    const userId = await makeTestUser(prisma, 'turn-style-core');
    await getOrCreateScribeForTopic(prisma, userId, 'cardiometabolic', {
      modelVersion: 'v1',
    });
    mockRouter('cardiometabolic', 0.95, 'mentions HbA1c');

    const calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [];
    const scribeLlm = scriptedScribe(
      [
        {
          stopReason: 'end_turn',
          text: 'HbA1c is present in your record.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ],
      calls,
    );

    await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'has my HbA1c changed?',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    expect(calls[0].system).toContain('cardiometabolic specialist');
    expect(calls[0].system).toContain('Ask answer style contract:');
    expect(calls[0].system).toContain('Do not use Markdown tables');
  });

  it('surfaces citations from provenance tool calls when output has no annotation block', async () => {
    const userId = await makeTestUser(prisma, 'turn-provenance-citations');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    const doc = await addSourceDocument(prisma, userId, {
      kind: 'lab_pdf',
      capturedAt: new Date('2026-05-01T00:00:00Z'),
    });
    const [chunkId] = await addSourceChunks(prisma, doc.id, [
      {
        index: 0,
        text: 'Ferritin 18 ug/L from May lab report.',
        offsetStart: 0,
        offsetEnd: 38,
      },
    ]);
    const ferritin = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 18, unit: 'ug/L' },
    });
    await addEdge(prisma, userId, {
      type: 'SUPPORTS',
      fromNodeId: ferritin.id,
      toNodeId: ferritin.id,
      fromChunkId: chunkId,
      fromDocumentId: doc.id,
    });
    mockRouter('iron', 0.95, 'mentions ferritin');

    const scribeLlm = scriptedScribe([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          {
            id: 'provenance-1',
            name: 'get_node_provenance',
            input: { nodeId: ferritin.id },
          },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'Ferritin is present in your record.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what iron results are in my record?',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.citations).toEqual([
      {
        nodeId: ferritin.id,
        chunkId,
        excerpt: 'Ferritin 18 ug/L from May lab report.',
      },
    ]);
  });

  it('works for the very first turn (no prior history)', async () => {
    const userId = await makeTestUser(prisma, 'turn-first');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.9);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'iron question',
        routerLlm: routerClient(),
        scribeLlm: scriptedScribe([
          {
            stopReason: 'end_turn',
            text: 'Your stored ferritin reading is within range.',
            modelVersion: 'v1',
            toolCalls: [],
          },
        ]),
      }),
    );

    expect(events.at(-1)?.type).toBe('done');
    const messages = await prisma.chatMessage.findMany({ where: { userId } });
    expect(messages).toHaveLength(2);
  });
});

describe('runChatTurn — router-null fallback (general scribe owns it)', () => {
  it('routes a null router decision through the general scribe and writes a ScribeAudit row', async () => {
    const userId = await makeTestUser(prisma, 'turn-fallback');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'general', {
      modelVersion: 'v1',
    });
    mockRouter(null, 0.8, 'no registered specialist — general scribe takes it');

    const scribeLlm = scriptedScribe([
      {
        stopReason: 'end_turn',
        text: 'I can see this is outside my specialists\' specific remits, but here is what your record shows.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'my period pains are worsening',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );

    // The router returns null but the scribe path still runs.
    const routed = events[0] as Extract<TurnEvent, { type: 'routed' }>;
    expect(routed.topicKey).toBeNull();

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    // The general scribe's output is what reaches the user — no static fallback.
    expect(done.topicKey).toBe('general');
    expect(done.output).toMatch(/here is what your record shows/);

    // User message carries the original router decision (null) for the audit.
    const userMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { userId, role: 'user' },
    });
    const meta = JSON.parse(userMsg.metadata!);
    expect(meta.routed.topicKey).toBeNull();

    // Assistant message persisted under the resolved topic.
    const asstMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { userId, role: 'assistant' },
    });
    const asstMeta = JSON.parse(asstMsg.metadata!);
    expect(asstMeta.topicKey).toBe('general');

    // Exactly one ScribeAudit row — the general scribe ran.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].topicKey).toBe('general');
  });
});

describe('runChatTurn — error paths', () => {
  it('router throws → user message persisted with error metadata, no assistant message', async () => {
    const userId = await makeTestUser(prisma, 'turn-router-err');
    // No mock handler registered → LLMClient throws `no mock handler matched`.
    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'something',
        routerLlm: routerClient(),
        scribeLlm: throwingScribe(new Error('should not reach scribe')),
      }),
    );

    const error = events.at(-1) as Extract<TurnEvent, { type: 'error' }>;
    expect(error.type).toBe('error');
    expect(error.message).toMatch(/mock handler/i);

    const messages = await prisma.chatMessage.findMany({ where: { userId } });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const meta = JSON.parse(messages[0].metadata!);
    expect(meta.error).toMatch(/mock handler/i);

    // No scribe was ever invoked → no audit.
    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
  });

  it('scribe execute throws mid-stream → user message persisted, no assistant message, audit row exists via D11', async () => {
    const userId = await makeTestUser(prisma, 'turn-exec-err');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'v1',
    });
    mockRouter('iron', 0.9);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'tell me about ferritin',
        routerLlm: routerClient(),
        scribeLlm: throwingScribe(new Error('upstream timeout')),
      }),
    );

    // Order: routed → error (no tokens emitted since execute() threw).
    expect(events.map((e) => e.type)).toEqual(['routed', 'error']);

    // User message persisted with routing + error note. Assistant NOT persisted.
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const meta = JSON.parse(messages[0].metadata!);
    expect(meta.routed.topicKey).toBe('iron');
    expect(meta.error).toMatch(/upstream timeout/);

    // D11: execute() still wrote an audit row despite the thrown LLM call.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: scribe.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].safetyClassification).toBe('rejected');
  });

  it('surfaces ScribeAuditWriteError with an identifying message prefix', async () => {
    // We can't easily force a real audit-write failure from an integration
    // test — but we CAN verify the wrapper surfaces the distinct error
    // class when the scribe layer throws one. Use a scribe LLM that
    // short-circuits to throw the sentinel error directly.
    const userId = await makeTestUser(prisma, 'turn-audit-err');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.9);

    const scribeLlm: ScribeLLMClient = {
      async turn() {
        throw new ScribeAuditWriteError('simulated audit write failure', new Error('db down'));
      },
    };

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'q',
        routerLlm: routerClient(),
        scribeLlm,
      }),
    );
    const err = events.at(-1) as Extract<TurnEvent, { type: 'error' }>;
    expect(err.type).toBe('error');
    // The wrapper may or may not prefix with "audit write failed" depending
    // on whether the ScribeAuditWriteError reaches runChatTurn directly vs.
    // being wrapped inside execute(); either way the message must mention
    // the audit concern so callers can differentiate.
    expect(err.message).toMatch(/audit|simulated audit write failure/i);
  });
});

describe('runChatTurn — multi-turn integration', () => {
  it('the second turn sees the first turn in its routing context', async () => {
    const userId = await makeTestUser(prisma, 'turn-multi');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    // Turn 1 — no history yet.
    mockRouter('iron', 0.9);
    await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'ferritin?',
        routerLlm: routerClient(),
        scribeLlm: scriptedScribe([
          {
            stopReason: 'end_turn',
            text: 'Iron response A.',
            modelVersion: 'v1',
            toolCalls: [],
          },
        ]),
      }),
    );

    // Turn 2 — a router that inspects the prompt to prove history was threaded.
    let observedPrompt = '';
    setMockHandlers([
      {
        key: '<current_utterance>',
        handler: (prompt: string) => {
          observedPrompt = prompt;
          return { topicKey: 'iron', confidence: 0.9, reasoning: 'follow-up' };
        },
      },
    ]);

    await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'anything I should watch for?',
        routerLlm: routerClient(),
        scribeLlm: scriptedScribe([
          {
            stopReason: 'end_turn',
            text: 'Iron response B.',
            modelVersion: 'v1',
            toolCalls: [],
          },
        ]),
      }),
    );

    // The second turn's router prompt must include the prior exchange,
    // but must NOT include the current utterance as a prior_message.
    expect(observedPrompt).toContain('<prior_message role="user">ferritin?</prior_message>');
    expect(observedPrompt).toContain('<prior_message role="assistant">Iron response A.</prior_message>');
    expect(observedPrompt).toContain(
      '<current_utterance>anything I should watch for?</current_utterance>',
    );

    // Final history shape: 4 messages in chronological order.
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages.map((m) => m.content)).toEqual([
      'ferritin?',
      'Iron response A.',
      'anything I should watch for?',
      'Iron response B.',
    ]);
  });
});

describe('runChatTurn — referral surfacing (Unit 6)', () => {
  it('attaches a populated referrals[] to the done event when the general scribe consults a core specialist', async () => {
    const userId = await makeTestUser(prisma, 'turn-referral-core');
    // Both scribes need pre-seeded rows for the recursive execute() to land.
    await getOrCreateScribeForTopic(prisma, userId, 'general', { modelVersion: 'v1' });
    await getOrCreateScribeForTopic(prisma, userId, 'cardiometabolic', {
      modelVersion: 'v1',
    });
    mockRouter('general', 0.7, 'general triage');

    // Specialist scripted to give one end_turn answer.
    __setReferralScribeLLMForTest(
      scriptedScribe([
        {
          stopReason: 'end_turn',
          text: 'Cardiometabolic view: ferritin trending down — iron-deficiency pattern.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ]),
    );

    // Parent scribe: first turn → call refer_to_specialist; second turn → end_turn.
    const parentScribe = scriptedScribe([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          {
            id: 'tu-1',
            name: 'refer_to_specialist',
            input: {
              specialtyKey: 'cardiometabolic',
              question: 'What does the ferritin trend tell us?',
            },
          },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'Looking at the bigger picture, your cardiometabolic specialist confirms the iron pattern.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'how is my ferritin pattern?',
        routerLlm: routerClient(),
        scribeLlm: parentScribe,
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.referrals).toHaveLength(1);
    const r = done.referrals[0];
    expect(r.status).toBe('core');
    expect(r.specialtyKey).toBe('cardiometabolic');
    // Display name comes from the registry, not the raw key.
    expect(r.displayName).toBe('Cardiometabolic medicine');
    expect(r.response).toMatch(/Cardiometabolic view/);

    // Persisted assistant metadata also carries the referral.
    const asstMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { userId, role: 'assistant' },
    });
    const meta = JSON.parse(asstMsg.metadata!);
    expect(meta.referrals).toHaveLength(1);
    expect(meta.referrals[0].displayName).toBe('Cardiometabolic medicine');
  });

  it('emits an empty referrals[] when no refer_to_specialist tool call ran', async () => {
    const userId = await makeTestUser(prisma, 'turn-referral-none');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.95);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'iron question',
        routerLlm: routerClient(),
        scribeLlm: scriptedScribe([
          {
            stopReason: 'end_turn',
            text: 'Your stored ferritin reading is within range.',
            modelVersion: 'v1',
            toolCalls: [],
          },
        ]),
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.referrals).toEqual([]);
  });

  it('surfaces a stub-status referral with its registry fallback message and no requestId', async () => {
    const userId = await makeTestUser(prisma, 'turn-referral-stub');
    await getOrCreateScribeForTopic(prisma, userId, 'general', { modelVersion: 'v1' });
    mockRouter('general', 0.7);

    const parentScribe = scriptedScribe([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          {
            id: 'tu-stub',
            name: 'refer_to_specialist',
            input: {
              specialtyKey: 'mental-health',
              question: 'mood pattern question',
            },
          },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'Answering with general-scribe knowledge since the mental-health specialist is not yet available.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'why am I anxious lately?',
        routerLlm: routerClient(),
        scribeLlm: parentScribe,
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.referrals).toHaveLength(1);
    expect(done.referrals[0].status).toBe('stub');
    expect(done.referrals[0].specialtyKey).toBe('mental-health');
    expect(done.referrals[0].displayName).toBe('Mental health');
    expect(done.referrals[0].response).toMatch(/not yet built/i);
    expect(done.referrals[0].requestId).toBeUndefined();
  });
});

describe('runChatTurn — ASK_DEEP_ENABLED flag gating (Phase A)', () => {
  const ORIGINAL_FLAG = process.env.ASK_DEEP_ENABLED;

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.ASK_DEEP_ENABLED;
    else process.env.ASK_DEEP_ENABLED = ORIGINAL_FLAG;
  });

  /** Seed a user whose profile WOULD produce a digest if the flag were on. */
  async function seedRichUser(label: string): Promise<string> {
    const userId = await makeTestUser(prisma, label);
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    await prisma.stateProfile.create({
      data: {
        userId,
        archetype: 'Endurance athlete',
        primaryPattern: 'Iron dysregulation',
        patternDescription: 'Recurring low ferritin',
        observations: 'Responds to monitoring',
        constraints: '',
        sensitivities: '',
      },
    });
    return userId;
  }

  // flag unset, 'false', '0' must ALL leave the feature off.
  for (const flagValue of [undefined, 'false', '0'] as const) {
    it(`flag=${flagValue ?? 'unset'} → no preamble, no propose_next_steps tool, standard shape`, async () => {
      if (flagValue === undefined) delete process.env.ASK_DEEP_ENABLED;
      else process.env.ASK_DEEP_ENABLED = flagValue;

      const userId = await seedRichUser(`turn-flag-${flagValue ?? 'unset'}`);
      // Router asks for the investigations shape — the flag-off path must
      // override it to standard regardless.
      mockRouterWithShape('iron', 0.95, 'investigations');

      const calls: Array<{ system: string; toolNames: string[]; firstMessage: string }> = [];
      const events = await collect(
        runChatTurn({
          db: prisma,
          userId,
          text: 'why is my ferritin low?',
          routerLlm: routerClient(),
          scribeLlm: capturingScribe(
            [{ stopReason: 'end_turn', text: 'Your ferritin reading is on file.', modelVersion: 'v1', toolCalls: [] }],
            calls,
          ),
        }),
      );

      expect(events.at(-1)?.type).toBe('done');
      // No context preamble injected — first message is the bare user message.
      expect(calls[0].firstMessage).toBe('why is my ferritin low?');
      expect(calls[0].firstMessage).not.toContain('Background context');
      expect(calls[0].firstMessage).not.toContain('Endurance athlete');
      // propose_next_steps not offered to the LLM.
      expect(calls[0].toolNames).not.toContain('propose_next_steps');
      // Standard shape — no investigations prompt suffix.
      expect(calls[0].system ?? '').not.toContain('INVESTIGATIONS MODE');
    });
  }

  it("flag='true' → preamble injected and propose_next_steps offered", async () => {
    process.env.ASK_DEEP_ENABLED = 'true';

    const userId = await seedRichUser('turn-flag-true');
    mockRouter('iron', 0.95);

    const calls: Array<{ system: string; toolNames: string[]; firstMessage: string }> = [];
    await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'why is my ferritin low?',
        routerLlm: routerClient(),
        scribeLlm: capturingScribe(
          [{ stopReason: 'end_turn', text: 'Your ferritin reading is on file.', modelVersion: 'v1', toolCalls: [] }],
          calls,
        ),
      }),
    );

    // Preamble present, gated tool offered.
    expect(calls[0].firstMessage).toContain('Background context');
    expect(calls[0].firstMessage).toContain('Endurance athlete');
    expect(calls[0].toolNames).toContain('propose_next_steps');
  });
});

describe('runChatTurn — propose_next_steps persistence safety invariant (Phase A)', () => {
  const ORIGINAL_FLAG = process.env.ASK_DEEP_ENABLED;

  beforeAll(() => {
    process.env.ASK_DEEP_ENABLED = 'true';
  });

  afterAll(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.ASK_DEEP_ENABLED;
    else process.env.ASK_DEEP_ENABLED = ORIGINAL_FLAG;
  });

  /** Two-turn scribe: call propose_next_steps, then end_turn with `finalText`. */
  function proposeThenAnswer(finalText: string): ScribeLLMClient {
    return scriptedScribe([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          {
            id: 'tu-actions',
            name: 'propose_next_steps',
            input: {
              actions: [
                { verb: 'measure', label: 'Re-check ferritin in 3 months', markerName: 'Ferritin' },
                { verb: 'discuss', label: 'Review iron results with your GP' },
              ],
            },
          },
        ],
      },
      {
        stopReason: 'end_turn',
        text: finalText,
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);
  }

  it('happy path → done carries persisted actions and DB has matching Action rows', async () => {
    const userId = await makeTestUser(prisma, 'turn-actions-happy');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.95);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what should I do about my iron?',
        routerLlm: routerClient(),
        scribeLlm: proposeThenAnswer(
          'Your ferritin is on file and within the lower part of the typical range.',
        ),
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).toBe('clinical-safe');
    expect(done.actions).toHaveLength(2);
    expect(done.actions.map((a) => a.verb)).toEqual(['measure', 'discuss']);

    const rows = await prisma.action.findMany({ where: { userId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.state === 'suggested')).toBe(true);
    // chatMessageId provenance points at the persisted assistant message.
    expect(rows.every((r) => r.chatMessageId === done.assistantMessageId)).toBe(true);
  });

  it('forbidden-phrase final output → rejected, ZERO Action rows, empty done.actions', async () => {
    const userId = await makeTestUser(prisma, 'turn-actions-rejected');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.95);

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what should I do about my iron?',
        routerLlm: routerClient(),
        // Final answer contains a forbidden dose string → enforce rejects.
        scribeLlm: proposeThenAnswer('You should take 65mg of ferrous sulfate daily.'),
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).toBe('rejected');
    expect(done.actions).toEqual([]);

    const rows = await prisma.action.findMany({ where: { userId } });
    expect(rows).toHaveLength(0);
  });

  it('out-of-scope-routed answer → ZERO Action rows, empty done.actions', async () => {
    const userId = await makeTestUser(prisma, 'turn-actions-oos');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });
    mockRouter('iron', 0.95);

    // A definition-lookup judgment is out-of-scope on the iron policy. We can't
    // set declaredJudgmentKind from here, but a non-clinical-safe classification
    // is what matters: drive it via a forbidden phrase is already covered, so
    // here we assert the broader contract — any non-safe classification yields
    // no actions. Use an output that trips the imperative-verb forbidden phrase.
    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'what should I do about my iron?',
        routerLlm: routerClient(),
        scribeLlm: proposeThenAnswer('You should stop taking your current supplement.'),
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.classification).not.toBe('clinical-safe');
    expect(done.actions).toEqual([]);

    const rows = await prisma.action.findMany({ where: { userId } });
    expect(rows).toHaveLength(0);
  });
});
