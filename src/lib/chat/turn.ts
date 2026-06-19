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
import {
  buildDefaultScribeSystemPrompt,
  execute,
  type ScribeLLMClient,
} from '@/lib/scribe/execute';
import { appendAskAnswerStylePrompt } from '@/lib/chat/answer-style';
import { getPolicy } from '@/lib/scribe/policy/registry';
import { ScribeAuditWriteError } from '@/lib/scribe/repo';
import { routeTurn, type RouteDecision } from '@/lib/scribe/router';
import { getSpecialty } from '@/lib/scribe/specialties/registry';
import { loadSpecialtySystemPrompt } from '@/lib/scribe/specialties/load-prompt';
import { assembleUserContext } from '@/lib/chat/user-context';
import type { ValidatedAction } from '@/lib/scribe/tools/propose-next-steps';
import { env } from '@/lib/env';
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
 * Appended to the system prompt on a one-shot remedial retry when a chat turn
 * was rejected for a forbidden phrase (a named drug/supplement/dose in the
 * prose). Names exactly what tripped so the model can rewrite cleanly —
 * mirrors the topic-page compile's remedial loop (`buildRemedialPrompt`).
 */
const REMEDIAL_ADDENDUM = [
  'IMPORTANT — your previous reply was discarded because it named a medication,',
  'supplement, or dose. Rewrite the answer with NONE of those: give the behaviour',
  'and lifestyle guidance directly, and for anything pharmacological say only that',
  'it is best decided with a clinician — naming no specific product, compound,',
  'brand, or dose.',
].join(' ');

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
  //
  //    ASK_DEEP_ENABLED is the single gate for ALL Phase A behavior. It must
  //    be a strict `=== 'true'` comparison (matching LIBRE_ENABLED) — any
  //    other value ('false', '0', '') leaves the flag OFF and the turn
  //    byte-for-byte identical to pre-Phase-A behaviour. Read from
  //    process.env first (test seam) then the frozen env snapshot.
  const askDeep = (process.env.ASK_DEEP_ENABLED ?? env.ASK_DEEP_ENABLED) === 'true';

  const topicKey = resolveTopicKey(decision);
  // answerShape-derived behaviour is gated by the flag. Off → shape forced
  // 'standard', judgment kind stays the legacy 'pattern-vs-own-history',
  // no investigations prompt suffix, default token budget.
  const answerShape = askDeep ? (decision.answerShape ?? undefined) : 'standard';
  const systemPrompt = buildAskRuntimeSystemPrompt(topicKey, answerShape);
  // Shape → judgment kind (orchestrator declares, never the LLM).
  const declaredJudgmentKind = answerShape === 'investigations'
    ? 'investigation-avenues'
    : 'pattern-vs-own-history';

  // Phase A context digest — only when the feature flag is on. Assembly must
  // never block a turn (degrade to no-preamble on failure). Compile and
  // referral child turns never carry a preamble — only turn.ts sets it.
  let contextPreamble: string | undefined;
  if (askDeep) {
    try {
      contextPreamble = await assembleUserContext(db, userId) ?? undefined;
    } catch (err) {
      console.error('[turn] context digest assembly failed:', err);
      // Degrade gracefully — the turn proceeds without context.
    }
  }

  // Investigations answers are deeper — raise the token budget so they're
  // not silently truncated at the default 2048.
  const maxTokens = answerShape === 'investigations' ? 4096 : undefined;

  let result;
  try {
    result = await execute({
      db,
      userId,
      topicKey,
      mode: 'runtime',
      userMessage: text,
      declaredJudgmentKind,
      llm: scribeLlm,
      requestId: input.requestId,
      systemPrompt,
      signal,
      contextPreamble,
      maxTokens,
      // Only chat turns with the flag ON may offer propose_next_steps to the
      // LLM. Compile, explain, and referral-child invocations never set this,
      // so the tool stays absent from their tool-definition list and is
      // undispatchable. Flag off → tool absent even on chat turns.
      enableProposeNextSteps: askDeep,
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

  // 5b. Remedial retry — a turn rejected for a forbidden phrase (a named
  //     drug/supplement/dose in the prose) would otherwise discard the WHOLE
  //     answer, hygiene next-steps and all, and show the user a dead-end. Retry
  //     ONCE with a remedial addendum naming what tripped, then re-enforce.
  //     A FRESH requestId (not the rejected attempt's) so recordAudit — which
  //     is write-once per (scribeId, requestId) — records BOTH the rejected
  //     attempt and the retry honestly; the surfaced answer maps to the retry's
  //     row. Strictly a safety net: a recovered retry is clinical-safe; a still-
  //     failing retry leaves the original verdict untouched (no worse than
  //     before). Only 'rejected' is retried — 'out-of-scope-routed' is a
  //     legitimate clinician route, not a recoverable error. Needs a base
  //     systemPrompt to append to (always present for real topics).
  if (result.classification === 'rejected' && systemPrompt && !signal?.aborted) {
    try {
      const retry = await execute({
        db,
        userId,
        topicKey,
        mode: 'runtime',
        userMessage: text,
        declaredJudgmentKind,
        llm: scribeLlm,
        systemPrompt: `${systemPrompt}\n\n${REMEDIAL_ADDENDUM}`,
        signal,
        contextPreamble,
        maxTokens,
        enableProposeNextSteps: askDeep,
      });
      if (retry.classification === 'clinical-safe') {
        result = retry;
      }
    } catch {
      // Retry failure (LLM error, audit write) is non-fatal — keep the original
      // rejected result and fall through to the out-of-scope fallback below.
    }
  }

  // 6. Rejection-safe surfacing: unsafe outputs never stream to the user.
  const visibleOutput =
    result.classification === 'clinical-safe' ? result.output : OUT_OF_SCOPE_FALLBACK;
  const visibleCitations: readonly Citation[] =
    result.classification === 'clinical-safe' ? result.citations : [];

  // Referrals — derived from the orchestrating scribe's tool calls.
  // Only surface them when the parent turn was clinical-safe; if the
  // parent rejected, the referral context is part of a hidden output
  // and the chat UX shows the OOS fallback string instead.
  const referrals: readonly Referral[] =
    result.classification === 'clinical-safe' ? collectReferrals(result.toolCalls) : [];

  // Actions — only surfacing (and persisting) when clinical-safe.
  const actions: readonly ValidatedAction[] =
    result.classification === 'clinical-safe' ? result.proposedActions : [];

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
      actions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant persistence failed';
    yield { type: 'error', message };
    return;
  }

  // 8. Persist Action rows (only when clinical-safe, after ChatMessage exists).
  //    If the answer was rejected, proposedActions is empty so this is a no-op.
  //    ChatMessage.id is the FK provenance. Ordering: message first, then actions
  //    — a message persistence failure leaves zero action rows.
  //
  //    The done event must reflect DB state: if persistence fails, the client
  //    must NOT show actions that aren't durably stored (it can't reconcile
  //    them on reload). On failure we emit actions: [] but keep the turn alive
  //    — the answer already landed; missing actions are a UX degradation, not
  //    a safety gap.
  let emittedActions: readonly ValidatedAction[] = actions;
  if (actions.length > 0) {
    try {
      await persistSuggestedActions(db, userId, assistantMessage.id, result.requestId, actions);
    } catch (err) {
      console.error('[turn] action persistence failed (non-fatal):', err);
      emittedActions = [];
    }
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
    actions: emittedActions,
    ...(result.truncated ? { truncated: true } : {}),
  };
}

function buildAskRuntimeSystemPrompt(
  topicKey: string,
  answerShape?: 'standard' | 'investigations',
): string | undefined {
  const specialtyPrompt = loadSpecialtySystemPrompt(topicKey);
  const base = specialtyPrompt
    ?? (getPolicy(topicKey) ? buildDefaultScribeSystemPrompt(getPolicy(topicKey)!) : undefined);
  if (!base) return undefined;

  let prompt = appendAskAnswerStylePrompt(base);
  if (answerShape === 'investigations') {
    prompt += '\n\n' + INVESTIGATIONS_PROMPT_SUFFIX;
  }
  return prompt;
}

/**
 * Investigations prompt suffix — appended to the system prompt when the
 * router selects the investigations shape. Instructs the scribe to present
 * avenues in measurement-yield order, use the user's own data, name the
 * distinguishing test, and avoid likelihood language.
 *
 * Inline rather than a separate file — short enough (~400 chars) that a
 * file read adds latency without adding clarity. May move to a markdown
 * module if it grows beyond a paragraph.
 */
const INVESTIGATIONS_PROMPT_SUFFIX = [
  'INVESTIGATIONS MODE — you are presenting possible avenues worth pursuing, not diagnosing.',
  'For each avenue:',
  '  - Name the user\'s own data point that suggests it (from the context block, pattern tool, or graph tools).',
  '  - Name the distinguishing measurement or test that would clarify it. Prefer measurements already available in the user\'s data profile. If none match, name the most common accessible test.',
  '  - Do NOT rank, label, or order by likelihood. No "most likely," "primary," "secondary," "probable," "possible."',
  '  - Cite at least one source per avenue (graph node, check-in, or context digest).',
  'After the avenues, call propose_next_steps with 2–4 typed next steps from the user\'s actual data.',
].join('\n');

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
    actions: readonly ValidatedAction[];
  },
) {
  try {
    return await createChatMessage(db, userId, 'assistant', output, metadata);
  } catch {
    // One short backoff then a final attempt. The error rethrown on a
    // second failure surfaces to the caller for the error event path.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return await createChatMessage(db, userId, 'assistant', output, metadata);
  }
}

/**
 * Persist validated suggested actions. Called ONLY after ChatMessage exists
 * and enforce() returned clinical-safe. A failure here is non-fatal — the
 * answer already landed; missing actions are a UX degradation, not a safety gap.
 */
async function persistSuggestedActions(
  db: Db,
  userId: string,
  chatMessageId: string,
  scribeRequestId: string,
  actions: readonly ValidatedAction[],
): Promise<void> {
  await db.action.createMany({
    data: actions.map((a) => ({
      userId,
      chatMessageId,
      scribeRequestId,
      verb: a.verb,
      label: a.label,
      markerName: a.markerName ?? null,
      state: 'suggested',
    })),
  });
}

function abortMessage(signal: AbortSignal): string {
  const reason = signal.reason;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'chat turn cancelled';
}

function chunkForStream(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((chunk) => chunk.length > 0);
}
