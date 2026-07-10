/**
 * GET /api/ops/funnel — pilot funnel aggregates for the /ops Live KPIs tab.
 *
 * Staff-gated like every /api/ops/* route. Returns AGGREGATE COUNTS ONLY —
 * see src/lib/ops/funnel.ts for the no-PII contract.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { getPilotFunnelSnapshot } from '@/lib/ops/funnel';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  const snapshot = await getPilotFunnelSnapshot(prisma);
  return NextResponse.json(snapshot);
}
