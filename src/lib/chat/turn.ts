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
import {
  DEFAULT_HISTORY_LIMIT,
  createChatMessage,
  loadRecentMessages,
  updateChatMessageMetadata,
} from './repo';
import type { TurnEvent } from './types';

/**
 * The same safe-fallback string the Explain SSE route uses, for a
 * consistent user-facing out-of-scope surface across chat and
 * topic-page explanations.
 */
export const OUT_OF_SCOPE_FALLBACK =
  "I can't answer that here — I've suggested a prompt for your GP instead.";

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

  // 5a. Out-of-scope path — no scribe, no ScribeAudit; chat message is the record.
  if (decision.topicKey === null) {
    for (const chunk of chunkForStream(OUT_OF_SCOPE_FALLBACK)) {
      yield { type: 'token', text: chunk };
    }
    let assistantMessage;
    try {
      assistantMessage = await createChatMessage(
        db,
        userId,
        'assistant',
        OUT_OF_SCOPE_FALLBACK,
        {
          topicKey: null,
          classification: 'out-of-scope-routed',
          citations: [],
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'assistant persistence failed';
      yield { type: 'error', message };
      return;
    }
    yield {
      type: 'done',
      classification: 'out-of-scope-routed',
      output: OUT_OF_SCOPE_FALLBACK,
      citations: [],
      topicKey: null,
      assistantMessageId: assistantMessage.id,
      requestId: null,
      auditId: null,
    };
    return;
  }

  // 5b. Scribe path — execute() owns the D11 audit write.
  let result;
  try {
    result = await execute({
      db,
      userId,
      topicKey: decision.topicKey,
      mode: 'runtime',
      userMessage: text,
      declaredJudgmentKind: 'pattern-vs-own-history',
      llm: scribeLlm,
      requestId: input.requestId,
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
      topicKey: decision.topicKey,
      classification: result.classification,
      citations: visibleCitations,
      requestId: result.requestId,
      auditId: result.auditId,
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
    topicKey: decision.topicKey,
    assistantMessageId: assistantMessage.id,
    requestId: result.requestId,
    auditId: result.auditId,
  };
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
