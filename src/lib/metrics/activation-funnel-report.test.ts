import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { getOrCreateScribeForTopic, recordAudit } from '@/lib/scribe/repo';
import {
  computeActivationFunnel,
  InvalidCohortWindowError,
  type ActivationFunnelReport,
  type StageReport,
} from './activation-funnel-report';
import type { StageKey } from './activation-funnel';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function freshUser(suffix: string, createdAt: Date): Promise<string> {
  const id = await makeTestUser(prisma, `report-${suffix}`);
  await prisma.user.update({ where: { id }, data: { createdAt } });
  return id;
}

async function seedEssentials(userId: string, at: Date): Promise<void> {
  await prisma.assessmentResponse.create({
    data: { userId, responses: '{}', completedAt: at, createdAt: at },
  });
}

async function seedConnection(userId: string, at: Date, provider = 'oura'): Promise<void> {
  await prisma.healthConnection.create({
    data: { userId, provider, createdAt: at },
  });
}

async function seedChat(userId: string, at: Date): Promise<void> {
  await prisma.chatMessage.create({
    data: { userId, role: 'user', content: 'hi', createdAt: at },
  });
}

async function seedGrounded(userId: string, at: Date, topicKey = 'iron'): Promise<void> {
  const scribe = await getOrCreateScribeForTopic(prisma, userId, topicKey, {
    modelVersion: 'test-v1',
  });
  await recordAudit(prisma, userId, scribe.id, {
    requestId: `req-${topicKey}-${at.getTime()}`,
    topicKey,
    mode: 'runtime',
    prompt: 'test',
    toolCalls: [],
    output: 'answer',
    citations: [{ nodeId: 'n1', excerpt: 'x' }],
    safetyClassification: 'clinical-safe',
    modelVersion: 'test-v1',
  });
  await prisma.scribeAudit.updateMany({
    where: { scribeId: scribe.id, requestId: `req-${topicKey}-${at.getTime()}` },
    data: { createdAt: at },
  });
}

async function seedRetentionActivity(userId: string, at: Date): Promise<void> {
  await prisma.chatMessage.create({
    data: { userId, role: 'user', content: 'back', createdAt: at },
  });
}

function stageByKey(report: ActivationFunnelReport, key: StageKey): StageReport {
  const s = report.stages.find((x) => x.key === key);
  if (!s) throw new Error(`Missing stage ${key} in report`);
  return s;
}

describe('computeActivationFunnel — validation', () => {
  it('throws InvalidCohortWindowError when signupSince > signupUntil', async () => {
    await expect(
      computeActivationFunnel({
        signupSince: new Date('2026-04-10T00:00:00Z'),
        signupUntil: new Date('2026-04-01T00:00:00Z'),
        prisma,
      }),
    ).rejects.toBeInstanceOf(InvalidCohortWindowError);
  });
});

describe('computeActivationFunnel — cohort resolution', () => {
  it('returns cohort size 0 when no users match the signup window', async () => {
    const report = await computeActivationFunnel({
      signupSince: new Date('1900-01-01T00:00:00Z'),
      signupUntil: new Date('1900-01-02T00:00:00Z'),
      prisma,
    });
    expect(report.cohort.size).toBe(0);
    for (const s of report.stages) {
      expect(s.count).toBe(0);
      expect(s.pctOfSignups).toBe(0);
      expect(s.pctOfPrevious).toBe(0);
      expect(s.medianDaysFromSignup).toBeNull();
      expect(s.p75DaysFromSignup).toBeNull();
    }
  });

  it('explicit empty userIds produces an empty-cohort report', async () => {
    const report = await computeActivationFunnel({
      userIds: [],
      signupSince: new Date('2026-01-01T00:00:00Z'),
      signupUntil: new Date('2026-12-31T00:00:00Z'),
      prisma,
    });
    expect(report.cohort.size).toBe(0);
  });

  it('userIds takes precedence and narrows the cohort to the listed users', async () => {
    const inCohortAt = new Date('2026-04-01T00:00:00Z');
    const outCohortAt = new Date('2026-04-01T00:00:00Z');
    const inCohort = await freshUser('userids-in', inCohortAt);
    const outCohort = await freshUser('userids-out', outCohortAt);
    const report = await computeActivationFunnel({
      userIds: [inCohort],
      signupSince: new Date('2026-03-01T00:00:00Z'),
      signupUntil: new Date('2026-05-01T00:00:00Z'),
      prisma,
    });
    expect(report.cohort.userIds).toContain(inCohort);
    expect(report.cohort.userIds).not.toContain(outCohort);
    expect(report.cohort.size).toBe(1);
  });
});

