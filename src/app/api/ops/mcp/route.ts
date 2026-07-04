/**
 * Ops MCP transport — a separate island from the health MCP
 * (src/app/api/mcp/route.ts). Structurally mirrors it (per-request
 * McpServer, bearer auth, 256KB body cap, per-caller rate limit) but every
 * import is fresh: nothing here comes from src/lib/scribe or src/lib/mcp.
 *
 * Posture:
 *   - Bearer token resolved against COMPANY_OPS_MCP_TOKENS (env-based for
 *     v1 — see src/lib/ops/config.ts).
 *   - Flag off -> 404. Unknown/malformed token -> 401. Token resolves to an
 *     email not on the staff allowlist -> 403 (defensive; today the token
 *     list and allowlist are configured together, but this keeps the
 *     invariant enforced at the surface itself).
 *   - Per-founder rate limit (60/min) before tool dispatch.
 *   - Writes, unlike the health MCP — that's the whole point of this
 *     surface. Every tool call writes one CompanyOpsAudit row regardless of
 *     outcome (src/lib/ops/mcp/tools.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isCompanyOpsEnabled, isStaff, founderEmailForToken } from '@/lib/ops/config';
import { checkOpsRateLimit } from '@/lib/ops/rate-limit';
import { writeOpsAudit } from '@/lib/ops/audit';
import { registerOpsToolsOnMcpServer } from '@/lib/ops/mcp/tools';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVER_INFO = { name: 'morningform-ops', version: '0.1.0' } as const;

const SERVER_INSTRUCTIONS = `This MCP server exposes the MorningForm founders' shared pilot-ops task board (CompanyOpsTask). It is a plain CRUD surface — no LLM calls happen server-side.

Tools: list_ops_tasks, create_ops_task, assign_ops_task, update_ops_task.

Assigning a task's owner (via create_ops_task with ownerEmail set, or assign_ops_task) notifies the new owner by email (and Slack if configured) exactly once per real ownership change.`;

const MAX_BODY_BYTES = 256 * 1024;

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
      'Cache-Control': 'no-store, private',
      Vary: 'Authorization',
      ...extraHeaders,
    },
  });
}

async function handle(req: Request): Promise<Response> {
  if (!isCompanyOpsEnabled()) {
    return jsonError(404, { error: 'Not enabled.' });
  }

  let cappedReq = req;
  if (req.method === 'POST') {
    const lengthHeader = req.headers.get('content-length');
    if (lengthHeader && Number.parseInt(lengthHeader, 10) > MAX_BODY_BYTES) {
      return jsonError(413, { error: 'Request body too large.' });
    }
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      return jsonError(413, { error: 'Request body too large.' });
    }
    cappedReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: buf.byteLength > 0 ? buf : undefined,
    });
  }

  const rawToken = extractBearerToken(cappedReq);
  if (!rawToken) {
    console.warn('[ops-mcp] auth failure', { reason: 'missing_bearer' });
    return jsonError(401, { error: 'Authentication required.' });
  }

  const founderEmail = founderEmailForToken(rawToken);
  if (!founderEmail) {
    console.warn('[ops-mcp] auth failure', { reason: 'token_not_found' });
    return jsonError(401, { error: 'Invalid token.' });
  }

  if (!isStaff(founderEmail)) {
    console.warn('[ops-mcp] auth failure', { reason: 'not_staff', founderEmail });
    return jsonError(403, { error: 'Forbidden.' });
  }

  const rl = await checkOpsRateLimit(prisma, founderEmail);
  if (!rl.allowed) {
    await writeOpsAudit(prisma, {
      actor: `mcp:${founderEmail}`,
      action: 'mcp.rate_limited',
      detail: {},
    });
    return jsonError(429, { error: 'Rate limit exceeded.' }, { 'Retry-After': String(rl.retryAfter ?? 60) });
  }

  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });

  registerOpsToolsOnMcpServer({ server, founderEmail });

  await server.connect(transport);
  const response = await transport.handleRequest(cappedReq);
  return response;
}

async function handleWithTopLevelErrorWrap(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[ops-mcp] unhandled error', err);
    return jsonError(500, { error: 'Internal server error.' });
  }
}

export const POST = handleWithTopLevelErrorWrap;
export const GET = handleWithTopLevelErrorWrap;
