import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { listSharesForUser } from '@/lib/share/tokens';

/**
 * GET /api/share/list
 *
 * Returns the current user's shares, newest first. Raw tokens are never
 * re-emitted — the response carries metadata only (id, scope, label,
 * revokedAt, viewCount, etc.). To copy a link, the owner must mint a new
 * share.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const shares = await listSharesForUser(prisma, user.id);
  return NextResponse.json({ shares });
}
