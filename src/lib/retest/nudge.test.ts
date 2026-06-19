import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addDays } from './constants';
import { buildRetestNudgeEmail } from './nudge-email';
import { decideNudgeAction, runRetestNudges, type NudgeSender } from './nudge';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const SCHEDULED = new Date('2026-04-01T00:00:00.000Z');

describe('decideNudgeAction (pure)', () => {
  it('sends nudge #1 once scheduledFor is reached, skips before', () => {
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 0, lastNudgedAt: null }, addDays(SCHEDULED, -1)),
    ).toEqual({ kind: 'skip' });
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 0, lastNudgedAt: null }, SCHEDULED),
    ).toMatchObject({ kind: 'send', offsetIndex: 0 });
  });

  it('paces later nudges to their offsets (+7d, +21d)', () => {
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 1, lastNudgedAt: SCHEDULED }, addDays(SCHEDULED, 6)),
    ).toEqual({ kind: 'skip' });
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 1, lastNudgedAt: SCHEDULED }, addDays(SCHEDULED, 7)),
    ).toMatchObject({ kind: 'send', offsetIndex: 1 });
    expect(
      decideNudgeAction(
        { scheduledFor: SCHEDULED, nudgeCount: 2, lastNudgedAt: addDays(SCHEDULED, 7) },
        addDays(SCHEDULED, 21),
      ),
    ).toMatchObject({ kind: 'send', offsetIndex: 2 });
  });

  it('honours the minimum gap after a late catch-up (no rapid-fire)', () => {
    // offset[1] (+7) is due at S+7, but the prior nudge went out late at S+4, so
    // the 7-day min gap blocks the next send until S+11.
    const draw = { scheduledFor: SCHEDULED, nudgeCount: 1, lastNudgedAt: addDays(SCHEDULED, 4) };
    expect(decideNudgeAction(draw, addDays(SCHEDULED, 7))).toEqual({ kind: 'skip' });
    expect(decideNudgeAction(draw, addDays(SCHEDULED, 11))).toMatchObject({ kind: 'send', offsetIndex: 1 });
  });

  it('lapses only after the final offset + grace; skips during the grace', () => {
    // offsets [0,7,21] exhausted; grace 14 → lapse at +35d.
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 3, lastNudgedAt: addDays(SCHEDULED, 21) }, addDays(SCHEDULED, 34)),
    ).toEqual({ kind: 'skip' });
    expect(
      decideNudgeAction({ scheduledFor: SCHEDULED, nudgeCount: 3, lastNudgedAt: addDays(SCHEDULED, 21) }, addDays(SCHEDULED, 35)),
    ).toEqual({ kind: 'lapse' });
  });

  it('skips a draw with no scheduledFor', () => {
    expect(decideNudgeAction({ scheduledFor: null, nudgeCount: 0, lastNudgedAt: null }, SCHEDULED)).toEqual({
      kind: 'skip',
    });
  });
});

/** Collecting sender + a factory for one that throws for a given user. */
function spySender(): { send: NudgeSender; calls: { userId: string; offsetIndex: number }[] } {
  const calls: { userId: string; offsetIndex: number }[] = [];
  const send: NudgeSender = async ({ recipient, offsetIndex }) => {
    calls.push({ userId: recipient.userId, offsetIndex });
  };
  return { send, calls };
}

