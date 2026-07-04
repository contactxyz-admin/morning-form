/**
 * Ops MCP tool registrations — writes allowed here, unlike the read-only
 * health MCP (src/lib/mcp/tool-adapter.ts). Deliberately does not import
 * anything from src/lib/scribe or src/lib/mcp: this is a standalone surface
 * over CompanyOpsTask/CompanyOpsAudit only.
 *
 * Every call (success or error) writes exactly one CompanyOpsAudit row,
 * actor `mcp:<founderEmail>`, action `mcp.<toolName>`. Awaited (not
 * fire-and-forget like the health MCP's audit writes) — call volume here is
 * tiny (3 founders), and tests assert exact audit-row counts. The SAME
 * `mcp:`-prefixed `actor` is threaded into every notify/assign call below —
 * not the bare founderEmail — so the resulting task.assign/notify.sent rows
 * are attributable back to the MCP surface, not indistinguishable from a
 * REST-originated action.
 *
 * `inputSchema` is typed `Record<string, z.ZodTypeAny>` (not a narrower
 * generic) to match the McpServer overload that accepts a plain
 * Record<string, unknown> callback arg — same choice tool-adapter.ts makes
 * for the health MCP, for the same reason. The SDK itself validates (and
 * applies zod coercions, e.g. `z.coerce.date()`) against this same shape
 * before invoking the callback below, so there's no need to re-parse here —
 * the callback's `args` already reflects the validated/coerced shape.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/db';
import { ownerEmailValidationError } from '@/lib/ops/config';
import { OPS_STATUS_VALUES, OpsOwnerEmailSchema, type OpsStatus } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';
import { notifyDelegation } from '@/lib/ops/notify';
import { assignTask, applyOwnerAwareUpdate } from '@/lib/ops/assign';
import { listOpsTasks } from '@/lib/ops/queries';

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
      ownerEmail: OpsOwnerEmailSchema.optional(),
    },
    async (rawArgs) => {
      const args = rawArgs as { board?: string; status?: OpsStatus; ownerEmail?: string };
      const tasks = await listOpsTasks(prisma, args);
      return { tasks };
    },
  );

  registerTool(
    server,
    actor,
    'create_ops_task',
    'Create a new task on the shared MorningForm ops board. Setting ownerEmail immediately delegates it and notifies the assignee.',
    {
      board: z.string().min(1).optional(),
      title: z.string().min(1),
      detail: z.string().optional(),
      phase: z.string().optional(),
      ownerEmail: OpsOwnerEmailSchema.nullish(),
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
      const ownerError = ownerEmailValidationError(args.ownerEmail);
      if (ownerError) throw new Error(ownerError);

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
          actorEmail: actor,
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
      ownerEmail: OpsOwnerEmailSchema.nullable(),
    },
    async (rawArgs) => {
      const args = rawArgs as { taskId: string; ownerEmail: string | null };
      const ownerError = ownerEmailValidationError(args.ownerEmail);
      if (ownerError) throw new Error(ownerError);

      const result = await assignTask(prisma, {
        taskId: args.taskId,
        newOwnerEmail: args.ownerEmail,
        actorEmail: actor,
      });
      if (!result) throw new Error('Task not found.');
      if (result.raced) throw new Error('Task was updated concurrently — please retry.');
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
      const result = await applyOwnerAwareUpdate(prisma, { taskId, data: rest, actorEmail: actor });
      if (!result) throw new Error('Task not found.');
      if (result.raced) throw new Error('Task was updated concurrently — please retry.');
      return { task: result.task };
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
  server.registerTool(
    name,
    { description, inputSchema: shape },
    async (args: Record<string, unknown>) => {
      const startedAt = Date.now();
      try {
        const result = await handler(args);
        await writeOpsAudit(prisma, {
          actor,
          action: `mcp.${name}`,
          taskId: extractTaskId(result),
          detail: { params: args, resultStatus: 'success', latencyMs: Date.now() - startedAt },
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
            params: args,
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
