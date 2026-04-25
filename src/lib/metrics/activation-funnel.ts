/**
 * Activation-funnel stage registry — see
 * docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md.
 *
 * Six fixed stages, each derivable from an existing table. Stage resolvers
 * are pure async functions that take a cohort's userIds + a window and
 * return Map<userId, firstReachedAt>. No event table, no analytics
 * pipeline — single source of truth for the funnel lives here so the query,
 * the CLI, and any future admin surface cannot drift (plan R7).
 */

import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

export type StageKey =
  | 'signup'
  | 'essentials'
  | 'connected'
  | 'first-chat'
  | 'grounded-answer'
  | 'retained-7d';

export interface StageWindow {
  /** Inclusive upper bound — signals after this time do not count. */
  until: Date;
  /** Retention window in days. Default 7; only used by retained-7d. */
  retentionWindowDays?: number;
}

/**
 * Map of userId → first-reached-at timestamp. Users who did not reach the
 * stage are absent (not set to null) so Map#has is the primary predicate.
 */
export type StageReachMap = Map<string, Date>;

export interface StageContext {
  db: Db;
  /** Cohort user ids. Always scoped — upstream resolves the cohort first. */
  userIds: string[];
  window: StageWindow;
  /**
   * The prior stage's reach-map. Most stages ignore this; retained-7d needs
   * the grounded-answer map as its anchor point. Keeping it in the context
   * signature (rather than a per-stage ad-hoc arg) means the pipeline stays
   * uniform and a future cross-stage dependency doesn't need a refactor.
   */
  previous: StageReachMap;
}

export interface StageDefinition {
  readonly key: StageKey;
  readonly label: string;
  resolve(ctx: StageContext): Promise<StageReachMap>;
}

export const DEFAULT_RETENTION_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Retention lower bound: activity must be at least 24h after grounded answer. */
const RETENTION_MIN_OFFSET_MS = DAY_MS;

const signupStage: StageDefinition = {
  key: 'signup',
  label: 'Signup',
  async resolve({ db, userIds, window }) {
    if (userIds.length === 0) return new Map();
    const rows = await db.user.findMany({
      where: { id: { in: userIds }, createdAt: { lte: window.until } },
      select: { id: true, createdAt: true },
    });
    const map: StageReachMap = new Map();
    for (const row of rows) map.set(row.id, row.createdAt);
    return map;
  },
};

const essentialsStage: StageDefinition = {
  key: 'essentials',
  label: 'Essentials complete',
  async resolve({ db, userIds, window }) {
    if (userIds.length === 0) return new Map();
    const rows = await db.assessmentResponse.findMany({
      where: { userId: { in: userIds }, completedAt: { lte: window.until } },
      select: { userId: true, completedAt: true },
    });
    const map: StageReachMap = new Map();
    for (const row of rows) map.set(row.userId, row.completedAt);
    return map;
  },
};

const connectedStage: StageDefinition = {
  key: 'connected',
  label: 'Data source connected',
  async resolve({ db, userIds, window }) {
    if (userIds.length === 0) return new Map();
    const [connections, documents] = await Promise.all([
      db.healthConnection.findMany({
        where: { userId: { in: userIds }, createdAt: { lte: window.until } },
        select: { userId: true, createdAt: true },
      }),
      db.sourceDocument.findMany({
        where: { userId: { in: userIds }, capturedAt: { lte: window.until } },
        select: { userId: true, capturedAt: true },
      }),
    ]);
    const map: StageReachMap = new Map();
    for (const row of connections) {
      const existing = map.get(row.userId);
      if (!existing || row.createdAt < existing) map.set(row.userId, row.createdAt);
    }
    for (const row of documents) {
      const existing = map.get(row.userId);
      if (!existing || row.capturedAt < existing) map.set(row.userId, row.capturedAt);
    }
    return map;
  },
};

