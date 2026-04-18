/**
 * Scribe executor tests — the contract lives in `execute.ts`'s header:
 *   D10: user-scoping is an executor invariant, not handler discipline
 *   D11: audit-before-gate ordering
 * These tests pin both, plus the tool-dispatch loop and error surfaces.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { getOrCreateScribeForTopic } from './repo';
import {
  execute,
  type ScribeExecuteRequest,
  type ScribeLLMClient,
  type ScribeLLMTurn,
} from './execute';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

/**
 * Scripted LLM: feeds the executor a queue of pre-baked turns. Captures every
 * `turn()` invocation so tests can assert what the executor sent and in what
 * order.
 */
function scriptedLLM(turns: ScribeLLMTurn[]): {
  client: ScribeLLMClient;
  calls: Array<{ system: string; messages: unknown }>;
} {
  const calls: Array<{ system: string; messages: unknown }> = [];
  const queue = [...turns];
  const client: ScribeLLMClient = {
    async turn(req) {
      calls.push({ system: req.system, messages: structuredClone(req.messages) });
      const next = queue.shift();
      if (!next) throw new Error('scriptedLLM: queue exhausted');
      return next;
    },
  };
  return { client, calls };
}

function baseRequest(
  overrides: Partial<ScribeExecuteRequest> & Pick<ScribeExecuteRequest, 'userId'>,
): ScribeExecuteRequest {
  return {
    db: prisma,
    topicKey: 'iron',
    mode: 'runtime',
    userMessage: 'explain my ferritin',
    declaredJudgmentKind: 'reference-range-comparison',
    sections: [],
    llm: overrides.llm as ScribeLLMClient,
    ...overrides,
  };
}

describe('scribe executor — happy path (tool dispatch + audit)', () => {
  it('dispatches tool calls, feeds results back, ends, writes audit with clinical-safe classification', async () => {
    const userId = await makeTestUser(prisma, 'exec-happy');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v-pin' });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 12, referenceRangeLow: 15, referenceRangeHigh: 150, unit: 'ug/L' },
    });

    const { client, calls } = scriptedLLM([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v-actual',
        toolCalls: [
          { id: 'call-1', name: 'compare_to_reference_range', input: { canonicalKey: 'ferritin' } },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'Your ferritin of 12 ug/L is below the typical reference range of 15–150 ug/L.',
        modelVersion: 'v-actual',
        toolCalls: [],
      },
    ]);

    const result = await execute(baseRequest({
      userId,
      llm: client,
      requestId: '44444444-4444-4444-8444-444444444444',
    }));

    expect(result.classification).toBe('clinical-safe');
    expect(result.output).toMatch(/below the typical reference range/);
    expect(result.modelVersion).toBe('v-actual');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('compare_to_reference_range');
    expect(result.toolCalls[0].isError).toBe(false);
    expect((result.toolCalls[0].output as { classification: string }).classification).toBe('below');

    // Two LLM turns — initial + post-tool-result.
    expect(calls).toHaveLength(2);

    const audit = await prisma.scribeAudit.findUnique({
      where: { scribeId_requestId: { scribeId: (await prisma.scribe.findFirstOrThrow({ where: { userId } })).id, requestId: result.requestId } },
    });
    expect(audit).not.toBeNull();
    expect(audit?.safetyClassification).toBe('clinical-safe');
    expect(audit?.modelVersion).toBe('v-actual');
    expect(audit?.mode).toBe('runtime');
  });
});

describe('scribe executor — D10 user-scoping invariant', () => {
  it('rejects missing userId at the type-narrowed entry', async () => {
    const { client } = scriptedLLM([]);
    await expect(
      execute(baseRequest({ userId: '', llm: client })),
    ).rejects.toThrow(/userId is required/);
  });

  it('rejects missing topicKey at the type-narrowed entry', async () => {
    const userId = await makeTestUser(prisma, 'exec-no-topic');
    const { client } = scriptedLLM([]);
    await expect(
      execute(baseRequest({ userId, topicKey: '', llm: client })),
    ).rejects.toThrow(/topicKey is required/);
  });

  it('threads the resolved userId to every handler — a handler call for userB never sees userA data', async () => {
    // If the executor leaked the wrong userId through ctx, compare_to_reference_range
    // would surface userA's ferritin for a request made by userB. This test verifies
    // the opposite — userB asks, gets classification: not-found.
    const userA = await makeTestUser(prisma, 'exec-scope-userA');
    const userB = await makeTestUser(prisma, 'exec-scope-userB');
    await getOrCreateScribeForTopic(prisma, userB, 'iron', { modelVersion: 'v1' });
    await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 12, referenceRangeLow: 15, referenceRangeHigh: 150 },
    });

    const { client } = scriptedLLM([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          { id: 'c1', name: 'compare_to_reference_range', input: { canonicalKey: 'ferritin' } },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'No ferritin data on file for you.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const result = await execute(baseRequest({ userId: userB, llm: client }));
    expect(result.toolCalls[0].output).toMatchObject({ found: false, classification: 'not-found' });
  });
});

