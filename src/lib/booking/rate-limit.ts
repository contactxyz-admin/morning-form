/**
 * Per-user fixed-window rate limit for concierge booking requests
 * (Plan 2026-06-06-001 U3, review SEC-006).
 *
 * Mirrors the magic-link limiter (src/lib/auth/magic-link.ts): a DB-only
 * fixed-window bucket keyed by (subjectKind, subject, windowStart) so
 * concurrent writes collapse onto one row via upsert. Reuses the existing
 * MagicLinkRateLimit table with a distinct `booking-24h` subjectKind and the
 * userId as subject (NOT a plaintext email — booking buckets carry no PII and
 * are swept by the userId Cascade on account erasure path via the table's
 * email-subject scrub, but these are userId-keyed so they're informational
 * only).
 *
 * Semantics match the magic-link limiter: the check and the increment happen
 * together, and a FAILED downstream request (e.g. ops-email failure rolling the
 * row back) does NOT refund the slot — but a request that never passed the
 * limit never consumed one (we only increment when under the limit).
 */
import type { PrismaClient } from '@prisma/client';

export const BOOKING_RATE_LIMIT = {
  /** Max booking requests per user per 24h window. */
  perUserPer24Hour: 5,
} as const;

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
export const BOOKING_RATE_LIMIT_SUBJECT_KIND = 'booking-24h';

function bucketStart(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * Returns `true` when the request may proceed (and atomically increments the
 * window counter), `false` when the user is over the limit (no increment).
 */
export async function checkAndConsumeBookingRateLimit(
  prisma: PrismaClient,
  userId: string,
): Promise<boolean> {
  return checkAndConsumeFixedWindow(
    prisma,
    BOOKING_RATE_LIMIT_SUBJECT_KIND,
    userId,
    BOOKING_RATE_LIMIT.perUserPer24Hour,
  );
}

export const PILOT_BOOKING_RATE_LIMIT = {
  /**
   * Max slot book attempts per user per 24h window. Legit use is one book
   * plus the odd cancel/rebook; each accepted book writes a ConsentRecord +
   * FunnelEvent and sends a confirmation email, so a scripted
   * book→cancel→rebook loop is unbounded storage + email spend without this.
   */
  perUserPer24Hour: 10,
} as const;
export const PILOT_BOOKING_RATE_LIMIT_SUBJECT_KIND = 'pilot-booking-24h';

export async function checkAndConsumePilotBookingRateLimit(
  prisma: PrismaClient,
  userId: string,
): Promise<boolean> {
  return checkAndConsumeFixedWindow(
    prisma,
    PILOT_BOOKING_RATE_LIMIT_SUBJECT_KIND,
    userId,
    PILOT_BOOKING_RATE_LIMIT.perUserPer24Hour,
  );
}

async function checkAndConsumeFixedWindow(
  prisma: PrismaClient,
  subjectKind: string,
  subject: string,
  limit: number,
): Promise<boolean> {
  const window = bucketStart(Date.now(), WINDOW_24H_MS);
  const key = { subjectKind_subject_window: { subjectKind, subject, window } };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.magicLinkRateLimit.findUnique({ where: key });
    if (existing && existing.count >= limit) {
      return false;
    }
    await tx.magicLinkRateLimit.upsert({
      where: key,
      create: { subjectKind, subject, window, count: 1 },
      update: { count: { increment: 1 } },
    });
    return true;
  });
}

/**
 * Refund a previously-consumed slot when the downstream request failed in a way
 * that should not count against the user (e.g. the ops email could not be sent
 * and the row was rolled back). Best-effort: never throws.
 */
export async function refundBookingRateLimit(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const window = bucketStart(Date.now(), WINDOW_24H_MS);
  try {
    await prisma.magicLinkRateLimit.updateMany({
      where: {
        subjectKind: BOOKING_RATE_LIMIT_SUBJECT_KIND,
        subject: userId,
        window,
        count: { gt: 0 },
      },
      data: { count: { decrement: 1 } },
    });
  } catch {
    // best-effort
  }
}
