/**
 * External MCP server transport.
 *
 * Implements the Streamable HTTP transport for the Model Context Protocol
 * (https://modelcontextprotocol.io) on top of the scribe tool catalog.
 * Connected clients (Claude Desktop, Claude Code via `@morningform/mcp`,
 * Codex, Cursor, VS Code MCP extension) receive read-only access to the
 * vault as if it were a native tool surface.
 *
 * Posture (D1 of docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md):
 *   - Bearer-token auth via the `Authorization` header. The session
 *     cookie is intentionally NOT a valid credential — keeps the
 *     attack surfaces isolated.
 *   - One MCP server instance per request (stateless mode). Closing
 *     over `userId` here is safe because the instance never crosses
 *     requests.
 *   - Per-token rate limiting (60/min) before tool dispatch.
 *   - Every tool call writes one `MCPAuditEvent` row regardless of
 *     outcome. Audit failures don't propagate.
 *
 * Failure modes documented inline:
 *   - 401 — missing/invalid/revoked/expired bearer token.
 *   - 429 — over rate limit; `Retry-After` header in seconds.
 *   - 500 — only for truly unexpected errors (DB unavailable etc.). Tool-
 *     internal errors surface as `isError: true` inside an MCP envelope,
 *     not as HTTP 5xx.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { prisma } from '@/lib/db';
import { findMcpTokenByRaw, markMcpTokenUsed } from '@/lib/mcp/tokens';
import { checkMcpRateLimit } from '@/lib/mcp/rate-limit';
import { logMcpAuthFailure, writeMcpAuditEvent } from '@/lib/mcp/audit';
import { registerScribeToolsOnMcpServer } from '@/lib/mcp/tool-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Prisma + node:crypto = node runtime, not edge.

const SERVER_INFO = {
  name: 'morningform',
  version: '0.1.0',
} as const;

/**
 * Parse the bearer token from the `Authorization` header. Returns null
 * for any malformed input — no error throw, the caller just emits 401.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const raw = match[1].trim();
  return raw.length > 0 ? raw : null;
}

function jsonError(status: number, body: object, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function handle(req: Request): Promise<Response> {
  const rawToken = extractBearerToken(req);
  if (!rawToken) {
    logMcpAuthFailure('missing_bearer');
    return jsonError(401, { error: 'Authentication required.' });
  }

  const token = await findMcpTokenByRaw(prisma, rawToken);
  if (!token) {
    logMcpAuthFailure('token_not_found_or_revoked');
    return jsonError(401, { error: 'Invalid or revoked token.' });
  }

  // Rate-limit check BEFORE tool execution. Counts every prior call this
  // window — success or error — so a burst of bad requests still triggers
  // back-pressure rather than getting refunded by tool-side failures.
  const rl = await checkMcpRateLimit(prisma, token.id);
  if (!rl.allowed) {
    // Audit the throttle so the abuse pattern shows up in the trail.
    await writeMcpAuditEvent(prisma, {
      tokenId: token.id,
      userId: token.userId,
      toolName: '__rate_limited__',
      parameters: null,
      resultStatus: 'rate_limited',
      latencyMs: 0,
    });
    return jsonError(
      429,
      { error: 'Rate limit exceeded.' },
      { 'Retry-After': String(rl.retryAfter ?? 60) },
    );
  }

  // Build a fresh server + transport per request (stateless mode). userId
  // is closed over by the tool callbacks below — safe because the server
  // instance never outlives this handler call.
  const server = new McpServer(SERVER_INFO);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no sessionIdGenerator means each request is its own
    // session. Simplifies horizontal scaling — no sticky-session routing.
    enableJsonResponse: true,
  });

  // Lightweight per-call requestId — surfaced into MCPAuditEvent for
  // cross-row correlation. Not the same as MCP session/protocol ids; this
  // is our internal trace id.
  const requestId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  registerScribeToolsOnMcpServer({
    server,
    userId: token.userId,
    tokenId: token.id,
    db: prisma,
    requestId,
  });

  // markMcpTokenUsed before the actual call so rate-limit accounting is
  // honest about attempted calls (whether or not the tool ultimately
  // succeeds). The audit write below records the actual outcome.
  await markMcpTokenUsed(prisma, token.id);

  await server.connect(transport);
  const response = await transport.handleRequest(req);
  return response;
}

export async function POST(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[mcp] unhandled error', err);
    return jsonError(500, { error: 'Internal server error.' });
  }
}

export async function GET(req: Request): Promise<Response> {
  // Streamable HTTP also accepts GET for SSE streams in some client flows.
  // The same auth + rate-limit gate applies.
  try {
    return await handle(req);
  } catch (err) {
    console.error('[mcp] unhandled error', err);
    return jsonError(500, { error: 'Internal server error.' });
  }
}

