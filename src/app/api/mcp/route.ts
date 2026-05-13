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
 * Server-level instructions surfaced to MCP clients during `initialize`.
 * Gives external agents enough domain context to choose the right tool
 * without consulting external docs — closes the "domain vocabulary
 * unknown to fresh agents" gap from the PR #106 review.
 */
const SERVER_INSTRUCTIONS = `MorningForm is a longitudinal personal health record. This MCP server exposes a user's vault — graph nodes for biomarkers, symptoms, conditions, medications, interventions; per-topic compiled summaries; provenance back to source documents.

Read-only access. No write tools.

Workflow:
1. Call list_graph_index first to discover topics + recent activity + top nodes (capped at 200 by importance).
2. Use resolve_entity to map a canonical key (e.g. "ferritin", "fatigue") to a node id.
3. Use get_node_detail / get_node_provenance to read facts + their supporting source chunks. Every claim is grounded in a SourceChunk.
4. For topic-scoped reasoning (search, range comparison, pattern recognition), pass topicKey explicitly — discoverable via list_graph_index or get_topic_overview.

Specialist routing is internal to the scribe; external clients invoke specialist tools directly. Do not invent tool names.`;

/**
 * Hard cap on request body size. Authenticated DoS via multi-GB POSTs to
 * a streamable transport is the obvious attack vector — the SDK's
 * handleRequest buffers req.json() with no limit (review sec-1).
 */
const MAX_BODY_BYTES = 256 * 1024;

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
    headers: {
      'Content-Type': 'application/json',
      // Per-user vault state is never cacheable at intermediaries. Vary by
      // Authorization so any well-behaved CDN treats different tokens as
      // distinct cache keys (review api-contract-7).
      'Cache-Control': 'no-store, private',
      Vary: 'Authorization',
      ...extraHeaders,
    },
  });
}

async function handle(req: Request): Promise<Response> {
  // Body-size cap before transport.handleRequest invokes req.json() —
  // unbounded for authenticated POSTs without this gate (review sec-1).
  const lengthHeader = req.headers.get('content-length');
  if (lengthHeader && Number.parseInt(lengthHeader, 10) > MAX_BODY_BYTES) {
    return jsonError(413, { error: 'Request body too large.' });
  }

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
    // Fire-and-forget — matches the success path semantics in tool-adapter.ts
    // and keeps the 429 fast. (writeMcpAuditEvent swallows its own errors.)
    void writeMcpAuditEvent(prisma, {
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
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
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

/**
 * Top-level error wrap shared by every supported HTTP method. Streamable
 * HTTP accepts GET (SSE handshake), POST (RPC), and DELETE (session
 * terminate, no-op in stateless mode). Same auth + rate-limit gate
 * applies to all three.
 */
async function handleWithTopLevelErrorWrap(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[mcp] unhandled error', err);
    return jsonError(500, { error: 'Internal server error.' });
  }
}

export const POST = handleWithTopLevelErrorWrap;
export const GET = handleWithTopLevelErrorWrap;

