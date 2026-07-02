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
  /**
   * Cancellation signal from the parent scribe invocation. Tools that fan out
   * into a child `execute()` (`refer_to_specialist`) forward it so an aborted
   * parent turn also stops the child loop. Most handlers ignore it.
   */
  readonly signal?: AbortSignal;
  /**
   * Captured demographic context for demographic-aware reference ranges (A6).
   * Raw stored values from the User row (sex-at-birth is free-form; birth year
   * is a plain year); `compare_to_reference_range` normalises them and picks a
   * sex/age-appropriate band. Optional — absent on paths that don't load
   * demographics, or for users who haven't provided them, in which case the
   * tool falls back to the lab's captured reference range.
   */
  readonly sexAtBirth?: string | null;
  readonly birthYear?: number | null;
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
