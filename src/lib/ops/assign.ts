/**
 * Shared "did this just delegate a task" logic.
 *
 * Single source of truth for both the notify idempotency rule (only fire on
 * a real change to a non-null owner) and the race-safety around it, so
 * neither can drift between the two call sites: the REST PATCH route (which
 * may change several fields in one request, ownerEmail among them) and the
 * MCP `assign_ops_task` tool (which only ever changes ownerEmail).
 *
 * Race safety: a plain read-then-write (findUnique -> update) lets two
 * concurrent requests that both read the same previous owner both "win" the
 * transition — both would see the same before/after and both fire a
 * task.assign audit + notification. `applyOwnerAwareUpdate` closes that gap
 * with a compare-and-swap: the write is conditioned on ownerEmail still
 * matching what was just read (mirrors the conditional-updateMany pattern in
 * src/app/api/actions/[id]/transition/route.ts). Whichever request loses the
 * race sees `count === 0`, re-reads the row the winner already produced, and
 * skips the audit/notify — exactly one of the two ever fires it.
 */
import { Prisma, type CompanyOpsTask, type PrismaClient } from '@prisma/client';
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
 * but only when the owner actually changed to a non-null value. Returns
 * whether it fired, purely for test/observability convenience.
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

export interface ApplyOwnerAwareUpdateInput {
  taskId: string;
  /** Prisma update data. When it includes `ownerEmail`, the write is CAS-guarded. */
  data: Prisma.CompanyOpsTaskUpdateInput;
  actorEmail: string;
}

export interface ApplyOwnerAwareUpdateResult {
  task: CompanyOpsTask;
  /** True only for the request that actually won a real owner change and fired notify. */
  assigned: boolean;
}

export async function applyOwnerAwareUpdate(
  db: Db,
  { taskId, data, actorEmail }: ApplyOwnerAwareUpdateInput,
): Promise<ApplyOwnerAwareUpdateResult | null> {
  const existing = await db.companyOpsTask.findUnique({ where: { id: taskId } });
  if (!existing) return null;

  const touchesOwner = Object.prototype.hasOwnProperty.call(data, 'ownerEmail');

  if (!touchesOwner) {
    try {
      const task = await db.companyOpsTask.update({ where: { id: taskId }, data });
      return { task, assigned: false };
    } catch (err) {
      // P2025: deleted by a concurrent request between our read and write.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    }
  }

  // Compare-and-swap on ownerEmail: only applies if the row's ownerEmail is
  // still what we just read. Guards the whole combined update (not just the
  // ownerEmail field) — if the CAS is lost, none of this request's edits are
  // silently half-applied.
  const cas = await db.companyOpsTask.updateMany({
    where: { id: taskId, ownerEmail: existing.ownerEmail },
    data,
  });

  if (cas.count === 0) {
    const current = await db.companyOpsTask.findUnique({ where: { id: taskId } });
    if (!current) return null;
    return { task: current, assigned: false };
  }

  const task = await db.companyOpsTask.findUniqueOrThrow({ where: { id: taskId } });
  const assigned = await maybeNotifyAssignment(db, {
    previousOwnerEmail: existing.ownerEmail,
    updatedTask: task,
    actorEmail,
  });
  return { task, assigned };
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
 * touches any other field. A thin wrapper over applyOwnerAwareUpdate() so
 * both call sites share one race-safe implementation.
 */
export async function assignTask(db: Db, input: AssignTaskInput): Promise<AssignTaskResult | null> {
  const result = await applyOwnerAwareUpdate(db, {
    taskId: input.taskId,
    data: { ownerEmail: input.newOwnerEmail },
    actorEmail: input.actorEmail,
  });
  if (!result) return null;
  return { task: result.task, notified: result.assigned };
}
