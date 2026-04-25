/**
 * Chat turn orchestration (U3).
 *
 * One user utterance drives the full pipeline: persist user message →
 * load recent history → route → either call the scribe `execute()` loop
 * or emit a safe-fallback out-of-scope response → persist assistant
 * message → yield events in order.
 *
 * Invariants:
 *   - The user message is persisted BEFORE anything that can throw, so
 *     a router or scribe failure never erases the user's input from
 *     history (R-D).
 *   - The assistant message is only persisted when a response actually
 *     ran to completion. On mid-stream failure the history has the
 *     user side only; the `error` metadata note on the user message
 *     is the durable record that something went wrong.
 *   - Every execute()-backed turn writes a `ScribeAudit` row via the
 *     existing D11 guarantee inside `execute()` — this wrapper never
 *     forges or duplicates audit rows.
 *   - Out-of-scope turns do NOT hit `execute()` and therefore do NOT
 *     write a ScribeAudit row; the ChatMessage metadata carries the
 *     classification + reasoning, which is the audit surface for the
 *     no-scribe path. R-F's "via the existing execute() path" wording
 *     anticipates this: only scribe invocations need ScribeAudit.
 */

import type { Citation } from '@/lib/topics/types';
import type { Db } from '@/lib/scribe/tools/types';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import { LLMClient } from '@/lib/llm/client';
import { execute, type ScribeLLMClient } from '@/lib/scribe/execute';
import { ScribeAuditWriteError } from '@/lib/scribe/repo';
import { parseScribeAnnotations } from '@/lib/scribe/annotations';
import { routeTurn, type RouteDecision } from '@/lib/scribe/router';
import { getSpecialty } from '@/lib/scribe/specialties/registry';
import { loadSpecialtySystemPrompt } from '@/lib/scribe/specialties/load-prompt';
import {
  DEFAULT_HISTORY_LIMIT,
  createChatMessage,
  loadRecentMessages,
  updateChatMessageMetadata,
} from './repo';
import type { Referral, TurnEvent } from './types';

/**
 * The same safe-fallback string the Explain SSE route uses, for a
 * consistent user-facing out-of-scope surface across chat and
 * topic-page explanations. Now used only when a scribe's own enforce()
 * verdict is non-clinical-safe; the router-null path resolves to the
 * general scribe instead of falling back to a static string.
 */
export const OUT_OF_SCOPE_FALLBACK =
  "I can't answer that here — I've suggested a prompt for your GP instead.";

/**
 * Topic key the chat layer routes to when the router returns null.
 * Centralised so future plan-level changes (e.g., a different fallback
 * specialty) only need updating in one place.
 */
export const FALLBACK_TOPIC_KEY = 'general';

/**
 * Map a router decision onto the topic the scribe should run under. The
 * router returns null when no specialist topic fits; the chat layer
 * resolves that to the general-care scribe so every conversation produces
 * a real, audited answer rather than a static dead-end string.
 */
export function resolveTopicKey(decision: RouteDecision): string {
  return decision.topicKey ?? FALLBACK_TOPIC_KEY;
}

export interface RunChatTurnInput {
  readonly db: Db;
  readonly userId: string;
  readonly text: string;
  /** Injection seam: the LLM client used by the router. */
  readonly routerLlm?: LLMClient;
  /** Injection seam: the tool-use LLM client used by `execute()`. */
  readonly scribeLlm: ScribeLLMClient;
  /** How many prior messages to pass to the router + scribe (default 10). */
  readonly historyLimit?: number;
  /** Injection seam for deterministic audit ids in tests. */
  readonly requestId?: string;
  /**
   * Cancellation signal. When aborted (client disconnect or wall-clock
   * budget), the generator stops yielding and the scribe loop short-
   * circuits at its next turn boundary. The user message is still
   * persisted if it was written before the abort; assistant persistence
   * is skipped to avoid orphaned rows for a conversation the user left.
   */
  readonly signal?: AbortSignal;
}

