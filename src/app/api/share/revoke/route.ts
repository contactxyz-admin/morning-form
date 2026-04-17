import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { revokeShare } from '@/lib/share/tokens';

/**
 * POST /api/share/revoke
 *
 * Body: { id }
 * Returns 200 `{ ok: true }` on success, 404 if the share doesn't exist or
 * belongs to another user (we don't distinguish — leaking existence is
 * worse than returning a generic 404).
 */

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ id: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid revoke request.' }, { status: 422 });
  }

  const ok = await revokeShare(prisma, user.id, parsed.id);
  if (!ok) {
    return NextResponse.json({ error: 'Share not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
