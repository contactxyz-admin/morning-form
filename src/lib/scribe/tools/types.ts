/**
 * Scribe tool-palette contract.
 *
 * The central invariant (D10 in the plan): every tool handler receives a
 * resolved `ToolContext` that already carries `userId` and `topicKey`. No
 * handler is callable without them — cross-user / cross-topic leakage is a
 * type error at the call site rather than a runtime check sprinkled across
 * six handlers.
 *
 * Shape:
 *   - `parameters` is a zod schema the executor uses to validate LLM-supplied
 *     arguments before dispatching. Any shape mismatch short-circuits with a
 *     `tool_error` frame instead of calling the handler with malformed input.
 *   - `execute` is a plain async function — no streaming, no side-channels.
 *     Tool responses are small JSON objects the LLM will incorporate into its
 *     next turn.
 *   - `description` is the prompt-facing one-liner the model sees. Keep it
 *     factual and bounded; safety rules belong in the policy layer, not here.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { z, ZodType } from 'zod';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface ToolContext {
  readonly db: Db;
  readonly userId: string;
  readonly topicKey: string;
  /**
   * Request id of the scribe invocation this tool call belongs to. Tools
   * that fan out into a child scribe invocation (Plan 2026-04-25-001
   * Unit 5: `refer_to_specialist`) read this so the child's audit row
   * can record `parentRequestId`. Most handlers ignore it.
   */
  readonly requestId: string;
}

export interface ToolHandler<Args, Result> {
  readonly name: string;
  readonly description: string;
  readonly parameters: ZodType<Args>;
  execute(ctx: ToolContext, args: Args): Promise<Result>;
}

/** A tool handler with its Args/Result types erased — used by the registry. */
export type AnyToolHandler = ToolHandler<unknown, unknown>;

export function defineTool<Schema extends ZodType>(
  config: {
    name: string;
    description: string;
    parameters: Schema;
    execute: (ctx: ToolContext, args: z.infer<Schema>) => Promise<unknown>;
  },
): ToolHandler<z.infer<Schema>, unknown> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}
