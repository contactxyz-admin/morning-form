import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getSessionSecret, env } from '@/lib/env';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Signed session cookie backed by the Session table.
 *
 * Cookie value = raw session token (base64url(32B)). DB stores
 * `tokenHash = sha256(SESSION_SECRET + rawToken)` — rotating SESSION_SECRET
 * invalidates every live session. No demo-user fallback on ingestion paths:
 * unauthenticated callers get `null` from `getCurrentUser()`.
 */

export { SESSION_COOKIE };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TTL_BUMP_RATE_LIMIT_MS = 5 * 60 * 1000;

export interface CreateSessionMeta {
  userAgent?: string | null;
  ipHash?: string | null;
}

export function hashSessionToken(raw: string): string {
  return createHash('sha256').update(getSessionSecret()).update(raw).digest('hex');
}

/**
 * Mint a fresh session: creates a Session row, sets the httpOnly cookie, and
 * returns the raw token (for callers that need it to build a verify-page URL).
 */
export async function createSession(userId: string, meta: CreateSessionMeta = {}): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipHash: meta.ipHash ?? null,
    },
  });

  cookies().set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
  return { rawToken };
}

/**
 * Read the session cookie, validate the row (not revoked, not expired), and
 * return the user with the relations callers actually need. Returns `null`
 * on any failure — no demo fallback. Lazily bumps `lastSeenAt` + `expiresAt`
 * on each call, rate-limited to once per 5 minutes so we don't churn writes.
 */
export async function getCurrentUser() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const tokenHash = hashSessionToken(raw);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { assessment: true, stateProfile: true },
      },
    },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;

  // Rolling TTL: bump lastSeenAt + expiresAt at most once per 5 min.
  if (now - session.lastSeenAt.getTime() > TTL_BUMP_RATE_LIMIT_MS) {
    const newExpiresAt = new Date(now + SESSION_TTL_MS);
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: newExpiresAt },
      })
      .catch(() => {});
    cookies().set(SESSION_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      expires: newExpiresAt,
    });
  }
  return session.user;
}

/**
 * Revoke the current session server-side and clear the cookie client-side.
 * Safe to call when no session is present.
 */
export async function destroyCurrentSession(): Promise<void> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) {
    const tokenHash = hashSessionToken(raw);
    await prisma.session
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});
  }
  cookies().delete(SESSION_COOKIE);
}
