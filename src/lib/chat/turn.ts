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
}

export async function* runChatTurn(
  input: RunChatTurnInput,
): AsyncGenerator<TurnEvent, void, void> {
  const { db, userId, scribeLlm } = input;
  const text = input.text.trim();
  const historyLimit = input.historyLimit ?? DEFAULT_HISTORY_LIMIT;

  // 1. Persist the user message first so a later failure can't erase it.
  const userMessage = await createChatMessage(db, userId, 'user', text);

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

  // 5a. Out-of-scope path — no scribe, no ScribeAudit; chat message is the record.
  if (decision.topicKey === null) {
    for (const chunk of chunkForStream(OUT_OF_SCOPE_FALLBACK)) {
      yield { type: 'token', text: chunk };
    }
    const assistantMessage = await createChatMessage(
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
    yield {
      type: 'done',
      classification: 'out-of-scope-routed',
      output: OUT_OF_SCOPE_FALLBACK,
      citations: [],
      topicKey: null,
      assistantMessageId: assistantMessage.id,
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

  // 7. Persist the assistant message. If this DB write fails the audit
  //    row still exists (D11) — the chat history is the only surface
  //    that's out of sync, and the error event tells the UI to retry.
  let assistantMessage;
  try {
    assistantMessage = await createChatMessage(db, userId, 'assistant', visibleOutput, {
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
  };
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
