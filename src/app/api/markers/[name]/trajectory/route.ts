/**
 * GET /api/markers/[name]/trajectory — a marker's multi-point dated series
 * (longitudinal-trajectory plan 2026-06-30-001 U5).
 *
 * Thin, user-scoped wrapper over `buildMarkerTrajectory` (lab observation
 * instances merged with wearable points, newest-first, capped). Flag-gated
 * behind LONGITUDINAL_GRAPH_ENABLED so flag-off is a 404 (byte-for-byte the
 * pre-feature surface). `params.name` is the marker display name — the App
 * Router has ALREADY percent-decoded the dynamic segment, so we must NOT
 * decode it again (a second decode throws URIError on a literal `%` → 500, and
 * mangles names that legitimately contain `%`). An unknown marker returns an
 * empty series, not an error.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { buildMarkerTrajectory } from '@/lib/markers/trajectory';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
): Promise<Response> {
  if (env.LONGITUDINAL_GRAPH_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const markerName = params.name.trim();
  if (!markerName) {
    return NextResponse.json({ error: 'Marker name is required.' }, { status: 400 });
  }

  const series = await buildMarkerTrajectory(prisma, user.id, markerName);
  return NextResponse.json(
    { marker: markerName, series },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