describe('runRetestNudges (DB)', () => {
  it('sends the first nudge for a due, opted-in draw and advances bookkeeping', async () => {
    const userId = await makeTestUser(prisma, 'nudge-send');
    const draw = await prisma.draw.create({ data: { userId, status: 'scheduled', scheduledFor: SCHEDULED } });
    const { send, calls } = spySender();

    const summary = await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [userId] });

    expect(summary).toMatchObject({ considered: 1, sent: 1, skipped: 0, lapsed: 0, optedOut: 0, errors: 0 });
    expect(calls).toEqual([{ userId, offsetIndex: 0 }]);
    const after = await prisma.draw.findUniqueOrThrow({ where: { id: draw.id } });
    expect(after.nudgeCount).toBe(1);
    expect(after.lastNudgedAt?.toISOString()).toBe(SCHEDULED.toISOString());
  });

  it('is idempotent within the same day (no duplicate send)', async () => {
    const userId = await makeTestUser(prisma, 'nudge-idem');
    await prisma.draw.create({ data: { userId, status: 'scheduled', scheduledFor: SCHEDULED } });
    const { send, calls } = spySender();

    await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [userId] });
    const second = await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [userId] });

    expect(calls).toHaveLength(1); // only the first run sent
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('walks the full sequence then lapses an ignored draw', async () => {
    const userId = await makeTestUser(prisma, 'nudge-seq');
    const draw = await prisma.draw.create({ data: { userId, status: 'scheduled', scheduledFor: SCHEDULED } });
    const { send, calls } = spySender();
    const run = (now: Date) => runRetestNudges(prisma, send, { now, userIds: [userId] });

    expect((await run(SCHEDULED)).sent).toBe(1); // nudge 1
    expect((await run(addDays(SCHEDULED, 7))).sent).toBe(1); // nudge 2
    expect((await run(addDays(SCHEDULED, 21))).sent).toBe(1); // nudge 3
    expect(calls.map((c) => c.offsetIndex)).toEqual([0, 1, 2]);

    const lapseRun = await run(addDays(SCHEDULED, 35));
    expect(lapseRun.lapsed).toBe(1);
    const after = await prisma.draw.findUniqueOrThrow({ where: { id: draw.id } });
    expect(after.status).toBe('lapsed');
    expect(after.lapsedAt).not.toBeNull();
  });

  it('skips a user who opted out (notifyRetest=false)', async () => {
    const userId = await makeTestUser(prisma, 'nudge-optout');
    await prisma.userPreferences.create({ data: { userId, notifyRetest: false } });
    await prisma.draw.create({ data: { userId, status: 'scheduled', scheduledFor: SCHEDULED } });
    const { send, calls } = spySender();

    const summary = await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [userId] });

    expect(summary).toMatchObject({ considered: 1, optedOut: 1, sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it('does not consider a draw whose scheduledFor is still in the future', async () => {
    const userId = await makeTestUser(prisma, 'nudge-future');
    await prisma.draw.create({ data: { userId, status: 'scheduled', scheduledFor: addDays(SCHEDULED, 10) } });
    const { send } = spySender();

    const summary = await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [userId] });
    expect(summary).toMatchObject({ considered: 0, sent: 0 });
  });

  it('one failing send does not abort the batch and does not advance that draw', async () => {
    const u1 = await makeTestUser(prisma, 'nudge-fail');
    const u2 = await makeTestUser(prisma, 'nudge-ok');
    const d1 = await prisma.draw.create({ data: { userId: u1, status: 'scheduled', scheduledFor: SCHEDULED } });
    await prisma.draw.create({ data: { userId: u2, status: 'scheduled', scheduledFor: SCHEDULED } });

    const sent: string[] = [];
    const send: NudgeSender = async ({ recipient }) => {
      if (recipient.userId === u1) throw new Error('boom');
      sent.push(recipient.userId);
    };

    const summary = await runRetestNudges(prisma, send, { now: SCHEDULED, userIds: [u1, u2] });

    expect(summary.errors).toBe(1);
    expect(summary.sent).toBe(1);
    expect(sent).toEqual([u2]);
    // The failed draw is untouched → retried next run (no phantom lastNudgedAt).
    const failed = await prisma.draw.findUniqueOrThrow({ where: { id: d1.id } });
    expect(failed.nudgeCount).toBe(0);
    expect(failed.lastNudgedAt).toBeNull();
  });
});

describe('buildRetestNudgeEmail (in-lane copy)', () => {
  it('is descriptive — no directive/dose/causal tokens — and links a rebook', () => {
    const { subject, text } = buildRetestNudgeEmail({ to: 'a@b.com', name: 'Sam', offsetIndex: 0 });
    expect(subject).toMatch(/next MorningForm check/i);
    expect(text).toContain('Hi Sam,');
    expect(text).toContain('/record?ref=retest-nudge');
    expect(text).toMatch(/measure how your markers have moved/i);
    expect(text).toMatch(/discuss with your clinician/i);
    // No forbidden registers: dosing, directives, or causal-efficacy claims.
    expect(text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\b/i);
    expect(text).not.toMatch(/\btake\s+(?:\d|one|two|three)\b/i);
    expect(text).not.toMatch(/\b(cured|fixed|worked)\b/i);
  });

  it('varies the subject for reminder sends', () => {
    expect(buildRetestNudgeEmail({ to: 'a@b.com', name: null, offsetIndex: 1 }).subject).toMatch(/reminder/i);
  });
});
