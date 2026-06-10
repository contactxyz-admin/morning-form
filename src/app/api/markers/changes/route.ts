/**
 * GET /api/markers/changes — "what changed since my last test"
 * (longitudinal plan 2026-06-10-002 U5).
 *
 * Flag-gated behind LONGITUDINAL_GRAPH_ENABLED. User-scoped read of the
 * panel diff between the user's two most-recent lab panels. Returns
 * `{ diff: null }` when the user has no lab panels yet (not an error — the
 * common new-user case).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { diffLatestPanels } from '@/lib/markers/panel-diff';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (env.LONGITUDINAL_GRAPH_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const diff = await diffLatestPanels(prisma, user.id);
  return NextResponse.json({ diff }, { headers: { 'Cache-Control': 'no-store' } });
}
