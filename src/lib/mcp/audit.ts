/**
 * MCP audit-event writer. One row per external tool call.
 *
 * Separate from `ScribeAudit` so external-call traffic is queryable in
 * isolation (D4 of the plan). Audit failures must not block the tool
 * response — the route handler should log + continue if the write
 * throws.
 *
 * No raw bearer tokens appear here. The audit row carries `tokenId` (a
 * cuid foreign key), never the token itself.
 */
import type { Db } from '@/lib/scribe/tools/types';

export type MCPAuditResultStatus =
  | 'success'
  | 'error'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden';

export interface WriteMcpAuditEventInput {
  tokenId: string;
  userId: string;
  toolName: string;
  parameters: unknown;
  resultStatus: MCPAuditResultStatus;
  errorMessage?: string;
  latencyMs: number;
}

/**
 * Hard cap on serialized parameters length stored per audit row. Caps the
 * per-call storage cost (review adv-mcp-003) and blunts the unknown-key
 * padding amplification (review adv-mcp-004) for the error path that
 * intentionally logs rawArgs.
 */
const MAX_PARAMETERS_BYTES = 8 * 1024;

/**
 * Safely stringify the parameters object. JSON.stringify can throw on
 * pathological input (circular references, BigInt, etc.) — without this
 * wrap the whole audit write fails silently and the call leaves no trail.
 */
function safeStringifyParameters(parameters: unknown): string {
  let raw: string;
  try {
    raw = JSON.stringify(parameters ?? {});
  } catch {
    raw = '"<unserializable>"';
  }
  if (raw.length <= MAX_PARAMETERS_BYTES) return raw;
  return raw.slice(0, MAX_PARAMETERS_BYTES) + '"<truncated>"';
}

/**
 * Best-effort audit-event write. Catches and logs DB errors rather than
 * propagating them — a failed audit write must not become a failed tool
 * response (the user already paid in scribe latency).
 */
export async function writeMcpAuditEvent(
  db: Db,
  input: WriteMcpAuditEventInput,
): Promise<void> {
  try {
    await db.mCPAuditEvent.create({
      data: {
        tokenId: input.tokenId,
        userId: input.userId,
        toolName: input.toolName,
        parameters: safeStringifyParameters(input.parameters),
        resultStatus: input.resultStatus,
        errorMessage: input.errorMessage ?? null,
        latencyMs: input.latencyMs,
      },
    });
  } catch (err) {
    console.error('[mcp] audit write failed', {
      tokenId: input.tokenId,
      toolName: input.toolName,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Unauthenticated audit row — the bearer token didn't resolve, so we
 * don't have a tokenId / userId. We still want a tracelog of these so
 * abuse patterns (token guessing, malformed envelopes) leave a trail.
 *
 * Implemented as a console log rather than a DB row: the MCPAuditEvent
 * table is keyed on (tokenId, userId), so 401 events have no place to
 * land. Centralising the log statement here keeps the format stable.
 */
export function logMcpAuthFailure(reason: string, extra: Record<string, unknown> = {}): void {
  console.warn('[mcp] auth failure', { reason, ...extra });
}
