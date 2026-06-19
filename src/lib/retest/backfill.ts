/**
 * Baseline-draw backfill for existing users (Plan 2026-06-17-001 U5).
 *
 * Users who uploaded lab panels BEFORE the retest loop existed have no Draw
 * rows, so they would be invisible to the loop (never nudged) and absent from
 * the metric. This backfill gives each such user a single completed baseline
 * draw — tagged `attribution = 'backfill'` so it is EXCLUDED from the forward-only
 * retention headline (return earned before the loop is not loop-caused) — and
 * schedules their next retest so the nudge cron can re-engage them.
 *
 * Run dark (before the flag flip); invisible until RETEST_LOOP_ENABLED. The next
 * scheduled draw is dated one cadence after the user's MOST RECENT panel, so a
 * user overdue for a retest is nudged promptly while a recently-tested user is
 * not. Idempotent: a user who already has any Draw row is skipped.
 */

import type { PrismaClient } from '@prisma/client';
import { nextRetestDate } from './constants';
import { scheduleNextDraw } from './draws';

export type BackfillStatus =
  | 'created'
  | 'would-create'
  | 'skipped-has-draws'
  | 'skipped-no-labs';

export interface BackfillResult {
  userId: string;
  status: BackfillStatus;
  /** Set when created / would-create: the baseline draw's date (earliest panel). */
  baselineAt?: Date;
  /** Set when created / would-create: when the next retest is scheduled. */
  nextScheduledFor?: Date;
  /** Set when created / would-create: the panel linked to the baseline draw. */
  sourceDocumentId?: string;
}

/**
 * Backfill one user's baseline draw. With `apply: false` (default) this is a
 * dry run — it reports what it would do and writes nothing.
 */
export async function backfillBaselineDrawForUser(
  prisma: PrismaClient,
  userId: string,
  options: { apply?: boolean } = {},
): Promise<BackfillResult> {
  // Idempotent: never touch a user who already has draws.
  const existing = await prisma.draw.count({ where: { userId } });
  if (existing > 0) return { userId, status: 'skipped-has-draws' };

  const labs = await prisma.sourceDocument.findMany({
    where: { userId, kind: 'lab_pdf' },
    orderBy: { capturedAt: 'asc' },
    select: { id: true, capturedAt: true },
  });
  if (labs.length === 0) return { userId, status: 'skipped-no-labs' };

  const earliest = labs[0];
  const latest = labs[labs.length - 1];
  const nextScheduledFor = nextRetestDate(latest.capturedAt);

  if (!options.apply) {
    return {
      userId,
      status: 'would-create',
      baselineAt: earliest.capturedAt,
      nextScheduledFor,
      sourceDocumentId: earliest.id,
    };
  }

  await prisma.$transaction(async (tx) => {
    const draw = await tx.draw.create({
      data: {
        userId,
        sequence: 1,
        status: 'completed',
        attribution: 'backfill',
        completedAt: earliest.capturedAt,
      },
      select: { id: true },
    });
    await tx.sourceDocument.update({ where: { id: earliest.id }, data: { drawId: draw.id } });
    // Schedule the next retest from the most recent panel, not the earliest.
    await scheduleNextDraw(tx, userId, latest.capturedAt);
  });

  return {
    userId,
    status: 'created',
    baselineAt: earliest.capturedAt,
    nextScheduledFor,
    sourceDocumentId: earliest.id,
  };
}
