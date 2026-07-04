/**
 * Shared "did this just delegate a task" logic.
 *
 * Single source of truth for the notify idempotency rule (only fire on a
 * real change to a non-null owner) so it can't drift between the two call
 * sites: the REST PATCH route (which may change several fields in one
 * request, ownerEmail among them) and the MCP `assign_ops_task` tool (which
 * only ever changes ownerEmail).
 */
import type { CompanyOpsTask, PrismaClient, Prisma } from '@prisma/client';
import { writeOpsAudit } from '@/lib/ops/audit';
import { notifyDelegation } from '@/lib/ops/notify';

type Db = PrismaClient | Prisma.TransactionClient;

export interface MaybeNotifyAssignmentInput {
  previousOwnerEmail: string | null;
  updatedTask: CompanyOpsTask;
  actorEmail: string;
}

/**
 * Writes the `task.assign` audit row + sends the delegation notification,
 * but only when the owner actually changed to a non-null value. Called
 * after any write that could have touched `ownerEmail`. Returns whether it
 * fired, purely for test/observability convenience.
 */
export async function maybeNotifyAssignment(
  db: Db,
  input: MaybeNotifyAssignmentInput,
): Promise<boolean> {
  const { previousOwnerEmail, updatedTask, actorEmail } = input;
  const newOwnerEmail = updatedTask.ownerEmail;
  if (!newOwnerEmail) return false;
  if (newOwnerEmail === previousOwnerEmail) return false;

  await writeOpsAudit(db, {
    actor: actorEmail,
    action: 'task.assign',
    taskId: updatedTask.id,
    detail: { previousOwnerEmail, newOwnerEmail },
  });
  await notifyDelegation(db, { task: updatedTask, newOwnerEmail, actorEmail });
  return true;
}

export interface AssignTaskInput {
  taskId: string;
  newOwnerEmail: string | null;
  actorEmail: string;
}

export interface AssignTaskResult {
  task: CompanyOpsTask;
  notified: boolean;
}

/**
 * Owner-only assignment used by the MCP `assign_ops_task` tool, which never
 * touches any other field. The REST PATCH route instead folds ownerEmail
 * into its own combined update and calls maybeNotifyAssignment() directly —
 * see src/app/api/ops/task/[id]/route.ts.
 */
export async function assignTask(db: Db, input: AssignTaskInput): Promise<AssignTaskResult | null> {
  const existing = await db.companyOpsTask.findUnique({ where: { id: input.taskId } });
  if (!existing) return null;

  const updated = await db.companyOpsTask.update({
    where: { id: input.taskId },
    data: { ownerEmail: input.newOwnerEmail },
  });

  const notified = await maybeNotifyAssignment(db, {
    previousOwnerEmail: existing.ownerEmail,
    updatedTask: updated,
    actorEmail: input.actorEmail,
  });

  return { task: updated, notified };
}