describe('scribe executor — D11 audit-before-gate ordering', () => {
  it('writes a ScribeAudit row even when the final output is rejected by the policy', async () => {
    const userId = await makeTestUser(prisma, 'exec-audit-rejected');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const { client } = scriptedLLM([
      {
        stopReason: 'end_turn',
        text: 'You should take 65mg ferrous sulfate daily.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const result = await execute(baseRequest({ userId, llm: client }));
    expect(result.classification).toBe('rejected');

    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(1);
    expect(audits[0].safetyClassification).toBe('rejected');
    expect(audits[0].output).toMatch(/ferrous sulfate/);
  });

  it('audit upsert is idempotent on repeat executions with the same requestId', async () => {
    const userId = await makeTestUser(prisma, 'exec-audit-idem');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const requestId = '55555555-5555-4555-8555-555555555555';
    const turn1: ScribeLLMTurn = {
      stopReason: 'end_turn',
      text: 'Ferritin 12 ug/L is below the 15–150 ug/L reference range.',
      modelVersion: 'v1',
      toolCalls: [],
    };
    const { client: c1 } = scriptedLLM([turn1]);
    const { client: c2 } = scriptedLLM([turn1]);

    await execute(baseRequest({ userId, llm: c1, requestId }));
    await execute(baseRequest({ userId, llm: c2, requestId }));

    const audits = await prisma.scribeAudit.findMany({ where: { userId, requestId } });
    expect(audits).toHaveLength(1);
  });
});

describe('scribe executor — error surfaces', () => {
  it('records tool errors in the audit\'s toolCalls list but continues the loop', async () => {
    const userId = await makeTestUser(prisma, 'exec-tool-error');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const { client } = scriptedLLM([
      {
        stopReason: 'tool_use',
        text: '',
        modelVersion: 'v1',
        toolCalls: [
          { id: 'c1', name: 'not_a_real_tool', input: {} },
          // invalid input for a real tool — zod parse fails
          { id: 'c2', name: 'compare_to_reference_range', input: { not: 'right' } },
        ],
      },
      {
        stopReason: 'end_turn',
        text: 'I could not reason about your ferritin. Discuss with your clinician.',
        modelVersion: 'v1',
        toolCalls: [],
      },
    ]);

    const result = await execute(baseRequest({
      userId,
      llm: client,
      declaredJudgmentKind: 'citation-surfacing',
    }));

    const errors = result.toolCalls.filter((c) => c.isError);
    expect(errors).toHaveLength(2);
    expect(errors[0].name).toBe('not_a_real_tool');
    expect(errors[1].name).toBe('compare_to_reference_range');
  });

  it('throws when the LLM loops past maxToolCalls without end_turn', async () => {
    const userId = await makeTestUser(prisma, 'exec-runaway');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const toolTurn: ScribeLLMTurn = {
      stopReason: 'tool_use',
      text: '',
      modelVersion: 'v1',
      toolCalls: [
        { id: 'c1', name: 'search_graph_nodes', input: { query: 'ferritin' } },
      ],
    };
    const { client } = scriptedLLM([toolTurn, toolTurn, toolTurn]);

    await expect(
      execute(baseRequest({ userId, llm: client, maxToolCalls: 2 })),
    ).rejects.toThrow(/exceeded maxToolCalls/);
  });

  it('D11: writes a rejected ScribeAudit row even when the LLM loop throws past maxToolCalls', async () => {
    // Regression for the audit-before-gate invariant: any throw between the
    // first LLM turn and the final enforce() must still land an audit row.
    // We trigger the maxToolCalls throw and assert the row exists with
    // safetyClassification='rejected'.
    const userId = await makeTestUser(prisma, 'exec-runaway-audit');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const toolTurn: ScribeLLMTurn = {
      stopReason: 'tool_use',
      text: '',
      modelVersion: 'v-runaway',
      toolCalls: [
        { id: 'c1', name: 'search_graph_nodes', input: { query: 'ferritin' } },
      ],
    };
    const { client } = scriptedLLM([toolTurn, toolTurn, toolTurn]);

    const requestId = '66666666-6666-4666-8666-666666666666';
    await expect(
      execute(baseRequest({ userId, llm: client, maxToolCalls: 2, requestId })),
    ).rejects.toThrow(/exceeded maxToolCalls/);

    const audits = await prisma.scribeAudit.findMany({ where: { userId, requestId } });
    expect(audits).toHaveLength(1);
    expect(audits[0].safetyClassification).toBe('rejected');
    expect(audits[0].modelVersion).toBe('v-runaway');
  });

  it('D11: writes a rejected ScribeAudit row when the LLM emits tool_use with no tool_calls', async () => {
    // A malformed tool_use response (stopReason='tool_use' but toolCalls=[])
    // throws mid-loop. The audit must still land — same invariant as the
    // maxToolCalls case.
    const userId = await makeTestUser(prisma, 'exec-malformed-tool-use');
    await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const { client } = scriptedLLM([
      { stopReason: 'tool_use', text: '', modelVersion: 'v1', toolCalls: [] },
    ]);

    const requestId = '77777777-7777-4777-8777-777777777777';
    await expect(
      execute(baseRequest({ userId, llm: client, requestId })),
    ).rejects.toThrow(/tool_use stop with no tool_calls/);

    const audits = await prisma.scribeAudit.findMany({ where: { userId, requestId } });
    expect(audits).toHaveLength(1);
    expect(audits[0].safetyClassification).toBe('rejected');
  });

  it('throws when no policy exists for the topicKey', async () => {
    const userId = await makeTestUser(prisma, 'exec-unknown-policy');
    const { client } = scriptedLLM([]);
    await expect(
      execute(baseRequest({ userId, topicKey: 'nonsense-topic', llm: client })),
    ).rejects.toThrow(/no safety policy registered/);
  });
});