describe('computeActivationFunnel — happy-path five-user funnel', () => {
  it('reports correct counts, pctOfSignups, pctOfPrevious at every stage', async () => {
    const signupAt = new Date('2026-04-01T00:00:00Z');
    const u1 = await freshUser('happy-1', signupAt);
    const u2 = await freshUser('happy-2', signupAt);
    const u3 = await freshUser('happy-3', signupAt);
    const u4 = await freshUser('happy-4', signupAt);
    const u5 = await freshUser('happy-5', signupAt);

    // 4 complete essentials (u1-u4)
    for (const u of [u1, u2, u3, u4]) {
      await seedEssentials(u, new Date(signupAt.getTime() + 1 * 60 * 60 * 1000));
    }
    // 3 connect (u1-u3)
    for (const u of [u1, u2, u3]) {
      await seedConnection(u, new Date(signupAt.getTime() + 2 * 60 * 60 * 1000));
    }
    // 2 chat (u1-u2)
    for (const u of [u1, u2]) {
      await seedChat(u, new Date(signupAt.getTime() + 3 * 60 * 60 * 1000));
    }
    // 2 grounded (u1-u2)
    for (const u of [u1, u2]) {
      await seedGrounded(u, new Date(signupAt.getTime() + 4 * 60 * 60 * 1000));
    }
    // 1 retains (u1 only) — activity +2d after grounded
    const u1GroundedAt = new Date(signupAt.getTime() + 4 * 60 * 60 * 1000);
    await seedRetentionActivity(u1, new Date(u1GroundedAt.getTime() + 2 * 24 * 60 * 60 * 1000));

    const report = await computeActivationFunnel({
      userIds: [u1, u2, u3, u4, u5],
      signupSince: new Date('2026-03-25T00:00:00Z'),
      signupUntil: new Date('2026-04-15T00:00:00Z'),
      prisma,
    });

    expect(report.cohort.size).toBe(5);

    expect(stageByKey(report, 'signup').count).toBe(5);
    expect(stageByKey(report, 'signup').pctOfSignups).toBe(100);
    expect(stageByKey(report, 'signup').pctOfPrevious).toBe(100);

    expect(stageByKey(report, 'essentials').count).toBe(4);
    expect(stageByKey(report, 'essentials').pctOfSignups).toBe(80);
    expect(stageByKey(report, 'essentials').pctOfPrevious).toBe(80);

    expect(stageByKey(report, 'connected').count).toBe(3);
    expect(stageByKey(report, 'connected').pctOfSignups).toBe(60);
    expect(stageByKey(report, 'connected').pctOfPrevious).toBe(75); // 3/4

    expect(stageByKey(report, 'first-chat').count).toBe(2);
    expect(stageByKey(report, 'first-chat').pctOfSignups).toBe(40);
    expect(stageByKey(report, 'first-chat').pctOfPrevious).toBe(66.7); // 2/3 = 66.67 → 66.7

    expect(stageByKey(report, 'grounded-answer').count).toBe(2);
    expect(stageByKey(report, 'grounded-answer').pctOfPrevious).toBe(100);

    expect(stageByKey(report, 'retained-7d').count).toBe(1);
    expect(stageByKey(report, 'retained-7d').pctOfPrevious).toBe(50);
  });
});

