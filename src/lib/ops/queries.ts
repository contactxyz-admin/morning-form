/**
 * Shared read query for the task board — used by GET /api/ops/board, the
 * /ops server component, and the MCP list_ops_tasks tool, so the three
 * surfaces can't drift on filtering/ordering rules (e.g. the client's
 * phase-grouping in board-client.tsx assumes phase-adjacency in the
 * returned array — a change to the ordering has to land here once).
 */
import type { CompanyOpsTask, PrismaClient, Prisma } from '@prisma/client';
import type { OpsStatus } from '@/lib/ops/schema';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListOpsTasksInput {
  board?: string;
  status?: OpsStatus;
  ownerEmail?: string;
}

export async function listOpsTasks(db: Db, input: ListOpsTasksInput = {}): Promise<CompanyOpsTask[]> {
  return db.companyOpsTask.findMany({
    where: {
      board: input.board ?? 'pilot',
      ...(input.status ? { status: input.status } : {}),
      ...(input.ownerEmail ? { ownerEmail: input.ownerEmail } : {}),
    },
    orderBy: [{ phase: 'asc' }, { orderIndex: 'asc' }],
  });
}
