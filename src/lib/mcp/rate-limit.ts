/**
 * Per-token rate limit for the external MCP server.
 *
 * Window: 60 requests per rolling 60-second window per token (R9 of the
 * external-mcp-server plan). Implemented via a Postgres count over recent
 * `MCPAuditEvent` rows for the same `tokenId` — simpler than a Redis
 * counter, and good enough at MVP scale. Promotes to Redis once active
 * tokens exceed ~1000 (per CTO brief §9).
 *
 * The 60/min cap is generous for a single-user agent loop (1 call/sec
 * sustained). If users hit it legitimately, raise via a per-token
 * override field on MCPToken — added in a follow-up if/when needed.
 */
import type { Db } from '@/lib/scribe/tools/types';

export const MCP_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MCP_RATE_LIMIT_PER_WINDOW = 60;

export interface RateLimitResult {
  allowed: boolean;
  /** Calls remaining in the current window. Floor 0. */
  remaining: number;
  /** Seconds until the window opens up enough to allow the next call. Always 1+ when rate-limited. */
  retryAfter?: number;
}

/**
 * Check whether a token can make another call right now. Counts the
 * `MCPAuditEvent` rows for this token within the last
 * `MCP_RATE_LIMIT_WINDOW_MS`. Audit rows from BEFORE the check (i.e. the
 * previous N calls' records) drive the count — so a rapid burst is
 * detected on the first over-limit attempt regardless of which result
 * statuses those prior calls landed on.
 */
export async function checkMcpRateLimit(
  db: Db,
  tokenId: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - MCP_RATE_LIMIT_WINDOW_MS);

  // Exclude rows that ARE the throttle outcome. Otherwise each rate-limited
  // attempt writes an audit row that itself counts toward the next call's
  // rate-limit count, producing a self-amplifying throttle: retry-spamming
  // clients extend their own window indefinitely (review correctness-1).
  const count = await db.mCPAuditEvent.count({
    where: {
      tokenId,
      createdAt: { gte: windowStart },
      resultStatus: { not: 'rate_limited' },
    },
  });

  const allowed = count < MCP_RATE_LIMIT_PER_WINDOW;
  const remaining = Math.max(0, MCP_RATE_LIMIT_PER_WINDOW - count);

  if (allowed) return { allowed: true, remaining };

  // When over the limit, suggest retry after the oldest in-window call ages
  // out. Without resilient indexing on createdAt for this lookup we'd hit a
  // table scan — the table is per-token-prefixed via the @@index([tokenId,
  // createdAt]) so this stays cheap even with millions of historical rows.
  const oldestInWindow = await db.mCPAuditEvent.findFirst({
    where: {
      tokenId,
      createdAt: { gte: windowStart },
      resultStatus: { not: 'rate_limited' },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const retryAfterMs = oldestInWindow
    ? Math.max(
        1000,
        oldestInWindow.createdAt.getTime() + MCP_RATE_LIMIT_WINDOW_MS - now.getTime(),
      )
    : MCP_RATE_LIMIT_WINDOW_MS;

  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.ceil(retryAfterMs / 1000),
  };
}
