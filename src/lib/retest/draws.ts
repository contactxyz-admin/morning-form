/**
 * Draw lifecycle writes for the retest loop (Plan 2026-06-17-001 U2).
 *
 * A Draw is the loop's heartbeat — one row per blood-draw / lab-panel event per
 * user. This module owns the two write paths the loop turns on:
 *
 *   - completeDrawForSourceDocument: a lab panel has been ingested → record the
 *     draw (with same-visit dedup), assign its completed-ordinal `sequence`,
 *     compute `attribution` (was this return caused by a nudge?), and schedule
 *     the next retest.
 *   - scheduleNextDraw: maintain exactly one open `scheduled` draw per user,
 *     dated `RETEST_CADENCE_DAYS` after the completion that triggered it.
 *
 * Completion is manual-first and panel-driven: the honest signal that a draw
 * happened is that its results entered the record, not that a concierge code
 * was delivered. Callers invoke this AFTER the ingest transaction has committed
 * (post-commit, non-fatal — a draw failure must never fail the upload).
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import {
  DRAW_DEDUP_WINDOW_DAYS,
  MS_PER_DAY,
  RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS,
  addDays,
  nextRetestDate,
} from './constants';

/** How a completed draw came about — drives nudge-attributed (loop-caused) retention. */
export type DrawAttribution = 'baseline' | 'nudge' | 'organic' | 'ops' | 'clinician' | 'backfill';

export interface CompleteDrawResult {
  drawId: string;
  /** True when the panel attached to an existing draw (same-visit dedup) rather than completing a new one. */
  deduped: boolean;
  /** Present only when a draw completed (not deduped). */
  sequence?: number;
  attribution?: DrawAttribution;
}

interface OpenScheduledDraw {
  nudgeCount: number;
  lastNudgedAt: Date | null;
}

/**
 * Decide a completed draw's attribution. Draw #1 is the baseline. A later draw
 * is `nudge`-attributed only when the scheduled draw it fulfils had been nudged
 * AND the draw completed within the attribution window of that nudge (a draw
 * collected *before* the nudge, or long after, is not loop-caused). Everything
 * else is `organic`. (`ops`/`clinician`/`backfill` are set by other paths.)
 */
export function computeAttribution(
  sequence: number,
  target: OpenScheduledDraw | null,
  completedAt: Date,
): DrawAttribution {
  if (sequence === 1) return 'baseline';
  if (target && target.nudgeCount > 0 && target.lastNudgedAt) {
    const days = (completedAt.getTime() - target.lastNudgedAt.getTime()) / MS_PER_DAY;
    if (days >= 0 && days <= RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS) return 'nudge';
  }
  return 'organic';
}

function isUniqueSequenceConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  // Only retry on the [userId, sequence] conflict — not some unrelated unique
  // violation, which retrying would merely spin on and then rethrow.
  return JSON.stringify(err.meta?.target ?? '').includes('sequence');
}

/**
 * Record the draw that a freshly-ingested lab panel represents.
 *
 * 1. Same-visit dedup: if a completed draw already sits within
 *    DRAW_DEDUP_WINDOW_DAYS of this panel's date, attach the panel to it and
 *    return (one clinic visit, possibly several PDFs, is one draw).
 * 2. Otherwise complete the user's open scheduled draw (the retest they were
 *    due for), or create a fresh completed draw if none is open; assign the next
 *    per-user `sequence`, compute attribution, link the panel, and schedule the
 *    next retest.
 *
 * `drawAt` is the panel's collection date (the clinical date of the draw).
 * Runs in an interactive transaction; retries on the [userId, sequence] unique
 * conflict that a concurrent ingest could provoke.
 */
export async function completeDrawForSourceDocument(
  prisma: PrismaClient,
  userId: string,
  sourceDocumentId: string,
  drawAt: Date,
): Promise<CompleteDrawResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => completeInTx(tx, userId, sourceDocumentId, drawAt));
    } catch (err) {
      // A concurrent ingest may have taken the sequence we computed — recompute
      // and retry a bounded number of times before surfacing the error.
      if (isUniqueSequenceConflict(err) && attempt < 2) continue;
      throw err;
    }
  }
}

async function completeInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceDocumentId: string,
  drawAt: Date,
): Promise<CompleteDrawResult> {
  // Serialize per-user draw writes for the rest of this transaction. Without
  // this, two concurrent same-visit ingests under READ COMMITTED both miss the
  // dedup read (neither sees the other's uncommitted draw) and create two draws
  // for one visit; likewise two completions could leave two open scheduled
  // draws. The advisory lock is transaction-scoped (auto-released on commit/
  // rollback) and keyed on the userId hash, so it only serializes same-user work.
  // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns `void`, which
  // $queryRaw cannot deserialize; $executeRaw runs it without mapping columns.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

  // 1. Same-visit dedup.
  const recentCompleted = await tx.draw.findFirst({
    where: {
      userId,
      status: 'completed',
      completedAt: {
        gte: addDays(drawAt, -DRAW_DEDUP_WINDOW_DAYS),
        lte: addDays(drawAt, DRAW_DEDUP_WINDOW_DAYS),
      },
    },
    orderBy: { completedAt: 'desc' },
  });
  if (recentCompleted) {
    await tx.sourceDocument.update({
      where: { id: sourceDocumentId },
      data: { drawId: recentCompleted.id },
    });
    return { drawId: recentCompleted.id, deduped: true };
  }

  // 2. Complete the open scheduled draw (the due retest), or create a fresh one.
  const target = await tx.draw.findFirst({
    where: { userId, status: 'scheduled' },
    orderBy: { createdAt: 'asc' },
  });

  const last = await tx.draw.findFirst({
    where: { userId, status: 'completed', sequence: { not: null } },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;
  const attribution = computeAttribution(sequence, target, drawAt);

  let drawId: string;
  if (target) {
    const updated = await tx.draw.update({
      where: { id: target.id },
      data: { status: 'completed', completedAt: drawAt, sequence, attribution },
      select: { id: true },
    });
    drawId = updated.id;
  } else {
    const created = await tx.draw.create({
      data: { userId, status: 'completed', completedAt: drawAt, sequence, attribution },
      select: { id: true },
    });
    drawId = created.id;
  }

  await tx.sourceDocument.update({ where: { id: sourceDocumentId }, data: { drawId } });
  await scheduleNextDraw(tx, userId, drawAt);

  return { drawId, deduped: false, sequence, attribution };
}

/**
 * Maintain exactly one open `scheduled` draw per user, dated one cadence after
 * the completion that triggered it. Reuses any existing open scheduled draw
 * (resetting its nudge bookkeeping for the new cycle) rather than accumulating
 * duplicates.
 */
export async function scheduleNextDraw(
  tx: Prisma.TransactionClient,
  userId: string,
  fromCompletedAt: Date,
): Promise<void> {
  const scheduledFor = nextRetestDate(fromCompletedAt);
  const open = await tx.draw.findFirst({ where: { userId, status: 'scheduled' }, select: { id: true } });
  if (open) {
    await tx.draw.update({
      where: { id: open.id },
      data: { scheduledFor, nudgeCount: 0, lastNudgedAt: null },
    });
  } else {
    await tx.draw.create({ data: { userId, status: 'scheduled', scheduledFor } });
  }
}
