/**
 * Magic-link token lifecycle: issue, verify, consume.
 *
 * Raw tokens are base64url(randomBytes(32)) and are only ever shown to the
 * user (in the emailed URL). The DB stores `tokenHash = sha256(secret + raw)`
 * so a DB leak does not yield usable credentials, and rotating SESSION_SECRET
 * invalidates every outstanding token.
 *
 * Rate-limiting is DB-only (no in-process cache): per-email 15-minute and
 * 24-hour windows, plus a per-IP 1-hour window. Windows are fixed buckets
 * keyed by (subjectKind, subject, windowStart) so concurrent writes collapse
 * onto a single row via upsert.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getSessionSecret } from '@/lib/env';

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export const RATE_LIMITS = {
  emailPer15Min: 3,
  emailPer24Hour: 10,
  ipPer1Hour: 20,
} as const;

const WINDOW_15M_MS = 15 * 60 * 1000;
const WINDOW_1H_MS = 60 * 60 * 1000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

export interface IssueArgs {
  email: string;
  requestIpHash: string;
}

export type IssueOutcome =
  | { outcome: 'issued'; rawToken: string; expiresAt: Date }
  | { outcome: 'rate_limited' };

export interface VerifyArgs {
  rawToken: string;
}

export type VerifyReason = 'invalid' | 'expired' | 'consumed';
export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: VerifyReason };

export function hashToken(raw: string): string {
  return createHash('sha256').update(getSessionSecret()).update(raw).digest('hex');
}

function bucketStart(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * Check all applicable rate-limit windows and, if all pass, increment each
 * one inside the same transaction. Returns `true` when the request may
 * proceed, `false` when any window is over its limit.
 */
async function checkAndIncrementRateLimits(
  prisma: PrismaClient,
  normalizedEmail: string,
  requestIpHash: string,
): Promise<boolean> {
  const now = Date.now();
  const checks = [
    {
      subjectKind: 'email-15m',
      subject: normalizedEmail,
      window: bucketStart(now, WINDOW_15M_MS),
      max: RATE_LIMITS.emailPer15Min,
    },
    {
      subjectKind: 'email-24h',
      subject: normalizedEmail,
      window: bucketStart(now, WINDOW_24H_MS),
      max: RATE_LIMITS.emailPer24Hour,
    },
    {
      subjectKind: 'ip-1h',
      subject: requestIpHash,
      window: bucketStart(now, WINDOW_1H_MS),
      max: RATE_LIMITS.ipPer1Hour,
    },
  ];

  return prisma.$transaction(async (tx) => {
    for (const c of checks) {
      const existing = await tx.magicLinkRateLimit.findUnique({
        where: {
          subjectKind_subject_window: {
            subjectKind: c.subjectKind,
            subject: c.subject,
            window: c.window,
          },
        },
      });
      if (existing && existing.count >= c.max) {
        return false;
      }
    }
    for (const c of checks) {
      await tx.magicLinkRateLimit.upsert({
        where: {
          subjectKind_subject_window: {
            subjectKind: c.subjectKind,
            subject: c.subject,
            window: c.window,
          },
        },
        create: {
          subjectKind: c.subjectKind,
          subject: c.subject,
          window: c.window,
          count: 1,
        },
        update: { count: { increment: 1 } },
      });
    }
    return true;
  });
}

export async function issueMagicLink(
  prisma: PrismaClient,
  args: IssueArgs,
): Promise<IssueOutcome> {
  const normalizedEmail = args.email.trim().toLowerCase();
  const allowed = await checkAndIncrementRateLimits(prisma, normalizedEmail, args.requestIpHash);
  if (!allowed) {
    return { outcome: 'rate_limited' };
  }

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: { email: normalizedEmail },
  });

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  await prisma.magicLinkToken.create({
    data: {
      userId: user.id,
      tokenHash,
      createdAt: now,
      expiresAt,
    },
  });
  return { outcome: 'issued', rawToken, expiresAt };
}

export async function verifyMagicLink(
  prisma: PrismaClient,
  args: VerifyArgs,
): Promise<VerifyResult> {
  const raw = args.rawToken;
  // Length/shape guard before any DB work — base64url(32B) is 43 chars.
  if (!raw || raw.length < 20) {
    return { ok: false, reason: 'invalid' };
  }
  const tokenHash = hashToken(raw);

  // Atomic consume: find-then-update inside a transaction so two concurrent
  // verifies of the same token land exactly one "consumed" outcome.
  return prisma.$transaction(async (tx) => {
    const token = await tx.magicLinkToken.findUnique({ where: { tokenHash } });
    if (!token) return { ok: false, reason: 'invalid' } as const;
    if (token.consumedAt) return { ok: false, reason: 'consumed' } as const;
    if (token.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' } as const;
    }
    await tx.magicLinkToken.update({
      where: { tokenHash },
      data: { consumedAt: new Date() },
    });
    return { ok: true, userId: token.userId } as const;
  });
}
