/**
 * CompanyOpsAudit writer. One row per write / notify / MCP call.
 *
 * Mirrors `src/lib/mcp/audit.ts`'s best-effort posture: a failed audit write
 * must never fail the caller's actual request, so DB errors are caught and
 * logged, never thrown.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface WriteOpsAuditInput {
  /** Founder email, or "mcp:<email>" for calls made through the ops MCP. */
  actor: string;
  action: string;
  taskId?: string | null;
  /** Arbitrary JSON-serialisable payload; stored as a string. */
  detail?: unknown;
}

const MAX_DETAIL_BYTES = 8 * 1024;

function safeStringifyDetail(detail: unknown): string {
  if (detail === undefined) return '';
  if (typeof detail === 'string') return detail;
  let raw: string;
  try {
    raw = JSON.stringify(detail);
  } catch {
    raw = '"<unserializable>"';
  }
  return raw.length <= MAX_DETAIL_BYTES ? raw : raw.slice(0, MAX_DETAIL_BYTES) + '"<truncated>"';
}

export async function writeOpsAudit(db: Db, input: WriteOpsAuditInput): Promise<void> {
  try {
    await db.companyOpsAudit.create({
      data: {
        actor: input.actor,
        action: input.action,
        taskId: input.taskId ?? null,
        detail: safeStringifyDetail(input.detail),
      },
    });
  } catch (err) {
    console.error('[ops] audit write failed', {
      actor: input.actor,
      action: input.action,
      err: err instanceof Error ? err.message : err,
    });
  }
}