export async function* runChatTurn(
  input: RunChatTurnInput,
): AsyncGenerator<TurnEvent, void, void> {
  const { db, userId, scribeLlm, signal } = input;
  const text = input.text.trim();
  const historyLimit = input.historyLimit ?? DEFAULT_HISTORY_LIMIT;

  // 1. Persist the user message first so a later failure can't erase it.
  const userMessage = await createChatMessage(db, userId, 'user', text);

  if (signal?.aborted) {
    yield { type: 'error', message: abortMessage(signal) };
    return;
  }

  let decision: RouteDecision;
  try {
    // 2. Load prior history (excluding the just-persisted user message).
    const prior = await loadRecentMessages(db, userId, historyLimit + 1);
    const recent = prior
      .filter((m) => m.id !== userMessage.id)
      .slice(-historyLimit)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // 3. Route.
    decision = await routeTurn({ text, recent }, { llm: input.routerLlm });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'router failed';
    await updateChatMessageMetadata(db, userMessage.id, { error: message });
    yield { type: 'error', message };
    return;
  }

  // 4. Update the user message with the routing decision for audit.
  await updateChatMessageMetadata(db, userMessage.id, {
    routed: {
      topicKey: decision.topicKey,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    },
  });

  yield {
    type: 'routed',
    topicKey: decision.topicKey,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
  };

  if (signal?.aborted) {
    yield { type: 'error', message: abortMessage(signal) };
    return;
  }

  // 5. Scribe path — every conversation runs against a real specialty (the
  //    router's null is resolved to the general scribe). execute() owns
  //    the D11 audit write so every turn writes a ScribeAudit row.
  const topicKey = resolveTopicKey(decision);
  const systemPrompt = loadSpecialtySystemPrompt(topicKey);

  let result;
  try {
    result = await execute({
      db,
      userId,
      topicKey,
      mode: 'runtime',
      userMessage: text,
      declaredJudgmentKind: 'pattern-vs-own-history',
      llm: scribeLlm,
      requestId: input.requestId,
      systemPrompt,
      signal,
    });
  } catch (err) {
    // ScribeAuditWriteError is the structurally-load-bearing D11 breach;
    // every other error is a loop failure where execute() already wrote an
    // audit row with classification `rejected`. In both cases we surface
    // an error event and skip persisting an assistant message.
    const message =
      err instanceof ScribeAuditWriteError
        ? `audit write failed: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'scribe execution failed';
    await updateChatMessageMetadata(db, userMessage.id, {
      routed: {
        topicKey: decision.topicKey,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
      },
      error: message,
    });
    yield { type: 'error', message };
    return;
  }

  // 6. Rejection-safe surfacing: unsafe outputs never stream to the user.
  const visibleOutput =
    result.classification === 'clinical-safe' ? result.output : OUT_OF_SCOPE_FALLBACK;
  const visibleCitations: readonly Citation[] =
    result.classification === 'clinical-safe' ? extractCitations(result.output) : [];

  // Referrals — derived from the orchestrating scribe's tool calls.
  // Only surface them when the parent turn was clinical-safe; if the
  // parent rejected, the referral context is part of a hidden output
  // and the chat UX shows the OOS fallback string instead.
  const referrals: readonly Referral[] =
    result.classification === 'clinical-safe' ? collectReferrals(result.toolCalls) : [];

  for (const chunk of chunkForStream(visibleOutput)) {
    yield { type: 'token', text: chunk };
  }

  // 7. Persist the assistant message. The audit row has already landed
  //    (D11) so a persistence failure is a history-only gap, not a safety
  //    gap. Retry once with a short backoff to paper over transient
  //    Postgres flakes before surfacing an error; on a persistent
  //    failure the error event tells the UI to retry.
  let assistantMessage;
  try {
    assistantMessage = await persistAssistantMessage(db, userId, visibleOutput, {
      topicKey,
      classification: result.classification,
      citations: visibleCitations,
      requestId: result.requestId,
      auditId: result.auditId,
      referrals,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant persistence failed';
    yield { type: 'error', message };
    return;
  }

  yield {
    type: 'done',
    classification: result.classification,
    output: visibleOutput,
    citations: visibleCitations,
    topicKey,
    assistantMessageId: assistantMessage.id,
    requestId: result.requestId,
    auditId: result.auditId,
    referrals,
  };
}

/**
 * Walk the orchestrator's recorded tool calls and pull out successful
 * `refer_to_specialist` outputs. We surface only `core` and `stub` —
 * `unknown` and `refused` outcomes are tool misuse, not specialist
 * consultations the user should see attributed.
 */
function collectReferrals(
  toolCalls: ReadonlyArray<{ name: string; output: unknown; isError: boolean }>,
): Referral[] {
  const out: Referral[] = [];
  for (const call of toolCalls) {
    if (call.name !== 'refer_to_specialist' || call.isError) continue;
    const payload = call.output as
      | {
          status?: 'core' | 'stub' | 'unknown' | 'refused';
          specialtyKey?: string;
          response?: string;
          requestId?: string;
          classification?: 'clinical-safe' | 'out-of-scope-routed' | 'rejected';
        }
      | null
      | undefined;
    if (!payload) continue;
    if (payload.status !== 'core' && payload.status !== 'stub') continue;
    if (!payload.specialtyKey || !payload.response) continue;

    const specialty = getSpecialty(payload.specialtyKey);
    if (!specialty) continue; // dropped from registry between call and surfacing

    out.push({
      status: payload.status,
      specialtyKey: payload.specialtyKey,
      displayName: specialty.displayName,
      response: payload.response,
      requestId: payload.requestId,
      classification: payload.classification,
    });
  }
  return out;
}

/**
 * Persist the assistant message with a single retry on transient failures.
 * The scribe audit row is already written before this runs (D11), so any
 * failure here is purely a chat-history drift — we want to retry cheap
 * before giving up rather than ship a ghost assistant turn.
 */
async function persistAssistantMessage(
  db: Db,
  userId: string,
  output: string,
  metadata: {
    topicKey: string;
    classification: SafetyClassification;
    citations: readonly Citation[];
    requestId: string;
    auditId: string;
    referrals: readonly Referral[];
  },
) {
  try {
    return await createChatMessage(db, userId, 'assistant', output, metadata);
  } catch (err) {
    // One short backoff then a final attempt. The error rethrown on a
    // second failure surfaces to the caller for the error event path.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return await createChatMessage(db, userId, 'assistant', output, metadata);
  }
}

function abortMessage(signal: AbortSignal): string {
  const reason = signal.reason;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'chat turn cancelled';
}

function extractCitations(output: string): Citation[] {
  const { annotations } = parseScribeAnnotations(output);
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const ann of annotations) {
    for (const c of ann.citations) {
      const key = `${c.nodeId}:${c.chunkId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function chunkForStream(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((chunk) => chunk.length > 0);
}
