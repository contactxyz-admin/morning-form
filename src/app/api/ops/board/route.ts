/**
 * GET /api/ops/board — list tasks for a board (default "pilot"). Ordering
 * (phase then orderIndex) lives in src/lib/ops/queries.ts so this route, the
 * /ops page, and the MCP list_ops_tasks tool can't drift on it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { listOpsTasks } from '@/lib/ops/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  const board = req.nextUrl.searchParams.get('board') || 'pilot';
  const tasks = await listOpsTasks(prisma, { board });

  return NextResponse.json({ tasks });
}
