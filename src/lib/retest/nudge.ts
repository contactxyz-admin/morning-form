/**
 * Retest nudge sequence (Plan 2026-06-17-001 U3).
 *
 * For a quarterly cadence the follow-up sequence — not a single send — is the
 * conversion lever. This module drives a capped sequence of nudges per open
 * scheduled draw (offsets `RETEST_NUDGE_OFFSETS_DAYS` after `scheduledFor`),
 * then lapses a draw that is still un-rebooked after the final offset + grace.
 *
 * `decideNudgeAction` is the pure, unit-testable core; `runRetestNudges` is the
 * batch the cron route invokes. Both are idempotent across same-day re-runs:
 * the next offset is days away, so a second run on the same day decides `skip`.
 */

import type { PrismaClient } from '@prisma/client';
import {
  RETEST_LAPSE_GRACE_DAYS,
  RETEST_NUDGE_MIN_GAP_DAYS,
  RETEST_NUDGE_OFFSETS_DAYS,
  addDays,
} from './constants';

export type NudgeDecision =
  | { kind: 'send'; offsetIndex: number; dueAt: Date }
  | { kind: 'lapse' }
  | { kind: 'skip' };

interface NudgeableDraw {
  scheduledFor: Date | null;
  /** Number of nudges already sent (0 = none yet). */
  nudgeCount: number;
  /** When the last nudge was sent (null = none yet). */
  lastNudgedAt: Date | null;
}

/**
 * Decide the single action due for a scheduled draw at `now`:
 *   - `send` the next nudge when its offset (`scheduledFor + offsets[nudgeCount]`)
 *     has arrived and the sequence isn't exhausted;
 *   - `lapse` once all nudges are sent and the grace window has also passed;
 *   - `skip` otherwise (not yet due, or waiting out the grace).
 * At most one nudge per call, so a daily cron advances the sequence one step at
 * a time and same-day re-runs are inert.
 */
export function decideNudgeAction(draw: NudgeableDraw, now: Date): NudgeDecision {
  if (!draw.scheduledFor) return { kind: 'skip' };
  const offsets = RETEST_NUDGE_OFFSETS_DAYS;
  const sent = draw.nudgeCount;

  if (sent >= offsets.length) {
    const lastOffset = offsets[offsets.length - 1];
    const lapseAt = addDays(draw.scheduledFor, lastOffset + RETEST_LAPSE_GRACE_DAYS);
    return now.getTime() >= lapseAt.getTime() ? { kind: 'lapse' } : { kind: 'skip' };
  }

  const dueAt = addDays(draw.scheduledFor, offsets[sent]);
  if (now.getTime() < dueAt.getTime()) return { kind: 'skip' };
  // Preserve spacing after a cron outage: if several offsets came due at once,
  // never send within the minimum gap of the previous nudge — the next run
  // catches up one step at a time instead of bursting the whole sequence.
  if (
    draw.lastNudgedAt &&
    now.getTime() < addDays(draw.lastNudgedAt, RETEST_NUDGE_MIN_GAP_DAYS).getTime()
  ) {
    return { kind: 'skip' };
  }
  return { kind: 'send', offsetIndex: sent, dueAt };
}

export interface NudgeRecipient {
  userId: string;
  email: string;
  name: string | null;
}

/** Injected sender — the route wires the real email; tests pass a spy. */
export type NudgeSender = (input: {
  recipient: NudgeRecipient;
  drawId: string;
  offsetIndex: number;
}) => Promise<void>;

export interface NudgeRunSummary {
  considered: number;
  sent: number;
  lapsed: number;
  skipped: number;
  optedOut: number;
  errors: number;
}

export interface RunRetestNudgesOptions {
  /** Defaults to the current time. */
  now?: Date;
  /** Restrict to specific users (tests / targeted re-runs). Omit = all users. */
  userIds?: string[];
}

/**
 * Process every due open scheduled draw: send the next nudge or lapse it.
 *
 * Opt-out: a user with an explicit `notifyRetest = false` is skipped; a user
 * with no preferences row is opted-in by default.
 *
 * Send-then-record: bookkeeping (`nudgeCount`/`lastNudgedAt`) advances only
 * after a believed-successful send, so `lastNudgedAt` stays honest for
 * attribution and a failed send is retried (not silently consumed). Per-draw
 * errors are caught so one bad row never aborts the batch.
 */
export async function runRetestNudges(
  prisma: PrismaClient,
  send: NudgeSender,
  options: RunRetestNudgesOptions = {},
): Promise<NudgeRunSummary> {
  const now = options.now ?? new Date();
  const due = await prisma.draw.findMany({
    where: {
      status: 'scheduled',
      scheduledFor: { lte: now },
      ...(options.userIds ? { userId: { in: options.userIds } } : {}),
    },
    select: {
      id: true,
      scheduledFor: true,
      nudgeCount: true,
      lastNudgedAt: true,
      user: {
        select: { id: true, email: true, name: true, preferences: { select: { notifyRetest: true } } },
      },
    },
  });

  const summary: NudgeRunSummary = {
    considered: due.length,
    sent: 0,
    lapsed: 0,
    skipped: 0,
    optedOut: 0,
    errors: 0,
  };

  for (const draw of due) {
    // Explicit opt-out only — a missing preferences row means opted-in.
    if (draw.user.preferences && draw.user.preferences.notifyRetest === false) {
      summary.optedOut++;
      continue;
    }

    const decision = decideNudgeAction(draw, now);
    try {
      if (decision.kind === 'send') {
        await send({
          recipient: { userId: draw.user.id, email: draw.user.email, name: draw.user.name },
          drawId: draw.id,
          offsetIndex: decision.offsetIndex,
        });
        await prisma.draw.update({
          where: { id: draw.id },
          data: { nudgeCount: decision.offsetIndex + 1, lastNudgedAt: now },
        });
        summary.sent++;
      } else if (decision.kind === 'lapse') {
        await prisma.draw.update({
          where: { id: draw.id },
          data: { status: 'lapsed', lapsedAt: now },
        });
        summary.lapsed++;
      } else {
        summary.skipped++;
      }
    } catch (err) {
      summary.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[retest-nudge] draw ${draw.id} failed (non-fatal): ${msg}`);
    }
  }

  return summary;
}
