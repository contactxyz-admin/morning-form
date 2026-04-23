/**
 * Activation-funnel cohort report — see
 * docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md.
 *
 * Aggregates the per-stage reach-maps from `activation-funnel.ts` into a
 * single report: counts, drop-off percentages, and time-to-stage percentiles.
 * Structured output only — the CLI formats; this module does not.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import {
  ACTIVATION_STAGES,
  DEFAULT_RETENTION_WINDOW_DAYS,
  type StageKey,
  type StageReachMap,
} from './activation-funnel';

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComputeActivationFunnelArgs {
  /**
   * Explicit cohort user ids. When omitted, the cohort is every User whose
   * `createdAt` falls in `[signupSince, signupUntil]`.
   */
  userIds?: string[];
  signupSince: Date;
  signupUntil: Date;
  /** Retention window in days. Defaults to 7 (plan D4). */
  retentionWindowDays?: number;
  /** Inject a Prisma client (defaults to the shared singleton). */
  prisma?: Db;
}

export interface StageReport {
  key: StageKey;
  label: string;
  /** Users who reached this stage. */
  count: number;
  /** Percent of signups (0–100). */
  pctOfSignups: number;
  /** Percent of previous stage's count (0–100). Equal to pctOfSignups at signup. */
  pctOfPrevious: number;
  /**
   * Median days from signup to reaching this stage, for users who reached it.
   * `null` when count === 0 or the stage-at-signup case where every delta is 0
   * — in which case it is reported as 0, not null. `null` strictly means
   * "not enough data to compute".
   */
  medianDaysFromSignup: number | null;
  p75DaysFromSignup: number | null;
}

export interface ActivationFunnelReport {
  cohort: {
    size: number;
    signupSince: Date;
    signupUntil: Date;
    userIds: string[];
    retentionWindowDays: number;
  };
  stages: StageReport[];
}

export class InvalidCohortWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCohortWindowError';
  }
}

export async function computeActivationFunnel(
  args: ComputeActivationFunnelArgs,
): Promise<ActivationFunnelReport> {
  if (args.signupSince.getTime() > args.signupUntil.getTime()) {
    throw new InvalidCohortWindowError(
      `signupSince (${args.signupSince.toISOString()}) must be <= signupUntil (${args.signupUntil.toISOString()})`,
    );
  }

  const db = args.prisma ?? defaultPrisma;
  const retentionWindowDays = args.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;

  const cohort = await resolveCohort(db, args);
  const cohortUserIds = cohort.map((u) => u.id);
  const signupAtByUser = new Map<string, Date>(cohort.map((u) => [u.id, u.createdAt]));

  const stageMaps: Record<StageKey, StageReachMap> = {
    'signup': new Map(),
    'essentials': new Map(),
    'connected': new Map(),
    'first-chat': new Map(),
    'grounded-answer': new Map(),
    'retained-7d': new Map(),
  };

  let previousMap: StageReachMap = new Map();
  for (const stage of ACTIVATION_STAGES) {
    const resolved = await stage.resolve({
      db,
      userIds: cohortUserIds,
      window: { until: args.signupUntil, retentionWindowDays },
      previous: previousMap,
    });
    stageMaps[stage.key] = resolved;
    previousMap = resolved;
  }

  const signupCount = stageMaps.signup.size;
  const stages: StageReport[] = [];
  let previousCount = signupCount;

  for (const stage of ACTIVATION_STAGES) {
    const reachMap = stageMaps[stage.key];
    const count = reachMap.size;
    const pctOfSignups = signupCount === 0 ? 0 : round1((count / signupCount) * 100);
    const pctOfPrevious =
      previousCount === 0 ? 0 : round1((count / previousCount) * 100);

    const deltas = deltasInDays(reachMap, signupAtByUser);
    const medianDaysFromSignup = deltas.length === 0 ? null : round2(percentile(deltas, 0.5));
    const p75DaysFromSignup = deltas.length === 0 ? null : round2(percentile(deltas, 0.75));

    stages.push({
      key: stage.key,
      label: stage.label,
      count,
      pctOfSignups,
      pctOfPrevious,
      medianDaysFromSignup,
      p75DaysFromSignup,
    });

    previousCount = count;
  }

  return {
    cohort: {
      size: signupCount,
      signupSince: args.signupSince,
      signupUntil: args.signupUntil,
      userIds: cohortUserIds,
      retentionWindowDays,
    },
    stages,
  };
}

async function resolveCohort(
  db: Db,
  args: ComputeActivationFunnelArgs,
): Promise<Array<{ id: string; createdAt: Date }>> {
  if (args.userIds && args.userIds.length > 0) {
    const rows = await db.user.findMany({
      where: {
        id: { in: args.userIds },
        createdAt: { gte: args.signupSince, lte: args.signupUntil },
      },
      select: { id: true, createdAt: true },
    });
    return rows;
  }
  if (args.userIds && args.userIds.length === 0) {
    // Caller explicitly requested an empty cohort; return empty rather than
    // falling through to the date-window query (that would silently widen).
    return [];
  }
  return db.user.findMany({
    where: { createdAt: { gte: args.signupSince, lte: args.signupUntil } },
    select: { id: true, createdAt: true },
  });
}

function deltasInDays(
  reachMap: StageReachMap,
  signupAtByUser: Map<string, Date>,
): number[] {
  const out: number[] = [];
  reachMap.forEach((reachedAt, userId) => {
    const signupAt = signupAtByUser.get(userId);
    if (!signupAt) return; // stage reach for a user not in the signup cohort — skip
    out.push((reachedAt.getTime() - signupAt.getTime()) / DAY_MS);
  });
  return out;
}

/**
 * Simple sorted-midpoint percentile. For p=0.5 and even-sized input, returns
 * the mean of the two middle values. For odd-sized input, returns the middle
 * value. Good enough for a diagnostic read; no stats library needed.
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile called on empty array');
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const weight = rank - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
