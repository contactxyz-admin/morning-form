/**
 * Chat turn runtime contract (U3).
 *
 * `runChatTurn` is an async generator that drives one user → assistant
 * exchange end-to-end: it persists the user message, routes the
 * utterance, runs the scribe, and persists the assistant message. The
 * caller (U4 SSE route, or a test) consumes the yielded events in order
 * and has no other view into the internal state.
 *
 * Event ordering is load-bearing:
 *   routed → token* → done    — success
 *   routed → token* → error   — mid-stream failure
 *   error                     — pre-routing failure (e.g. router throws)
 * `done` and `error` are mutually exclusive and terminal.
 */

import type { Citation } from '@/lib/topics/types';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { ValidatedAction } from '@/lib/scribe/tools/propose-next-steps';

export interface RoutedEvent {
  readonly type: 'routed';
  readonly topicKey: string | null;
  readonly confidence: number;
  readonly reasoning: string;
}

export interface TokenEvent {
  readonly type: 'token';
  readonly text: string;
}

/**
 * One referral the orchestrating scribe made via `refer_to_specialist`
 * during this turn (Plan 2026-04-25-001 Unit 6). Surfaces visibly in the
 * chat as a chip — "team of specialists" mental model, not a black box.
 *
 * `core` = a real specialist scribe answered. `stub` = a registered-but-
 * not-built specialty fell back to its `referralFallbackMessage`. We omit
 * `unknown`/`refused` outcomes because those are the orchestrator
 * misusing the tool, not user-visible specialist consultation.
 */
export interface Referral {
  readonly status: 'core' | 'stub';
  readonly specialtyKey: string;
  /** Pre-resolved display name from the specialty registry. */
  readonly displayName: string;
  /** The specialist's response (or the stub's fallback message). */
  readonly response: string;
  /** Child-scribe audit ids — undefined for stubs (no scribe ran). */
  readonly requestId?: string;
  readonly classification?: SafetyClassification;
}

export interface DoneEvent {
  readonly type: 'done';
  readonly classification: SafetyClassification;
  readonly output: string;
  readonly citations: readonly Citation[];
  readonly topicKey: string | null;
  readonly assistantMessageId: string;
  /** Scribe request id (null on the out-of-scope path — no scribe ran). */
  readonly requestId: string | null;
  /** ScribeAudit row id (null on the out-of-scope path — no audit). */
  readonly auditId: string | null;
  /** Specialist consultations made during this turn. Empty when none. */
  readonly referrals: readonly Referral[];
  /** Validated next-step actions proposed by the scribe. Empty when none. */
  readonly actions: readonly ValidatedAction[];
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
}

export type TurnEvent = RoutedEvent | TokenEvent | DoneEvent | ErrorEvent;

/**
 * What we persist into `ChatMessage.metadata`. The JSON string in the
 * DB column decodes to one of these shapes depending on `role`.
 */
export interface UserMessageMetadata {
  readonly routed?: {
    readonly topicKey: string | null;
    readonly confidence: number;
    readonly reasoning: string;
  };
  readonly error?: string;
}

export interface AssistantMessageMetadata {
  readonly topicKey: string | null;
  readonly classification: SafetyClassification;
  readonly citations: readonly Citation[];
  readonly requestId?: string;
  readonly auditId?: string;
  /** Specialist consultations made during this turn (Plan 2026-04-25-001 Unit 6). */
  readonly referrals?: readonly Referral[];
  /** Validated next-step actions proposed by the scribe. Empty when none. */
  readonly actions?: readonly ValidatedAction[];
}
