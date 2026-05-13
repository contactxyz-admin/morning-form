import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { revokeMcpToken } from '@/lib/mcp/tokens';

/**
 * DELETE /api/mcp/tokens/[id]
 *
 * Idempotent revoke. 200 on successful revoke OR on re-revoke; 404 when
 * the token doesn't exist or belongs to another user. Same posture as
 * `/api/share/revoke`: don't distinguish existence from ownership to
 * avoid leaking ids to a probing attacker.
 */

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const ok = await revokeMcpToken(prisma, user.id, params.id);
  if (!ok) {
    return NextResponse.json({ error: 'Token not found.' }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' } },
  );
}
