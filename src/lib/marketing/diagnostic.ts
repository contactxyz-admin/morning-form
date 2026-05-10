/**
 * Single-pipeline diagnostic counter helper (R12 of the SEO/GEO plan).
 *
 * Every silent-fallback or input-rejection path in the marketing tree
 * calls `incrementDiagnostic('<surface>-<failure>')`. The counter is
 * keyed `(key, day)` and uses an upsert so each emit is one DB call:
 * `INSERT … ON CONFLICT (key, day) DO UPDATE SET count = count + 1,
 * lastSeenAt = now()`. Row growth is bounded by O(N_keys × N_days),
 * which closes the unbounded write-amplifier vector that a one-row-
 * per-emit table would have on a public no-auth route.
 *
 * Naming convention: `<surface>-<failure>` in kebab-case. Examples:
 *   - visit-beacon-input-rejected
 *   - visit-beacon-rate-limit-1h
 *   - upload-magic-byte-rejected (Phase 1)
 *   - stripe-webhook-unmatched (Phase 1)
 */
import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Compute the day bucket for a given timestamp. Uses UTC date so the
 * counters group cleanly across timezones. Returns a Date pinned to
 * 00:00:00.000 UTC so the @db.Date column matches.
 */
function dayBucket(now: Date): Date {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return utc;
}

/**
 * Idempotent counter increment. Safe to call from any request handler
 * — the upsert collapses concurrent writes onto a single row via the
 * (key, day) unique constraint.
 */
export async function incrementDiagnostic(
  key: string,
  options: { db?: Db; at?: Date } = {},
): Promise<void> {
  const db = options.db ?? prisma;
  const at = options.at ?? new Date();
  const day = dayBucket(at);

  await db.diagnosticEvent.upsert({
    where: { key_day: { key, day } },
    create: { key, day, count: 1, lastSeenAt: at },
    update: { count: { increment: 1 }, lastSeenAt: at },
  });
}

export const __forTesting = { dayBucket };
