/**
 * POST /api/ops/task — create a task on the shared ops board. If created
 * with an ownerEmail already set, that counts as a delegation and fires the
 * same notify path as reassigning an existing task.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { isStaff } from '@/lib/ops/config';
import { OpsTaskCreateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { notifyDelegation } from '@/lib/ops/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsTaskCreateSchema.parse>;
  try {
    body = OpsTaskCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.ownerEmail && !isStaff(body.ownerEmail)) {
    return NextResponse.json({ error: 'ownerEmail must be a MorningForm staff member.' }, { status: 400 });
  }

  const task = await prisma.companyOpsTask.create({
    data: {
      board: body.board,
      title: body.title,
      detail: body.detail,
      phase: body.phase,
      ownerEmail: body.ownerEmail ?? null,
      status: body.status,
      dueDate: body.dueDate ?? null,
      orderIndex: body.orderIndex,
      createdBy: guard.user.email,
    },
  });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'task.create',
    taskId: task.id,
    detail: { title: task.title, ownerEmail: task.ownerEmail },
  });

  if (task.ownerEmail) {
    await notifyDelegation(prisma, {
      task,
      newOwnerEmail: task.ownerEmail,
      actorEmail: guard.user.email,
    });
  }

  return NextResponse.json({ task }, { status: 201 });
}
