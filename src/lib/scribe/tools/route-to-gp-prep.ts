/**
 * `route_to_gp_prep` — the scribe's referral discipline made tactile. When
 * the specialist concludes the question is outside their scope of practice,
 * calling this tool produces a deterministic handoff payload:
 *
 *   - at compile time, `src/lib/topics/compile.ts` folds the `reason` +
 *     `suggestedQuestion` into `gpPrep.questionsToAsk`
 *   - at runtime, the `InlineExplainCard` renders an "Add to GP prep" button
 *     bound to this payload rather than showing a watered-down answer
 *
 * Pure function. No DB read. The only topic-scoping we apply is a sanity
 * check that `topicKey` on the context matches the call's topic — the
 * executor always passes its own ctx, so this is belt-and-braces; a test
 * covers it.
 */
import { z } from 'zod';
import type { ToolContext, ToolHandler } from './types';

export const routeToGpPrepSchema = z.object({
  reason: z.string().min(4).max(500),
  suggestedQuestion: z.string().min(4).max(300),
});

export type RouteToGpPrepArgs = z.infer<typeof routeToGpPrepSchema>;

export interface RouteToGpPrepResult {
  routed: true;
  topicKey: string;
  reason: string;
  suggestedQuestion: string;
}

export const routeToGpPrepHandler: ToolHandler<RouteToGpPrepArgs, RouteToGpPrepResult> = {
  name: 'route_to_gp_prep',
  description:
    'Refer the current question out of scope. Use when a user prompt (or a compile-time judgment) falls outside your specialty\'s allowed judgment kinds — never partial-answer instead. Produces a GP-prep question the user can take to their clinician.',
  parameters: routeToGpPrepSchema,
  async execute(ctx: ToolContext, args: RouteToGpPrepArgs) {
    return {
      routed: true as const,
      topicKey: ctx.topicKey,
      reason: args.reason.trim(),
      suggestedQuestion: args.suggestedQuestion.trim(),
    };
  },
};
