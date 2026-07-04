/**
 * GET /api/ops/board — list tasks for a board (default "pilot"), ordered by
 * phase then orderIndex so phase-grouped rendering on /ops is a straight
 * walk through the array.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  const board = req.nextUrl.searchParams.get('board') || 'pilot';

  const tasks = await prisma.companyOpsTask.findMany({
    where: { board },
    orderBy: [{ phase: 'asc' }, { orderIndex: 'asc' }],
  });

  return NextResponse.json({ tasks });
}
