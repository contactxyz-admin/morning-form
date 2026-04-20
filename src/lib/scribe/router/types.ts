/**
 * Intent-router contract (U2).
 *
 * The router maps a free-text chat utterance to one of the registered
 * topic-policy keys or to an explicit out-of-scope outcome. The scribe
 * policy registry is the closed set of valid `topicKey` values —
 * adding a policy widens the router automatically.
 *
 * Every decision carries a `reasoning` field used only for the audit
 * trail (never shown to the user). Keep it under ~200 chars; longer
 * strings are truncated at write-time.
 */

export interface RouteDecision {
  /**
   * A registered topicKey (`listTopicPolicyKeys()`) or `null` for
   * explicit out-of-scope. Callers render an out-of-scope surface
   * (GP-prep handoff) when this is null.
   */
  readonly topicKey: string | null;
  /** 0..1 — below `MIN_ROUTING_CONFIDENCE` the caller substitutes null. */
  readonly confidence: number;
  /** One-line rationale for the audit trail. Not user-facing. */
  readonly reasoning: string;
}

export interface RouteTurnInput {
  readonly text: string;
  /**
   * Short tail of chronologically-ordered recent messages. The router
   * uses these for context (pronoun resolution, topic continuity) but
   * the turn being routed is `text`, not anything in `recent`.
   */
  readonly recent?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
}
