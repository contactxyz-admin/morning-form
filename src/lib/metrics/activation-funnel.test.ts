import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { getOrCreateScribeForTopic, recordAudit } from '@/lib/scribe/repo';
import {
  ACTIVATION_STAGES,
  DEFAULT_RETENTION_WINDOW_DAYS,
  hasAtLeastOneCitation,
  type StageDefinition,
  type StageReachMap,
} from './activation-funnel';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

function stage(key: StageDefinition['key']): StageDefinition {
  const found = ACTIVATION_STAGES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown stage key in test: ${key}`);
  return found;
}

async function setUserCreatedAt(userId: string, at: Date): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { createdAt: at } });
}

async function writeAudit(args: {
  userId: string;
  topicKey?: string;
  requestId: string;
  output?: string;
  citations: unknown;
  safetyClassification: 'clinical-safe' | 'out-of-scope-routed' | 'rejected';
  createdAt?: Date;
  /** Escape hatch — raw JSON string (for malformed citations test). */
  rawCitations?: string;
}): Promise<void> {
  const topicKey = args.topicKey ?? 'iron';
  const scribe = await getOrCreateScribeForTopic(prisma, args.userId, topicKey, {
    modelVersion: 'test-v1',
  });
  await recordAudit(prisma, args.userId, scribe.id, {
    requestId: args.requestId,
    topicKey,
    mode: 'runtime',
    prompt: 'test-prompt',
    toolCalls: [],
    output: args.output ?? 'test-output',
    citations: args.citations ?? [],
    safetyClassification: args.safetyClassification,
    modelVersion: 'test-v1',
  });

  if (args.rawCitations !== undefined || args.createdAt !== undefined) {
    await prisma.scribeAudit.updateMany({
      where: { scribeId: scribe.id, requestId: args.requestId },
      data: {
        ...(args.rawCitations !== undefined ? { citations: args.rawCitations } : {}),
        ...(args.createdAt !== undefined ? { createdAt: args.createdAt } : {}),
      },
    });
  }
}

const FAR_FUTURE = new Date('2099-01-01T00:00:00Z');

describe('hasAtLeastOneCitation', () => {
  it('returns true for a non-empty citation array', () => {
    expect(
      hasAtLeastOneCitation(JSON.stringify([{ nodeId: 'n1', excerpt: 'x' }])),
    ).toBe(true);
  });

  it('returns false for an empty array', () => {
    expect(hasAtLeastOneCitation('[]')).toBe(false);
  });

  it('returns false for null, empty, or malformed JSON without throwing', () => {
    expect(hasAtLeastOneCitation(null)).toBe(false);
    expect(hasAtLeastOneCitation('')).toBe(false);
    expect(hasAtLeastOneCitation('not json')).toBe(false);
    expect(hasAtLeastOneCitation('{"not":"array"}')).toBe(false);
  });
});

describe('ACTIVATION_STAGES registry', () => {
  it('exposes the six ordered stage keys', () => {
    expect(ACTIVATION_STAGES.map((s) => s.key)).toEqual([
      'signup',
      'essentials',
      'connected',
      'first-chat',
      'grounded-answer',
      'retained-7d',
    ]);
  });
});

describe('signup stage', () => {
  it('returns each cohort user with their createdAt', async () => {
    const userId = await makeTestUser(prisma, 'funnel-signup');
    const map = await stage('signup').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.size).toBe(1);
    expect(map.get(userId)).toBeInstanceOf(Date);
  });

  it('excludes users whose createdAt is after window.until', async () => {
    const userId = await makeTestUser(prisma, 'funnel-signup-future');
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const map = await stage('signup').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: past },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });

  it('returns an empty map when userIds is empty', async () => {
    const map = await stage('signup').resolve({
      db: prisma,
      userIds: [],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.size).toBe(0);
  });
});

describe('essentials stage', () => {
  it('returns the AssessmentResponse.completedAt for users who completed essentials', async () => {
    const userId = await makeTestUser(prisma, 'funnel-essentials');
    const completedAt = new Date('2026-04-01T10:00:00Z');
    await prisma.assessmentResponse.create({
      data: { userId, responses: '{}', completedAt },
    });
    const map = await stage('essentials').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(completedAt.toISOString());
  });

  it('returns an empty map for users who have not completed essentials', async () => {
    const userId = await makeTestUser(prisma, 'funnel-essentials-none');
    const map = await stage('essentials').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });
});

describe('connected stage', () => {
  it('resolves via HealthConnection when only that path exists', async () => {
    const userId = await makeTestUser(prisma, 'funnel-connected-hc');
    const connectedAt = new Date('2026-04-02T10:00:00Z');
    await prisma.healthConnection.create({
      data: { userId, provider: 'oura', createdAt: connectedAt },
    });
    const map = await stage('connected').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(connectedAt.toISOString());
  });

  it('resolves via SourceDocument when no HealthConnection exists (lab PDF path)', async () => {
    const userId = await makeTestUser(prisma, 'funnel-connected-doc');
    const capturedAt = new Date('2026-04-03T10:00:00Z');
    await prisma.sourceDocument.create({
      data: { userId, kind: 'lab-pdf', capturedAt },
    });
    const map = await stage('connected').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(capturedAt.toISOString());
  });

  it('takes the earlier of HealthConnection.createdAt and SourceDocument.capturedAt when both exist', async () => {
    const userId = await makeTestUser(prisma, 'funnel-connected-both');
    const earlyDoc = new Date('2026-04-04T08:00:00Z');
    const laterConn = new Date('2026-04-04T12:00:00Z');
    await prisma.sourceDocument.create({
      data: { userId, kind: 'lab-pdf', capturedAt: earlyDoc },
    });
    await prisma.healthConnection.create({
      data: { userId, provider: 'whoop', createdAt: laterConn },
    });
    const map = await stage('connected').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(earlyDoc.toISOString());
  });
});

describe('first-chat stage', () => {
  it('returns the earliest role=user ChatMessage.createdAt', async () => {
    const userId = await makeTestUser(prisma, 'funnel-chat');
    const first = new Date('2026-04-05T09:00:00Z');
    const later = new Date('2026-04-05T10:00:00Z');
    await prisma.chatMessage.createMany({
      data: [
        { userId, role: 'user', content: 'hi', createdAt: first },
        { userId, role: 'user', content: 'again', createdAt: later },
      ],
    });
    const map = await stage('first-chat').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(first.toISOString());
  });

  it('ignores assistant-role messages', async () => {
    const userId = await makeTestUser(prisma, 'funnel-chat-assistant-only');
    await prisma.chatMessage.create({
      data: { userId, role: 'assistant', content: 'hello' },
    });
    const map = await stage('first-chat').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });
});

describe('grounded-answer stage', () => {
  it('qualifies a clinical-safe row with a non-empty citation array', async () => {
    const userId = await makeTestUser(prisma, 'funnel-grounded-yes');
    await writeAudit({
      userId,
      requestId: 'req-1',
      citations: [{ nodeId: 'node-1', excerpt: 'serum ferritin 18' }],
      safetyClassification: 'clinical-safe',
    });
    const map = await stage('grounded-answer').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(true);
  });

  it('does NOT qualify a clinical-safe row with empty citations', async () => {
    const userId = await makeTestUser(prisma, 'funnel-grounded-empty');
    await writeAudit({
      userId,
      requestId: 'req-1',
      citations: [],
      safetyClassification: 'clinical-safe',
    });
    const map = await stage('grounded-answer').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });

  it('does NOT qualify a clinical-safe row with malformed citations JSON and does not throw', async () => {
    const userId = await makeTestUser(prisma, 'funnel-grounded-malformed');
    await writeAudit({
      userId,
      requestId: 'req-1',
      citations: [],
      rawCitations: 'not-json',
      safetyClassification: 'clinical-safe',
    });
    const map = await stage('grounded-answer').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });

  it('does NOT qualify an out-of-scope-routed row even with citations', async () => {
    const userId = await makeTestUser(prisma, 'funnel-grounded-oos');
    await writeAudit({
      userId,
      requestId: 'req-1',
      citations: [{ nodeId: 'node-1', excerpt: 'x' }],
      safetyClassification: 'out-of-scope-routed',
    });
    const map = await stage('grounded-answer').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.has(userId)).toBe(false);
  });

  it('picks the earliest qualifying row when multiple exist', async () => {
    const userId = await makeTestUser(prisma, 'funnel-grounded-earliest');
    const earlier = new Date('2026-04-06T09:00:00Z');
    const later = new Date('2026-04-06T11:00:00Z');
    await writeAudit({
      userId,
      requestId: 'req-early',
      citations: [{ nodeId: 'node-1', excerpt: 'x' }],
      safetyClassification: 'clinical-safe',
      createdAt: earlier,
    });
    await writeAudit({
      userId,
      topicKey: 'sleep-recovery',
      requestId: 'req-late',
      citations: [{ nodeId: 'node-2', excerpt: 'y' }],
      safetyClassification: 'clinical-safe',
      createdAt: later,
    });
    const map = await stage('grounded-answer').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(map.get(userId)?.toISOString()).toBe(earlier.toISOString());
  });
});

describe('retained-7d stage', () => {
  it('counts ChatMessage activity ≥24h after grounded answer within 7 days', async () => {
    const userId = await makeTestUser(prisma, 'funnel-retain-yes');
    const groundedAt = new Date('2026-04-07T00:00:00Z');
    const atOneDayLater = new Date(groundedAt.getTime() + 25 * 60 * 60 * 1000); // +25h
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'back again', createdAt: atOneDayLater },
    });
    const previous: StageReachMap = new Map([[userId, groundedAt]]);
    const map = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous,
    });
    expect(map.get(userId)?.toISOString()).toBe(atOneDayLater.toISOString());
  });

  it('does NOT count activity at +12h (strictly before the 24h lower bound)', async () => {
    const userId = await makeTestUser(prisma, 'funnel-retain-too-soon');
    const groundedAt = new Date('2026-04-08T00:00:00Z');
    const tooSoon = new Date(groundedAt.getTime() + 12 * 60 * 60 * 1000);
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'too soon', createdAt: tooSoon },
    });
    const previous: StageReachMap = new Map([[userId, groundedAt]]);
    const map = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous,
    });
    expect(map.has(userId)).toBe(false);
  });

  it('does NOT count activity at +8 days (strictly after the 7-day upper bound)', async () => {
    const userId = await makeTestUser(prisma, 'funnel-retain-too-late');
    const groundedAt = new Date('2026-04-09T00:00:00Z');
    const tooLate = new Date(groundedAt.getTime() + 8 * 24 * 60 * 60 * 1000);
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'too late', createdAt: tooLate },
    });
    const previous: StageReachMap = new Map([[userId, groundedAt]]);
    const map = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE, retentionWindowDays: DEFAULT_RETENTION_WINDOW_DAYS },
      previous,
    });
    expect(map.has(userId)).toBe(false);
  });

  it('counts HealthDataPoint activity within the retention window', async () => {
    const userId = await makeTestUser(prisma, 'funnel-retain-hdp');
    const groundedAt = new Date('2026-04-10T00:00:00Z');
    const at = new Date(groundedAt.getTime() + 2 * 24 * 60 * 60 * 1000); // +2d
    await prisma.healthDataPoint.create({
      data: {
        userId,
        provider: 'oura',
        category: 'sleep',
        metric: 'total',
        value: 420,
        unit: 'minutes',
        timestamp: at,
        createdAt: at,
      },
    });
    const previous: StageReachMap = new Map([[userId, groundedAt]]);
    const map = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous,
    });
    expect(map.get(userId)?.toISOString()).toBe(at.toISOString());
  });

  it('honours a custom retentionWindowDays override', async () => {
    const userId = await makeTestUser(prisma, 'funnel-retain-custom');
    const groundedAt = new Date('2026-04-11T00:00:00Z');
    const at = new Date(groundedAt.getTime() + 10 * 24 * 60 * 60 * 1000); // +10d
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'later', createdAt: at },
    });
    const previous: StageReachMap = new Map([[userId, groundedAt]]);

    const defaultMap = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
      previous,
    });
    expect(defaultMap.has(userId)).toBe(false);

    const wideMap = await stage('retained-7d').resolve({
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE, retentionWindowDays: 14 },
      previous,
    });
    expect(wideMap.get(userId)?.toISOString()).toBe(at.toISOString());
  });
});

describe('cohort scoping', () => {
  it('userIds filter excludes users not in the cohort at every stage', async () => {
    const inCohort = await makeTestUser(prisma, 'funnel-cohort-in');
    const outCohort = await makeTestUser(prisma, 'funnel-cohort-out');
    await prisma.assessmentResponse.create({
      data: { userId: outCohort, responses: '{}' },
    });
    await prisma.assessmentResponse.create({
      data: { userId: inCohort, responses: '{}' },
    });
    const essentialsMap = await stage('essentials').resolve({
      db: prisma,
      userIds: [inCohort],
      window: { until: FAR_FUTURE },
      previous: new Map(),
    });
    expect(essentialsMap.has(inCohort)).toBe(true);
    expect(essentialsMap.has(outCohort)).toBe(false);
  });
});

describe('full-funnel integration — seeded user reaches every stage', () => {
  it('resolves each of the six stages in order against real Prisma', async () => {
    const userId = await makeTestUser(prisma, 'funnel-full');
    const signupAt = new Date('2026-03-20T00:00:00Z');
    await setUserCreatedAt(userId, signupAt);

    const essentialsAt = new Date('2026-03-20T01:00:00Z');
    await prisma.assessmentResponse.create({
      data: { userId, responses: '{}', completedAt: essentialsAt, createdAt: essentialsAt },
    });

    const connectedAt = new Date('2026-03-20T02:00:00Z');
    await prisma.healthConnection.create({
      data: { userId, provider: 'oura', createdAt: connectedAt },
    });

    const firstChatAt = new Date('2026-03-20T03:00:00Z');
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'hi', createdAt: firstChatAt },
    });

    const groundedAt = new Date('2026-03-20T04:00:00Z');
    await writeAudit({
      userId,
      requestId: 'req-full',
      citations: [{ nodeId: 'n1', excerpt: 'x' }],
      safetyClassification: 'clinical-safe',
      createdAt: groundedAt,
    });

    const retentionAt = new Date(groundedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    await prisma.chatMessage.create({
      data: { userId, role: 'user', content: 'back', createdAt: retentionAt },
    });

    const ctx = {
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
    };
    const signupMap = await stage('signup').resolve({ ...ctx, previous: new Map() });
    expect(signupMap.get(userId)?.toISOString()).toBe(signupAt.toISOString());

    const essentialsMap = await stage('essentials').resolve({ ...ctx, previous: signupMap });
    expect(essentialsMap.has(userId)).toBe(true);

    const connectedMap = await stage('connected').resolve({ ...ctx, previous: essentialsMap });
    expect(connectedMap.get(userId)?.toISOString()).toBe(connectedAt.toISOString());

    const chatMap = await stage('first-chat').resolve({ ...ctx, previous: connectedMap });
    expect(chatMap.get(userId)?.toISOString()).toBe(firstChatAt.toISOString());

    const groundedMap = await stage('grounded-answer').resolve({ ...ctx, previous: chatMap });
    expect(groundedMap.get(userId)?.toISOString()).toBe(groundedAt.toISOString());

    const retainedMap = await stage('retained-7d').resolve({ ...ctx, previous: groundedMap });
    expect(retainedMap.get(userId)?.toISOString()).toBe(retentionAt.toISOString());
  });

  it('a signup-only user reaches only stage 1', async () => {
    const userId = await makeTestUser(prisma, 'funnel-signup-only');
    const ctx = {
      db: prisma,
      userIds: [userId],
      window: { until: FAR_FUTURE },
    };
    const signupMap = await stage('signup').resolve({ ...ctx, previous: new Map() });
    expect(signupMap.has(userId)).toBe(true);
    for (const key of ['essentials', 'connected', 'first-chat', 'grounded-answer', 'retained-7d'] as const) {
      const map = await stage(key).resolve({ ...ctx, previous: signupMap });
      expect(map.has(userId)).toBe(false);
    }
  });
});
