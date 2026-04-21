/**
 * Intent router entry point (U2).
 *
 * One structured-output LLM call per invocation. Not multi-turn, no
 * tools. The scribe's multi-turn execute() runs afterwards on the
 * routed topicKey — this module just decides WHICH scribe.
 *
 * Invariants:
 * - Topic keys returned by the LLM that aren't in `listTopicPolicyKeys()`
 *   are coerced to `null`. No router caller sees an unregistered key.
 * - Confidence below `MIN_ROUTING_CONFIDENCE` substitutes `null` for
 *   topicKey. The reasoning is preserved so the audit trail still has
 *   the "why we bailed" signal.
 * - Empty / whitespace-only input returns null immediately without
 *   calling the LLM. Saves a token budget and makes the failure
 *   mode cheap.
 */

import { z } from 'zod';
import { LLMClient, LIGHTWEIGHT_MODEL } from '@/lib/llm/client';
import { listTopicPolicyKeys } from '@/lib/scribe/policy/registry';
import { buildRouterSystemPrompt, buildRouterUserPrompt } from './prompt';
import type { RouteDecision, RouteTurnInput } from './types';

export const MIN_ROUTING_CONFIDENCE = 0.6;

/**
 * Raw LLM output shape. `topicKey` is `string | null` in the wire
 * contract (not a closed enum) so a model that invents a new key
 * still validates at the schema level — we coerce to `null` in
 * application code for a clearer audit message.
 */
const RouteDecisionWireSchema = z.object({
  topicKey: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
});
type RouteDecisionWire = z.infer<typeof RouteDecisionWireSchema>;

export interface RouteTurnDeps {
  /** Injection seam for tests. Defaults to a shared `LLMClient`. */
  readonly llm?: LLMClient;
}

let defaultClient: LLMClient | null = null;
function getDefaultClient(): LLMClient {
  if (!defaultClient) defaultClient = new LLMClient();
  return defaultClient;
}

export async function routeTurn(
  input: RouteTurnInput,
  deps: RouteTurnDeps = {},
): Promise<RouteDecision> {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) {
    return {
      topicKey: null,
      confidence: 0,
      reasoning: 'empty input — skipped LLM call',
    };
  }

  const llm = deps.llm ?? getDefaultClient();
  const wire = await llm.generate<RouteDecisionWire>({
    system: buildRouterSystemPrompt(),
    prompt: buildRouterUserPrompt({ ...input, text: trimmed }),
    schema: RouteDecisionWireSchema,
    schemaDescription:
      'Pick a specialist topicKey from the closed list in the system prompt, or null for out-of-scope. confidence is 0..1. reasoning is a one-line audit string.',
    model: LIGHTWEIGHT_MODEL,
    temperature: 0,
    maxTokens: 512,
  });

  return coerceDecision(wire);
}

/**
 * Coerce a raw LLM decision into the application-level `RouteDecision`:
 *   - Unknown topicKey → null with an appended reasoning note.
 *   - Low-confidence topicKey → null, confidence preserved for audit.
 *
 * Separated so tests can exercise the coercion logic without calling
 * an LLM client.
 */
export function coerceDecision(wire: RouteDecisionWire): RouteDecision {
  const validKeys = new Set(listTopicPolicyKeys());
  let { topicKey } = wire;
  let reasoning = wire.reasoning;

  if (topicKey !== null && !validKeys.has(topicKey)) {
    reasoning = `unregistered topicKey '${topicKey}' coerced to null — ${reasoning}`;
    topicKey = null;
  }

  if (topicKey !== null && wire.confidence < MIN_ROUTING_CONFIDENCE) {
    reasoning = `confidence ${wire.confidence.toFixed(2)} below ${MIN_ROUTING_CONFIDENCE} — null with original topicKey '${topicKey}' — ${reasoning}`;
    topicKey = null;
  }

  return {
    topicKey,
    confidence: wire.confidence,
    reasoning,
  };
}

export type { RouteDecision, RouteTurnInput };
