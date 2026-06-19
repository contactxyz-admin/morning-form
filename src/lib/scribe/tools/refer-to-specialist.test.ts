import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { getOrCreateScribeForTopic } from '@/lib/scribe/repo';
import type {
  ScribeLLMClient,
  ScribeLLMTurn,
  ScribeLLMTurnRequest,
} from '@/lib/scribe/execute';
import {
  REFERRAL_DEPTH_VIOLATION,
  REFERRAL_REJECTED_FALLBACK,
  REFERRAL_TOPIC_VIOLATION,
  __setReferralScribeLLMForTest,
  referToSpecialistHandler,
} from './refer-to-specialist';
import type { ToolContext } from './types';

// Mock the production factory so the fallback path (test seam null) is
// controllable: a configured client in one test, a throwing factory in another.
const getScribeLLMClientMock = vi.fn(() => {
  throw new Error('getScribeLLMClient mock not configured for this test');
}) as unknown as ReturnType<typeof vi.fn> & (() => ScribeLLMClient);
vi.mock('../llm', () => ({
  getScribeLLMClient: () => getScribeLLMClientMock(),
  setScribeLLMForTest: vi.fn(),
}));

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
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

describe('refer_to_specialist — core specialty', () => {
  it('runs the specialist scribe, links audit rows by parentRequestId, and returns the specialist response', async () => {
    const userId = await makeTestUser(prisma, 'refer-core');
    // The general scribe row this referral chains *from*; the parent's audit
    // does not need to land before the tool fires (the parent records its
    // audit at the end of its own execute()), so for the tool-level test we
    // only need the child specialist's scribe row pre-seeded.
    const childScribe = await getOrCreateScribeForTopic(
      prisma,
      userId,
      'cardiometabolic',
      { modelVersion: 'v1' },
    );

    const calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [];
    __setReferralScribeLLMForTest(
      scriptedScribe([
        {
          stopReason: 'end_turn',
          text: 'From cardiometabolic: your record shows ferritin trending down over the last six months.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ], calls),
    );

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-id-core',
    };

    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'cardiometabolic',
      question: 'Is the user\'s ferritin pattern concerning?',
    });

    expect(result.status).toBe('core');
    expect(result.specialtyKey).toBe('cardiometabolic');
    expect(result.response).toMatch(/From cardiometabolic/);
    expect(result.requestId).toBeTruthy();
    expect(result.classification).toBeDefined();
    expect(calls[0].system).toContain('cardiometabolic specialist');
    expect(calls[0].system).toContain('Ask answer style contract:');
    expect(calls[0].system).toContain('Do not use Markdown tables');

    // The child audit row carries parentRequestId pointing at the caller.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: childScribe.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].parentRequestId).toBe('parent-req-id-core');
    expect(audits[0].topicKey).toBe('cardiometabolic');
  });
});

describe('refer_to_specialist — rejected child output is withheld (safety net)', () => {
  it('substitutes a safe fallback when the specialist output is forbidden-phrase rejected, never the raw text', async () => {
    const userId = await makeTestUser(prisma, 'refer-rejected');
    await getOrCreateScribeForTopic(prisma, userId, 'cardiometabolic', {
      modelVersion: 'v1',
    });

    // A scan-dirty child reply (drug name + dose) → enforce() classifies it
    // 'rejected'. The referral surface renders `response` verbatim, so the raw
    // text must not be what we hand back.
    __setReferralScribeLLMForTest(
      scriptedScribe([
        {
          stopReason: 'end_turn',
          text: 'You should take melatonin 3mg an hour before bed.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ]),
    );

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-rejected',
    };
    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'cardiometabolic',
      question: 'Should I take anything?',
    });

    expect(result.status).toBe('core');
    expect(result.classification).toBe('rejected');
    // Raw rejected text (drug name + dose) is NOT surfaced…
    expect(result.response).not.toMatch(/melatonin/i);
    expect(result.response).not.toMatch(/3\s?mg/i);
    // …a safe, in-lane fallback is returned instead.
    expect(result.response).toBe(REFERRAL_REJECTED_FALLBACK);
  });
});