const firstChatStage: StageDefinition = {
  key: 'first-chat',
  label: 'First chat message',
  async resolve({ db, userIds, window }) {
    if (userIds.length === 0) return new Map();
    const rows = await db.chatMessage.findMany({
      where: {
        userId: { in: userIds },
        role: 'user',
        createdAt: { lte: window.until },
      },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const map: StageReachMap = new Map();
    for (const row of rows) {
      if (!map.has(row.userId)) map.set(row.userId, row.createdAt);
    }
    return map;
  },
};

const groundedAnswerStage: StageDefinition = {
  key: 'grounded-answer',
  label: 'First grounded answer',
  async resolve({ db, userIds, window }) {
    if (userIds.length === 0) return new Map();
    const rows = await db.scribeAudit.findMany({
      where: {
        userId: { in: userIds },
        safetyClassification: 'clinical-safe',
        createdAt: { lte: window.until },
      },
      select: { userId: true, createdAt: true, citations: true },
      orderBy: { createdAt: 'asc' },
    });
    const map: StageReachMap = new Map();
    for (const row of rows) {
      if (!hasAtLeastOneCitation(row.citations)) continue;
      if (!map.has(row.userId)) map.set(row.userId, row.createdAt);
    }
    return map;
  },
};

/**
 * Matches the B2 grounding-rate definition: a clinical-safe answer qualifies
 * as grounded iff its persisted citations JSON parses to a non-empty array.
 * Malformed JSON is treated as not-grounded (conservative) rather than
 * throwing, so a single bad row can't abort a cohort report.
 */
function hasAtLeastOneCitation(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

const retained7dStage: StageDefinition = {
  key: 'retained-7d',
  label: 'Retained (activity ≥24h within 7 days)',
  async resolve({ db, window, previous }) {
    if (previous.size === 0) return new Map();
    const windowDays = window.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;
    const anchorUserIds = Array.from(previous.keys());

    // Pull candidate activity once per table, then bucket in memory. For a
    // diagnostic tool running on tens-to-hundreds of cohort users this is
    // cheap and avoids a per-user round-trip. `window.until` caps the upper
    // bound to prevent future-data leakage into historical cohorts.
    const [chats, points] = await Promise.all([
      db.chatMessage.findMany({
        where: { userId: { in: anchorUserIds }, createdAt: { lte: window.until } },
        select: { userId: true, createdAt: true },
      }),
      db.healthDataPoint.findMany({
        where: { userId: { in: anchorUserIds }, createdAt: { lte: window.until } },
        select: { userId: true, createdAt: true },
      }),
    ]);

    const byUser = new Map<string, Date[]>();
    for (const row of chats) appendActivity(byUser, row.userId, row.createdAt);
    for (const row of points) appendActivity(byUser, row.userId, row.createdAt);

    const map: StageReachMap = new Map();
    previous.forEach((groundedAt, userId) => {
      const lowerBound = groundedAt.getTime() + RETENTION_MIN_OFFSET_MS;
      const upperBound = groundedAt.getTime() + windowDays * DAY_MS;
      const activities = byUser.get(userId);
      if (!activities || activities.length === 0) return;
      let earliest: Date | undefined;
      for (const at of activities) {
        const t = at.getTime();
        if (t < lowerBound || t > upperBound) continue;
        if (!earliest || at < earliest) earliest = at;
      }
      if (earliest) map.set(userId, earliest);
    });
    return map;
  },
};

function appendActivity(
  byUser: Map<string, Date[]>,
  userId: string,
  at: Date,
): void {
  const existing = byUser.get(userId);
  if (existing) existing.push(at);
  else byUser.set(userId, [at]);
}

export const ACTIVATION_STAGES: readonly StageDefinition[] = [
  signupStage,
  essentialsStage,
  connectedStage,
  firstChatStage,
  groundedAnswerStage,
  retained7dStage,
];

export { hasAtLeastOneCitation };
