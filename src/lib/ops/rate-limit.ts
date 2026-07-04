/**
 * Per-founder rate limit for the ops MCP surface.
 *
 * Mirrors `src/lib/mcp/rate-limit.ts`: 60 requests / rolling 60-second
 * window, counted via a Postgres count over recent `CompanyOpsAudit` rows
 * for the same actor. `mcp.rate_limited` rows are excluded from the count so
 * a throttled retry burst can't extend its own window indefinitely.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export const OPS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const OPS_RATE_LIMIT_PER_WINDOW = 60;

export interface OpsRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function checkOpsRateLimit(
  db: Db,
  founderEmail: string,
  now: Date = new Date(),
): Promise<OpsRateLimitResult> {
  const actor = `mcp:${founderEmail}`;
  const windowStart = new Date(now.getTime() - OPS_RATE_LIMIT_WINDOW_MS);

  const count = await db.companyOpsAudit.count({
    where: {
      actor,
      createdAt: { gte: windowStart },
      action: { not: 'mcp.rate_limited' },
    },
  });

  const allowed = count < OPS_RATE_LIMIT_PER_WINDOW;
  const remaining = Math.max(0, OPS_RATE_LIMIT_PER_WINDOW - count);
  if (allowed) return { allowed: true, remaining };

  const oldestInWindow = await db.companyOpsAudit.findFirst({
    where: {
      actor,
      createdAt: { gte: windowStart },
      action: { not: 'mcp.rate_limited' },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const retryAfterMs = oldestInWindow
    ? Math.max(1000, oldestInWindow.createdAt.getTime() + OPS_RATE_LIMIT_WINDOW_MS - now.getTime())
    : OPS_RATE_LIMIT_WINDOW_MS;

  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.ceil(retryAfterMs / 1000),
  };
}