describe('computeActivationFunnel — time-to-stage percentiles', () => {
  it('computes median and p75 days-from-signup for a stage', async () => {
    const signupAt = new Date('2026-04-02T00:00:00Z');
    const users = await Promise.all(
      [1, 2, 3, 4].map((i) => freshUser(`ttspercentile-${i}`, signupAt)),
    );
    // Essentials deltas: 1d, 2d, 3d, 5d
    const deltasDays = [1, 2, 3, 5];
    for (let i = 0; i < users.length; i++) {
      await seedEssentials(
        users[i],
        new Date(signupAt.getTime() + deltasDays[i] * 24 * 60 * 60 * 1000),
      );
    }

    const report = await computeActivationFunnel({
      userIds: users,
      signupSince: new Date('2026-03-25T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });

    const essentials = stageByKey(report, 'essentials');
    expect(essentials.count).toBe(4);
    // Sorted: [1, 2, 3, 5]. Median (p=0.5) = mean(2, 3) = 2.5.
    expect(essentials.medianDaysFromSignup).toBe(2.5);
    // p75: rank = 0.75 * 3 = 2.25 → between index 2 (3) and 3 (5), weight 0.25
    // → 3 * 0.75 + 5 * 0.25 = 3.5
    expect(essentials.p75DaysFromSignup).toBe(3.5);
  });

  it('signup stage reports 0 for median/p75 (every delta is 0)', async () => {
    const signupAt = new Date('2026-04-03T00:00:00Z');
    const u = await freshUser('tts-signup-zero', signupAt);
    const report = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    const signup = stageByKey(report, 'signup');
    expect(signup.medianDaysFromSignup).toBe(0);
    expect(signup.p75DaysFromSignup).toBe(0);
  });

  it('reports null medians when a stage is never reached by any cohort user', async () => {
    const signupAt = new Date('2026-04-04T00:00:00Z');
    const u = await freshUser('tts-unreached', signupAt);
    const report = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    expect(stageByKey(report, 'essentials').count).toBe(0);
    expect(stageByKey(report, 'essentials').medianDaysFromSignup).toBeNull();
    expect(stageByKey(report, 'essentials').p75DaysFromSignup).toBeNull();
  });

  it('returns the single value as median/p75 for odd-sized size=1', async () => {
    const signupAt = new Date('2026-04-05T00:00:00Z');
    const u = await freshUser('tts-size-one', signupAt);
    await seedEssentials(u, new Date(signupAt.getTime() + 2 * 24 * 60 * 60 * 1000));
    const report = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    const essentials = stageByKey(report, 'essentials');
    expect(essentials.medianDaysFromSignup).toBe(2);
    expect(essentials.p75DaysFromSignup).toBe(2);
  });
});

describe('computeActivationFunnel — anomalous stage order', () => {
  it('reports negative deltas as-is when stage timestamp precedes signup', async () => {
    const signupAt = new Date('2026-04-06T00:00:00Z');
    const u = await freshUser('anomaly-backdated', signupAt);
    // Grounded answer "before" signup — simulate historical-data import out of order.
    // ScribeAudit needs a Scribe first; getOrCreateScribeForTopic runs after the
    // user exists, then we backdate the audit row explicitly.
    await seedGrounded(u, new Date(signupAt.getTime() - 1 * 24 * 60 * 60 * 1000));

    const report = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-03-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    const grounded = stageByKey(report, 'grounded-answer');
    expect(grounded.count).toBe(1);
    expect(grounded.medianDaysFromSignup).toBe(-1);
  });
});

describe('computeActivationFunnel — all stages 100%', () => {
  it('every stage shows 100% / 100% when every user completes the full funnel', async () => {
    const signupAt = new Date('2026-04-07T00:00:00Z');
    const users = await Promise.all(
      [1, 2].map((i) => freshUser(`full-${i}`, signupAt)),
    );
    for (const u of users) {
      await seedEssentials(u, new Date(signupAt.getTime() + 1 * 60 * 60 * 1000));
      await seedConnection(u, new Date(signupAt.getTime() + 2 * 60 * 60 * 1000));
      await seedChat(u, new Date(signupAt.getTime() + 3 * 60 * 60 * 1000));
      const groundedAt = new Date(signupAt.getTime() + 4 * 60 * 60 * 1000);
      await seedGrounded(u, groundedAt);
      await seedRetentionActivity(
        u,
        new Date(groundedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
      );
    }
    const report = await computeActivationFunnel({
      userIds: users,
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    for (const s of report.stages) {
      expect(s.count).toBe(2);
      expect(s.pctOfSignups).toBe(100);
      expect(s.pctOfPrevious).toBe(100);
    }
  });
});

describe('computeActivationFunnel — retentionWindowDays passthrough', () => {
  it('a 14-day retention window captures activity that the default 7-day would miss', async () => {
    const signupAt = new Date('2026-04-08T00:00:00Z');
    const u = await freshUser('retention-14', signupAt);
    const groundedAt = new Date(signupAt.getTime() + 1 * 24 * 60 * 60 * 1000);
    await seedGrounded(u, groundedAt);
    // Activity at +10d after grounded — outside default 7d, inside 14d.
    await seedRetentionActivity(
      u,
      new Date(groundedAt.getTime() + 10 * 24 * 60 * 60 * 1000),
    );

    const defaultReport = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      prisma,
    });
    expect(stageByKey(defaultReport, 'retained-7d').count).toBe(0);

    const wideReport = await computeActivationFunnel({
      userIds: [u],
      signupSince: new Date('2026-04-01T00:00:00Z'),
      signupUntil: new Date('2026-04-30T00:00:00Z'),
      retentionWindowDays: 14,
      prisma,
    });
    expect(stageByKey(wideReport, 'retained-7d').count).toBe(1);
    expect(wideReport.cohort.retentionWindowDays).toBe(14);
  });
});
