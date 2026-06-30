/**
 * GET /api/panels/diff?from=&to= — diff two specific lab panels
 * (longitudinal-trajectory plan 2026-06-30-001 U6).
 *
 * `from` and `to` are lab-panel SourceDocument ids (from = earlier baseline).
 * User-scoped + flag-gated behind LONGITUDINAL_GRAPH_ENABLED (flag-off → 404).
 * Missing params → 400; a document that isn't the caller's lab panel → 404
 * (never leaks another user's panel). Classification reuses the same pure
 * engine as the post-upload diff, so the two never diverge.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { diffPanels } from '@/lib/markers/panel-diff';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  if (env.LONGITUDINAL_GRAPH_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json(
      { error: 'Both `from` and `to` panel ids are required.' },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json(
      { error: '`from` and `to` must be different panels.' },
      { status: 400 },
    );
  }

  const diff = await diffPanels(prisma, user.id, from, to);
  if (!diff) {
    return NextResponse.json(
      { error: 'One or both panels were not found.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ diff }, { headers: { 'Cache-Control': 'no-store' } });
}