describe('refer_to_specialist — production factory fallback', () => {
  it('falls back to the production factory client when the test seam is null', async () => {
    const userId = await makeTestUser(prisma, 'refer-factory-fallback');
    await getOrCreateScribeForTopic(prisma, userId, 'cardiometabolic', {
      modelVersion: 'v1',
    });

    // Test seam nulled — the handler must reach for the production factory.
    __setReferralScribeLLMForTest(null);
    const calls: Array<Pick<ScribeLLMTurnRequest, 'system'>> = [];
    // The mocked factory returns a configured (scripted) client.
    getScribeLLMClientMock.mockReturnValueOnce(
      scriptedScribe(
        [
          {
            stopReason: 'end_turn',
            text: 'From cardiometabolic (via factory).',
            modelVersion: 'v1',
            toolCalls: [],
          },
        ],
        calls,
      ),
    );

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-factory',
    };
    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'cardiometabolic',
      question: 'Is the pattern concerning?',
    });
    expect(result.status).toBe('core');
    expect(result.response).toMatch(/via factory/);
    expect(calls).toHaveLength(1);
    expect(getScribeLLMClientMock).toHaveBeenCalled();
  });

  it('returns a refused shape (no crash) when the factory throws (no client configured)', async () => {
    const userId = await makeTestUser(prisma, 'refer-factory-throws');
    await getOrCreateScribeForTopic(prisma, userId, 'cardiometabolic', {
      modelVersion: 'v1',
    });

    // Test seam null + factory throws → resolveProductionClient must catch and
    // yield a refused result, not propagate the throw.
    __setReferralScribeLLMForTest(null);
    getScribeLLMClientMock.mockImplementationOnce(() => {
      throw new Error('scribe.llm: ANTHROPIC_API_KEY is not set.');
    });

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-throws',
    };
    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'cardiometabolic',
      question: 'Is the pattern concerning?',
    });
    expect(result.status).toBe('refused');
    expect(result.response).toMatch(/no ScribeLLMClient configured/i);

    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
  });
});

describe('refer_to_specialist — stub specialty', () => {
  it('returns the registry fallback message, runs no scribe, writes no child audit', async () => {
    const userId = await makeTestUser(prisma, 'refer-stub');

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-id-stub',
    };

    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'mental-health',
      question: 'How does ongoing low mood map to my data?',
    });

    expect(result.status).toBe('stub');
    expect(result.specialtyKey).toBe('mental-health');
    expect(result.response).toMatch(/not yet built/i);
    // Stubs never run a scribe, so no requestId or classification.
    expect(result.requestId).toBeUndefined();
    expect(result.classification).toBeUndefined();

    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
  });
});

describe('refer_to_specialist — unknown specialty', () => {
  it('returns status=unknown without running any scribe', async () => {
    const userId = await makeTestUser(prisma, 'refer-unknown');

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-id-unknown',
    };

    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'not-a-real-key',
      question: 'whatever',
    });

    expect(result.status).toBe('unknown');
    expect(result.response).toMatch(/no specialty registered/i);

    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
  });
});

describe('refer_to_specialist — depth limit (only general may refer)', () => {
  it('refuses when the calling scribe is not the general scribe', async () => {
    const userId = await makeTestUser(prisma, 'refer-depth');

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'cardiometabolic', // a specialist trying to refer further
      requestId: 'parent-req-id-depth',
    };

    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'sleep-recovery',
      question: 'follow-up to the user\'s question',
    });

    expect(result.status).toBe('refused');
    expect(result.response).toBe(REFERRAL_DEPTH_VIOLATION);

    const audits = await prisma.scribeAudit.findMany({ where: { userId } });
    expect(audits).toHaveLength(0);
  });

  it('refuses when the calling scribe attempts to refer to itself (general → general)', async () => {
    const userId = await makeTestUser(prisma, 'refer-self');

    const ctx: ToolContext = {
      db: prisma,
      userId,
      topicKey: 'general',
      requestId: 'parent-req-id-self',
    };

    const result = await referToSpecialistHandler.execute(ctx, {
      specialtyKey: 'general',
      question: 'recursive referral',
    });

    expect(result.status).toBe('refused');
    expect(result.response).toBe(REFERRAL_TOPIC_VIOLATION);
  });
});
