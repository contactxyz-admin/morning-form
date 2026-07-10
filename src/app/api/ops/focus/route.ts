/**
 * PUT /api/ops/focus — set This Week's 3 for the current week (weekStart =
 * Monday 00:00 UTC, derived server-side so a client clock can't write to the
 * wrong week). Upsert: one row per board per week.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { OpsFocusPutSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { currentWeekStartUtc } from '@/app/ops/intelligence';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsFocusPutSchema.parse>;
  try {
    body = OpsFocusPutSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const weekStart = new Date(currentWeekStartUtc(new Date()));
  const items = JSON.stringify(body.items);

  const focus = await prisma.companyOpsFocus.upsert({
    where: { board_weekStart: { board: 'pilot', weekStart } },
    create: { board: 'pilot', weekStart, items, updatedBy: guard.user.email },
    update: { items, updatedBy: guard.user.email },
  });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'focus.update',
    detail: { weekStart: weekStart.toISOString(), items: body.items },
  });

  return NextResponse.json({ focus });
}
