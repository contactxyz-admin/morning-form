import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { hashIp } from '@/lib/auth/ip-hash';
import { eraseAccount, hashDeletionEmail } from '@/lib/account/delete';
import { hashDeletionToken } from '../request/route';

/**
 * POST /api/account/delete/confirm — step 2 of the dual-factor deletion flow
 * (plan Unit 6). POST-only: GET never reaches here (the email link lands on the
 * side-effect-free /account/delete/confirm page, which POSTs here on the user's
 * explicit click).
 *
 * Requires BOTH an active session (getCurrentUser) AND the single-use token.
 * Atomic single-use consume mirrors verifyMagicLink's
 * `updateMany(... consumedAt: null, expiresAt > now)` so a raced double-POST
 * fires erasure exactly once. Confused-deputy guard: the token's userId must
 * match the session user's id (403 otherwise) — user A's token in user B's
 * session must not erase B. Idempotent: a completed tombstone for this email is
 * a no-op success. On success, clears the mf_session cookie (the Session row is
 * already gone via cascade) and returns a goodbye payload.
 *
 * maxDuration mirrors the deletion transaction's generous timeout (repo
 * precedent 300; src/app/api/account/export/route.ts).
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const rawToken = json && typeof json === 'object' ? (json as { token?: unknown }).token : undefined;
  if (typeof rawToken !== 'string' || rawToken.length < 20) {
    return NextResponse.json({ error: 'Invalid or missing confirmation token.' }, { status: 400 });
  }

  const tokenHash = hashDeletionToken(rawToken);
  const now = new Date();

  // Atomic single-use consume gated on (not consumed, not expired). The DB
  // decides the winner under concurrent POSTs — exactly one gets count === 1.
  const consumed = await prisma.accountDeletionToken.updateMany({
    where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) {
    // Idempotency: an already-completed tombstone for this user is a no-op
    // success even though the token is consumed/expired (double-click / retry).
    const completed = await prisma.accountDeletionTombstone.findFirst({
      where: { emailHash: hashDeletionEmail(user.email), status: 'completed' },
      select: { id: true },
    });
    if (completed) {
      const res = NextResponse.json({ ok: true, status: 'already-deleted' });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.json(
      { error: 'This confirmation link is invalid, expired, or already used.' },
      { status: 400 },
    );
  }

  // Confused-deputy guard: the consumed token must belong to the session user.
  const token = await prisma.accountDeletionToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  if (!token || token.userId !== user.id) {
    return NextResponse.json({ error: 'This confirmation does not match your account.' }, { status: 403 });
  }

  // Execute erasure. eraseAccount itself is idempotent (completed tombstone →
  // noop) and blob-first / retry-safe.
  await eraseAccount(prisma, user.id, { ipHash: hashIp(request) });

  // The Session row is gone via cascade; clear the now-dangling cookie. Do NOT
  // run any getCurrentUser()-dependent work after this point.
  const res = NextResponse.json({ ok: true, status: 'deleted' });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
