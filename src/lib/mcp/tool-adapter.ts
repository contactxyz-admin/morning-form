/**
 * Scribe-handler -> MCP-tool adapter.
 *
 * Single source of truth for which scribe tools are exposed externally
 * (D3 of docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md). New
 * scribe tools are NOT auto-exposed — they must be added to the
 * `READ_ALLOWED_TOOLS` allowlist below explicitly.
 *
 * The adapter does three things:
 *   1. Filters scribe handlers down to the read-only allowlist.
 *   2. Lifts the topic-scoping concern from `ToolContext` (internal) to a
 *      `topicKey` argument on the MCP `inputSchema` (external). Internal
 *      scribes pass topicKey via context; external agents pass it via
 *      args. The adapter merges both worlds.
 *   3. Materialises the per-call `ToolContext` with the authenticated
 *      userId from the resolved MCPToken.
 *
 * No outputs are sent to the LLM in raw form — every tool result is
 * serialized as JSON inside the MCP `content[]` envelope. Tools that
 * throw produce an MCP `isError: true` response rather than crashing
 * the transport.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Db, AnyToolHandler, ToolContext } from '@/lib/scribe/tools/types';
import {
  SCRIBE_TOOL_HANDLERS,
  type ScribeToolName,
} from '@/lib/scribe/tool-catalog';
import { writeMcpAuditEvent } from './audit';

/**
 * Read-only allowlist. Anything not in this set is invisible to external
 * MCP clients. `refer_to_specialist` is intentionally excluded — it
 * spawns a child scribe invocation (side effect; LLM cost) and is a
 * control-flow primitive for internal orchestration, not a read.
 */
export const READ_ALLOWED_TOOLS = [
  'search_graph_nodes',
  'get_node_detail',
  'get_node_provenance',
  'compare_to_reference_range',
  'recognize_pattern_in_history',
  'route_to_gp_prep',
  'list_graph_index',
  'resolve_entity',
  'get_topic_overview',
] as const satisfies ReadonlyArray<ScribeToolName>;

export type ReadAllowedToolName = (typeof READ_ALLOWED_TOOLS)[number];

export function isReadAllowed(name: string): name is ReadAllowedToolName {
  return (READ_ALLOWED_TOOLS as readonly string[]).includes(name);
}

/**
 * Tools that depend on `ctx.topicKey` for query scoping. Their MCP-exposed
 * `inputSchema` adds a required `topicKey: string` field; the adapter
 * extracts it from args and injects into ToolContext at call time.
 *
 * Whole-graph tools (list_graph_index, resolve_entity) and tools that
 * take topicKey as an arg already (get_topic_overview) are not in this
 * list — they don't need adapter-side merging.
 */
const TOPIC_SCOPED_TOOLS: ReadonlySet<string> = new Set([
  'search_graph_nodes',
  'get_node_detail',
  'get_node_provenance',
  'compare_to_reference_range',
  'recognize_pattern_in_history',
  'route_to_gp_prep',
]);

/**
 * Sentinel topicKey passed to whole-graph tools that ignore it. Kept
 * obviously-not-a-real-topic so a stray query against `ctx.topicKey`
 * fails closed rather than matching an unrelated row.
 */
const WHOLE_GRAPH_SENTINEL = '__mcp_whole_graph__';

export interface RegisterScribeToolsInput {
  /** The McpServer instance to register tools on. */
  server: McpServer;
  /** Resolved userId from the bearer-token auth gate. */
  userId: string;
  /** Resolved MCPToken id — used for per-call audit-event writes. */
  tokenId: string;
  /** Prisma client / transaction handle. */
  db: Db;
  /** Optional unique requestId for audit chaining. */
  requestId: string;
}

/**
 * Register every read-allowed scribe tool on the McpServer instance.
 * The instance is constructed fresh per HTTP request (stateless mode),
 * so closing over `userId` here is safe — there is no cross-request
 * leakage path.
 */
export function registerScribeToolsOnMcpServer(input: RegisterScribeToolsInput): void {
  const { server, userId, tokenId, db, requestId } = input;

  for (const handler of SCRIBE_TOOL_HANDLERS) {
    if (!isReadAllowed(handler.name)) continue;

    const baseShape = extractShape(handler.parameters);
    const needsTopicKey = TOPIC_SCOPED_TOOLS.has(handler.name);

    // Topic-scoped tools require a `topicKey` field in the MCP schema.
    // Whole-graph and explicit-topicKey tools use their schema unchanged.
    const inputShape = needsTopicKey
      ? {
          ...baseShape,
          topicKey: z
            .string()
            .min(1)
            .max(100)
            .describe('Topic to scope the query to (e.g. "iron", "sleep-recovery").'),
        }
      : baseShape;

    registerOne({ server, handler, inputShape, needsTopicKey, db, userId, tokenId, requestId });
  }
}

/**
 * Per-tool registration. Pulled into its own function so the per-handler
 * generic stays narrow — TypeScript can keep `handler.parameters` typed as
 * the specific Zod schema for the handler without trying to union across
 * every handler in the catalog.
 */
function registerOne(args: {
  server: McpServer;
  handler: AnyToolHandler;
  inputShape: Record<string, z.ZodTypeAny>;
  needsTopicKey: boolean;
  db: Db;
  userId: string;
  tokenId: string;
  requestId: string;
}): void {
  const { server, handler, inputShape, needsTopicKey, db, userId, tokenId, requestId } = args;

  server.registerTool(
    handler.name,
    {
      description: handler.description,
      inputSchema: inputShape,
    },
    async (rawArgs: Record<string, unknown>) => {
      const startedAt = Date.now();
      try {
        const topicKey = needsTopicKey
          ? String(rawArgs.topicKey ?? '')
          : WHOLE_GRAPH_SENTINEL;

        // Strip topicKey out before re-validating against the handler's
        // own schema — internal schemas don't include topicKey (it comes
        // from context for internal scribes).
        const handlerArgs = needsTopicKey
          ? Object.fromEntries(
              Object.entries(rawArgs).filter(([k]) => k !== 'topicKey'),
            )
          : rawArgs;

        const parsed = handler.parameters.parse(handlerArgs) as never;
        const ctx: ToolContext = { db, userId, topicKey, requestId };
        const result = await handler.execute(ctx, parsed);

        // Best-effort audit. Don't await — let the tool response return
        // promptly; the write can complete in the background. Failures
        // are swallowed inside writeMcpAuditEvent.
        void writeMcpAuditEvent(db, {
          tokenId,
          userId,
          toolName: handler.name,
          parameters: rawArgs,
          resultStatus: 'success',
          latencyMs: Date.now() - startedAt,
        });

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result) },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        void writeMcpAuditEvent(db, {
          tokenId,
          userId,
          toolName: handler.name,
          parameters: rawArgs,
          resultStatus: 'error',
          errorMessage: message,
          latencyMs: Date.now() - startedAt,
        });
        return {
          isError: true as const,
          content: [
            { type: 'text' as const, text: `Tool error: ${message}` },
          ],
        };
      }
    },
  );
}

/**
 * Extract a Zod object's `.shape` for the McpServer's `inputSchema` field
 * (which expects a ZodRawShape — a record of zod schemas keyed by field
 * name — not the wrapping object schema). Tools that use `z.object({...})`
 * yield their shape directly; non-object schemas fall back to an empty
 * shape (the McpServer treats this as a zero-arg tool).
 */
function extractShape(schema: z.ZodType<unknown>): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  return {};
}
