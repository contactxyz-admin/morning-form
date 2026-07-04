/**
 * PATCH/DELETE /api/ops/task/[id] — partial update and hard delete for a
 * single task. PATCH always writes a task.update audit row; when the body
 * changes ownerEmail to a genuinely new, non-null value it additionally
 * fires the task.assign audit + notifyDelegation via applyOwnerAwareUpdate()
 * (src/lib/ops/assign.ts) — never on an unrelated field edit, never on
 * reassigning to the same owner, and race-safe against two concurrent
 * requests reassigning the same task (compare-and-swap on ownerEmail).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { isStaff } from '@/lib/ops/config';
import { OpsTaskUpdateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { applyOwnerAwareUpdate } from '@/lib/ops/assign';

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

  const result = await applyOwnerAwareUpdate(prisma, {
    taskId: params.id,
    data: body,
    actorEmail: guard.user.email,
  });
  if (!result) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'task.update',
    taskId: result.task.id,
    detail: body,
  });

  return NextResponse.json({ task: result.task });
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

  try {
    await prisma.companyOpsTask.delete({ where: { id: params.id } });
  } catch (err) {
    // P2025: already deleted by a concurrent request — idempotently treat as gone.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }
    throw err;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'task.delete',
    taskId: params.id,
    detail: { title: existing.title },
  });

  return NextResponse.json({ ok: true });
}
