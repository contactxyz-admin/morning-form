import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { getOrCreateScribeForTopic } from '@/lib/scribe/repo';
import type { ScribeLLMClient, ScribeLLMTurn } from '@/lib/scribe/execute';
import {
  REFERRAL_DEPTH_VIOLATION,
  REFERRAL_TOPIC_VIOLATION,
  __setReferralScribeLLMForTest,
  referToSpecialistHandler,
} from './refer-to-specialist';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
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

    __setReferralScribeLLMForTest(
      scriptedScribe([
        {
          stopReason: 'end_turn',
          text: 'From cardiometabolic: your record shows ferritin trending down over the last six months.',
          modelVersion: 'v1',
          toolCalls: [],
        },
      ]),
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

    // The child audit row carries parentRequestId pointing at the caller.
    const audits = await prisma.scribeAudit.findMany({
      where: { userId, scribeId: childScribe.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].parentRequestId).toBe('parent-req-id-core');
    expect(audits[0].topicKey).toBe('cardiometabolic');
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
