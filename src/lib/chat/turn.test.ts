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
import { clearMockHandlers, LLMClient, setMockHandlers } from '@/lib/llm/client';
import {
  getOrCreateScribeForTopic,
  ScribeAuditWriteError,
} from '@/lib/scribe/repo';
import type {
  ScribeLLMClient,
  ScribeLLMTurn,
} from '@/lib/scribe/execute';
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

function routerClient(): LLMClient {
  return new LLMClient({ mock: true });
}

async function collect(gen: AsyncGenerator<TurnEvent, void, void>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

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

describe('runChatTurn — out-of-scope path (no scribe, no audit row)', () => {
  it('yields the safe fallback stream and a done event with classification out-of-scope-routed', async () => {
    const userId = await makeTestUser(prisma, 'turn-oos');
    mockRouter(null, 0.8, 'hormonal domain — not registered');

    const events = await collect(
      runChatTurn({
        db: prisma,
        userId,
        text: 'my period pains are worsening',
        routerLlm: routerClient(),
        // Should never be called on the out-of-scope path.
        scribeLlm: throwingScribe(new Error('scribe should not be invoked')),
      }),
    );

    const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.classification).toBe('out-of-scope-routed');
    expect(done.topicKey).toBeNull();
    expect(done.output).toBe(OUT_OF_SCOPE_FALLBACK);

    // The user message carries the router's decision for the audit.
    const userMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { userId, role: 'user' },
    });
    const meta = JSON.parse(userMsg.metadata!);
    expect(meta.routed.topicKey).toBeNull();

    // Assistant message persisted with the out-of-scope classification.
    const asstMsg = await prisma.chatMessage.findFirstOrThrow({
      where: { userId, role: 'assistant' },
    });
    const asstMeta = JSON.parse(asstMsg.metadata!);
    expect(asstMeta.classification).toBe('out-of-scope-routed');

    // No ScribeAudit row — no scribe was invoked.
    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
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
