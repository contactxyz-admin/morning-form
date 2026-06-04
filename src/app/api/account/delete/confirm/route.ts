import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { hashIp } from '@/lib/auth/ip-hash';
import { eraseAccount, hashDeletionEmail, hashDeletionToken } from '@/lib/account/delete';

/**
 * POST /api/account/delete/confirm — step 2 of the dual-factor deletion flow
 * (plan Unit 6). POST-only: GET never reaches here (the email link lands on the
 * side-effect-free /account/delete/confirm page, which POSTs here on the user's
 * explicit click).
 *
 * Requires BOTH an active session (getCurrentUser) AND the single-use token.
 * The atomic single-use consume is ownership-bound — `updateMany(... userId:
 * session.user.id, consumedAt: null, expiresAt > now)` — so a raced double-POST
 * fires erasure exactly once AND user A's token can never be consumed inside
 * user B's session (confused-deputy guard folded into the same statement, so a
 * failed match leaves the real owner's token un-consumed). On a count-0 miss a
 * read-only lookup classifies the response: a token owned by a different user →
 * 403; otherwise → 400 (or 200 no-op when a completed tombstone already exists).
 * If eraseAccount throws, the token's consumedAt is reset to null so the same
 * emailed link is retryable and the caller gets a 503. On success, clears the
 * mf_session cookie (the Session row is already gone via cascade) and returns a
 * goodbye payload.
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

  // Atomic single-use consume gated on (belongs to this user, not consumed, not
  // expired). Binding the consume to `userId: user.id` is the confused-deputy
  // guard AND the single-use winner-selection in one statement: user A's token
  // can never be consumed inside user B's session, so a failed match (count 0)
  // leaves the real owner's token untouched (consumedAt still null). The DB
  // decides the winner under concurrent POSTs — exactly one gets count === 1.
  const consumed = await prisma.accountDeletionToken.updateMany({
    where: { tokenHash, userId: user.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  if (consumed.count === 0) {
    // Classify the miss with a read-only lookup (no mutation). A token that
    // exists but belongs to a different user is a confused-deputy attempt →
    // 403, and crucially the owner's token was NOT consumed above.
    const existing = await prisma.accountDeletionToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json(
        { error: 'This confirmation does not match your account.' },
        { status: 403 },
      );
    }

    // Otherwise the token is missing, expired, or already consumed for THIS
    // user. Idempotency: an already-completed tombstone for this user is a
    // no-op success (double-click / retry of a finished erasure).
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

  // Execute erasure. eraseAccount itself is idempotent (completed tombstone →
  // noop) and blob-first / retry-safe.
  try {
    await eraseAccount(prisma, user.id, { ipHash: hashIp(request) });
  } catch (error) {
    // The erasure failed AFTER we consumed the token. If the user row is gone
    // but a completed tombstone exists for their email (a race where another
    // path finished the erasure), treat this as an idempotent success rather
    // than stranding the caller.
    const completed = await prisma.accountDeletionTombstone.findFirst({
      where: { emailHash: hashDeletionEmail(user.email), status: 'completed' },
      select: { id: true },
    });
    if (completed) {
      const res = NextResponse.json({ ok: true, status: 'already-deleted' });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }

    // Genuine failure (e.g. blob deletion down). Reset the token so the same
    // emailed link is retryable, and surface a 503 the client can retry.
    console.error('[API] Account erasure failed:', error);
    await prisma.accountDeletionToken
      .updateMany({ where: { tokenHash, userId: user.id }, data: { consumedAt: null } })
      .catch(() => {});
    return NextResponse.json(
      { error: 'Account deletion could not be completed. Please try again.' },
      { status: 503 },
    );
  }

  // The Session row is gone via cascade; clear the now-dangling cookie. Do NOT
  // run any getCurrentUser()-dependent work after this point.
  const res = NextResponse.json({ ok: true, status: 'deleted' });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
