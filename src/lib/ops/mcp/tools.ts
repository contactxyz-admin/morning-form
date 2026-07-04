/**
 * Ops MCP tool registrations — writes allowed here, unlike the read-only
 * health MCP (src/lib/mcp/tool-adapter.ts). Deliberately does not import
 * anything from src/lib/scribe or src/lib/mcp: this is a standalone surface
 * over CompanyOpsTask/CompanyOpsAudit only.
 *
 * Every call (success or error) writes exactly one CompanyOpsAudit row,
 * actor `mcp:<founderEmail>`, action `mcp.<toolName>`. Awaited (not
 * fire-and-forget like the health MCP's audit writes) — call volume here is
 * tiny (3 founders), and tests assert exact audit-row counts.
 *
 * `inputSchema` is typed `Record<string, z.ZodTypeAny>` (not a narrower
 * generic) to match the McpServer overload that accepts a plain
 * Record<string, unknown> callback arg — same choice tool-adapter.ts makes
 * for the health MCP, for the same reason.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/db';
import { isStaff } from '@/lib/ops/config';
import { OPS_STATUS_VALUES, type OpsStatus } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { notifyDelegation } from '@/lib/ops/notify';
import { assignTask } from '@/lib/ops/assign';

export interface RegisterOpsToolsInput {
  server: McpServer;
  founderEmail: string;
}

export function registerOpsToolsOnMcpServer({ server, founderEmail }: RegisterOpsToolsInput): void {
  const actor = `mcp:${founderEmail}`;

  registerTool(
    server,
    actor,
    'list_ops_tasks',
    'List tasks on the shared MorningForm ops board, optionally filtered by board/status/owner.',
    {
      board: z.string().optional(),
      status: z.enum(OPS_STATUS_VALUES).optional(),
      ownerEmail: z.string().email().optional(),
    },
    async (rawArgs) => {
      const args = rawArgs as { board?: string; status?: OpsStatus; ownerEmail?: string };
      const tasks = await prisma.companyOpsTask.findMany({
        where: {
          board: args.board ?? 'pilot',
          ...(args.status ? { status: args.status } : {}),
          ...(args.ownerEmail ? { ownerEmail: args.ownerEmail } : {}),
        },
        orderBy: [{ phase: 'asc' }, { orderIndex: 'asc' }],
      });
      return { tasks };
    },
  );

  registerTool(
    server,
    actor,
    'create_ops_task',
    'Create a new task on the shared MorningForm ops board. Setting ownerEmail immediately delegates it and notifies the assignee.',
    {
      board: z.string().optional(),
      title: z.string().min(1),
      detail: z.string().optional(),
      phase: z.string().optional(),
      ownerEmail: z.string().email().nullish(),
      dueDate: z.coerce.date().nullish(),
    },
    async (rawArgs) => {
      const args = rawArgs as {
        board?: string;
        title: string;
        detail?: string;
        phase?: string;
        ownerEmail?: string | null;
        dueDate?: Date | null;
      };
      if (args.ownerEmail && !isStaff(args.ownerEmail)) {
        throw new Error('ownerEmail must be a MorningForm staff member.');
      }
      const task = await prisma.companyOpsTask.create({
        data: {
          board: args.board ?? 'pilot',
          title: args.title,
          detail: args.detail ?? '',
          phase: args.phase ?? '',
          ownerEmail: args.ownerEmail ?? null,
          dueDate: args.dueDate ?? null,
          createdBy: actor,
        },
      });
      if (task.ownerEmail) {
        await notifyDelegation(prisma, {
          task,
          newOwnerEmail: task.ownerEmail,
          actorEmail: founderEmail,
        });
      }
      return { task };
    },
  );

  registerTool(
    server,
    actor,
    'assign_ops_task',
    'Assign (or reassign, or unassign with ownerEmail=null) an existing ops task to a MorningForm staff member. Notifies the new owner exactly once per real change.',
    {
      taskId: z.string().min(1),
      ownerEmail: z.string().email().nullable(),
    },
    async (rawArgs) => {
      const args = rawArgs as { taskId: string; ownerEmail: string | null };
      if (args.ownerEmail && !isStaff(args.ownerEmail)) {
        throw new Error('ownerEmail must be a MorningForm staff member.');
      }
      const result = await assignTask(prisma, {
        taskId: args.taskId,
        newOwnerEmail: args.ownerEmail,
        actorEmail: founderEmail,
      });
      if (!result) throw new Error('Task not found.');
      return { task: result.task, notified: result.notified };
    },
  );

  registerTool(
    server,
    actor,
    'update_ops_task',
    'Update the status/title/detail/dueDate of an existing ops task. Does not touch ownerEmail — use assign_ops_task for that.',
    {
      taskId: z.string().min(1),
      status: z.enum(OPS_STATUS_VALUES).optional(),
      title: z.string().min(1).optional(),
      detail: z.string().optional(),
      dueDate: z.coerce.date().nullish(),
    },
    async (rawArgs) => {
      const { taskId, ...rest } = rawArgs as {
        taskId: string;
        status?: OpsStatus;
        title?: string;
        detail?: string;
        dueDate?: Date | null;
      };
      const existing = await prisma.companyOpsTask.findUnique({ where: { id: taskId } });
      if (!existing) throw new Error('Task not found.');
      const task = await prisma.companyOpsTask.update({ where: { id: taskId }, data: rest });
      return { task };
    },
  );
}

function registerTool(
  server: McpServer,
  actor: string,
  name: string,
  description: string,
  shape: Record<string, z.ZodTypeAny>,
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>,
): void {
  const schema = z.object(shape);
  server.registerTool(
    name,
    { description, inputSchema: shape },
    async (rawArgs: Record<string, unknown>) => {
      const startedAt = Date.now();
      try {
        const parsed = schema.parse(rawArgs);
        const result = await handler(parsed);
        await writeOpsAudit(prisma, {
          actor,
          action: `mcp.${name}`,
          taskId: extractTaskId(result),
          detail: { params: parsed, resultStatus: 'success', latencyMs: Date.now() - startedAt },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await writeOpsAudit(prisma, {
          actor,
          action: `mcp.${name}`,
          detail: {
            params: rawArgs,
            resultStatus: 'error',
            errorMessage: message,
            latencyMs: Date.now() - startedAt,
          },
        });
        return {
          isError: true as const,
          content: [{ type: 'text' as const, text: `Tool error: ${message}` }],
        };
      }
    },
  );
}

function extractTaskId(result: Record<string, unknown>): string | undefined {
  const task = result.task as { id?: string } | undefined;
  return task?.id;
}
