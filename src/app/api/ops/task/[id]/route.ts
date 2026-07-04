/**
 * PATCH/DELETE /api/ops/task/[id] — partial update and hard delete for a
 * single task. PATCH always writes a task.update audit row; when the body
 * changes ownerEmail to a genuinely new, non-null value it additionally
 * fires the task.assign audit + notifyDelegation via the shared
 * maybeNotifyAssignment() idempotency guard (src/lib/ops/assign.ts) — never
 * on an unrelated field edit, never on reassigning to the same owner.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { isStaff } from '@/lib/ops/config';
import { OpsTaskUpdateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { maybeNotifyAssignment } from '@/lib/ops/assign';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsTaskUpdateSchema.parse>;
  try {
    body = OpsTaskUpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.ownerEmail && !isStaff(body.ownerEmail)) {
    return NextResponse.json({ error: 'ownerEmail must be a MorningForm staff member.' }, { status: 400 });
  }

  const existing = await prisma.companyOpsTask.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  const updated = await prisma.companyOpsTask.update({
    where: { id: params.id },
    data: body,
  });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'task.update',
    taskId: updated.id,
    detail: body,
  });

  if (body.ownerEmail !== undefined) {
    await maybeNotifyAssignment(prisma, {
      previousOwnerEmail: existing.ownerEmail,
      updatedTask: updated,
      actorEmail: guard.user.email,
    });
  }

  return NextResponse.json({ task: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  const existing = await prisma.companyOpsTask.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  await prisma.companyOpsTask.delete({ where: { id: params.id } });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'task.delete',
    taskId: params.id,
    detail: { title: existing.title },
  });

  return NextResponse.json({ ok: true });
}
