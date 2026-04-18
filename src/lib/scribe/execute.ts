/**
 * Scribe executor — the single place where a scribe invocation is orchestrated
 * end-to-end. Compile-time and runtime callers both funnel through `execute()`
 * so the three invariants that matter for clinical safety live in one file:
 *
 *   D10 (user-scoping): `execute()` resolves `userId` + `topicKey` once at
 *     entry and threads them through every tool-handler call. Tool handlers
 *     themselves require a populated `ToolContext`; you cannot call a handler
 *     without it without a type error. Cross-user leakage becomes structurally
 *     impossible rather than per-handler-testable.
 *
 *   D11 (audit-before-gate): `ScribeAudit` is upserted by `requestId` BEFORE
 *     the final `enforce(policy, output)` check. A rejected output still
 *     lands in the audit trail; a client disconnecting mid-stream cannot
 *     produce a missing audit. The upsert is idempotent on `requestId` so a
 *     retry folds into the same row.
 *
 *   Tool-call loop: a minimal `ScribeLLMClient` interface models the bounded
 *     tool-use loop (`turn → tool_use | end_turn`). Tests inject a
 *     deterministic fake; production wiring (Anthropic/OpenRouter adapter)
 *     lives in U4 wiring. We avoid taking a direct dependency on the
 *     structured-output `LLMClient` in `src/lib/llm/client.ts` — that client
 *     is single-shot forced-tool-use, not multi-turn.
 */
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import {
  DEFAULT_SCRIBE_MODEL,
  DEFAULT_SCRIBE_TEMPERATURE,
  getOrCreateScribeForTopic,
  recordAudit,
  SCRIBE_MODEL_VERSION_PENDING,
  ScribeAuditWriteError,
  type ScribeMode,
} from './repo';
import { enforce } from './policy/enforce';
import { getPolicy } from './policy/registry';
import type {
  JudgmentKind,
  PolicyCandidate,
  SafetyClassification,
  SafetyPolicy,
} from './policy/types';
import { getToolHandler, listToolDefinitions } from './tool-catalog';
import type { Db, ToolContext } from './tools/types';
import { parseScribeAnnotations } from './annotations';
import type { Citation } from '@/lib/topics/types';

export const DEFAULT_MAX_TOOL_CALLS = 6;

export interface ScribeLLMToolDefinition {
  name: string;
  description: string;
  /** Zod schema the LLM adapter will serialise into its provider-specific JSON Schema. */
  parameters: ZodType<unknown>;
}

export interface ScribeLLMToolCall {
  /** Provider-assigned id for the tool_use block. */
  id: string;
  name: string;
  input: unknown;
}

export interface ScribeLLMToolResult {
  toolUseId: string;
  output: unknown;
  isError?: boolean;
}

export interface ScribeLLMMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolCalls?: ScribeLLMToolCall[];
  toolResults?: ScribeLLMToolResult[];
}

export interface ScribeLLMTurnRequest {
  system: string;
  messages: readonly ScribeLLMMessage[];
  tools: readonly ScribeLLMToolDefinition[];
  model: string;
  temperature: number;
}

export type ScribeLLMStopReason = 'tool_use' | 'end_turn';

export interface ScribeLLMTurn {
  stopReason: ScribeLLMStopReason;
  /** Text emitted by the assistant this turn (may be empty on tool_use turns). */
  text: string;
  /** Tool calls the assistant wants the executor to run. Empty on end_turn. */
  toolCalls: readonly ScribeLLMToolCall[];
  /** The resolved model version string actually used for this call (D9). */
  modelVersion: string;
}

export interface ScribeLLMClient {
  turn(req: ScribeLLMTurnRequest): Promise<ScribeLLMTurn>;
}

export interface ScribeExecuteRequest {
  db: Db;
  userId: string;
  topicKey: string;
  mode: ScribeMode;
  /** User prompt or compile directive, depending on `mode`. */
  userMessage: string;
  /** Judgment the scribe claims to be making; used as the policy candidate.judgmentKind. */
  declaredJudgmentKind: JudgmentKind | null;
  /** Section breakdown for the citation-density check. Empty means 'no sections'. */
  sections?: PolicyCandidate['sections'];
  llm: ScribeLLMClient;
  /** Optional override — tests / loop bounds. */
  maxToolCalls?: number;
  /** Optional override — tests set this, production generates a UUIDv4. */
  requestId?: string;
  /** System prompt; if omitted, a default scope-of-practice prompt is built. */
  systemPrompt?: string;
}

export interface ScribeExecuteResult {
  requestId: string;
  output: string;
  classification: SafetyClassification;
  toolCalls: Array<{ name: string; input: unknown; output: unknown; isError: boolean }>;
  modelVersion: string;
  auditId: string;
}

function buildSystemPrompt(policy: SafetyPolicy, override?: string): string {
  if (override) return override;
  return [
    `You are the specialist scribe for topic "${policy.topicKey}".`,
    `You may only make judgments of these kinds: ${policy.allowedJudgmentKinds.join(', ')}.`,
    `Anything outside your scope must be routed to out-of-scope via the route_to_gp_prep tool.`,
    `Never name medications or dosages. Never use imperative treatment verbs.`,
    `Every claim must resolve to a graph-node citation you surfaced with get_node_provenance.`,
  ].join(' ');
}

export async function execute(req: ScribeExecuteRequest): Promise<ScribeExecuteResult> {
  if (!req.userId) throw new Error('scribe.execute: userId is required (D10)');
  if (!req.topicKey) throw new Error('scribe.execute: topicKey is required (D10)');

  const policy = getPolicy(req.topicKey);
  if (!policy) {
    throw new Error(`scribe.execute: no safety policy registered for topicKey '${req.topicKey}'`);
  }

  // D10: fix the context once; every handler call below uses exactly this ctx.
  const ctx: ToolContext = { db: req.db, userId: req.userId, topicKey: req.topicKey };

  const scribe = await getOrCreateScribeForTopic(req.db, req.userId, req.topicKey, {
    modelVersion: SCRIBE_MODEL_VERSION_PENDING, // executors calling without a pinned version would
                                                // reach this; tests always pre-seed a scribe so
                                                // this default stays unused.
  });

  const requestId = req.requestId ?? randomUUID();
  const system = buildSystemPrompt(policy, req.systemPrompt);
  const tools: ScribeLLMToolDefinition[] = listToolDefinitions();

  const messages: ScribeLLMMessage[] = [
    { role: 'user', content: req.userMessage },
  ];

  const collectedToolCalls: ScribeExecuteResult['toolCalls'] = [];
  const maxCalls = req.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;

  let lastTurn: ScribeLLMTurn | null = null;
  let modelVersion = scribe.modelVersion;
  let output = '';
  let classification: SafetyClassification = 'rejected';
  let loopError: unknown = null;

  // D11: every exit path below MUST fall through to the recordAudit call so a
  // thrown LLM loop or a thrown enforce still lands a row. We capture the
  // error, default classification to 'rejected' (any thrown path produced no
  // clinically-safe output), record the audit, then rethrow.
  try {
    for (let step = 0; step < maxCalls + 1; step++) {
      const turn = await req.llm.turn({
        system,
        messages,
        tools,
        model: scribe.model ?? DEFAULT_SCRIBE_MODEL,
        temperature: scribe.temperature ?? DEFAULT_SCRIBE_TEMPERATURE,
      });
      lastTurn = turn;
      modelVersion = turn.modelVersion;

      if (turn.stopReason === 'end_turn') {
        if (turn.toolCalls.length > 0) {
          // A clean end_turn must not carry pending tool_use blocks — if the
          // provider returned both, we'd silently drop the tool calls on the
          // floor. Fail loud so the audit trail records the bad shape.
          throw new Error(
            'scribe.execute: LLM returned end_turn with non-empty tool_calls (ambiguous stop reason)',
          );
        }
        break;
      }

      if (turn.toolCalls.length === 0) {
        throw new Error('scribe.execute: LLM returned tool_use stop with no tool_calls');
      }
      if (step === maxCalls) {
        throw new Error(
          `scribe.execute: exceeded maxToolCalls=${maxCalls} without end_turn`,
        );
      }

      messages.push({
        role: 'assistant',
        content: turn.text,
        toolCalls: [...turn.toolCalls],
      });

      const toolResults: ScribeLLMToolResult[] = [];
      for (const call of turn.toolCalls) {
        const handler = getToolHandler(call.name);
        if (!handler) {
          const error = { error: `unknown tool '${call.name}'` };
          collectedToolCalls.push({ name: call.name, input: call.input, output: error, isError: true });
          toolResults.push({ toolUseId: call.id, output: error, isError: true });
          continue;
        }
        const parsed = handler.parameters.safeParse(call.input);
        if (!parsed.success) {
          const error = { error: 'invalid tool input', detail: parsed.error.message };
          collectedToolCalls.push({ name: call.name, input: call.input, output: error, isError: true });
          toolResults.push({ toolUseId: call.id, output: error, isError: true });
          continue;
        }
        try {
          const toolOutput = await handler.execute(ctx, parsed.data);
          collectedToolCalls.push({ name: call.name, input: parsed.data, output: toolOutput, isError: false });
          toolResults.push({ toolUseId: call.id, output: toolOutput });
        } catch (err) {
          const error = { error: err instanceof Error ? err.message : 'handler failed' };
          collectedToolCalls.push({ name: call.name, input: parsed.data, output: error, isError: true });
          toolResults.push({ toolUseId: call.id, output: error, isError: true });
        }
      }
      messages.push({ role: 'tool_result', content: '', toolResults });
    }

    output = lastTurn?.text ?? '';
    const candidate: PolicyCandidate = {
      judgmentKind: req.declaredJudgmentKind,
      output,
      sections: req.sections ?? [],
    };
    classification = enforce(policy, candidate).classification;
  } catch (err) {
    loopError = err;
    output = lastTurn?.text ?? '';
    classification = 'rejected';
  }

  // D11: audit lands on every code path — success, throw, or rejection.
  // Upsert is idempotent on requestId so retries fold into the same row.
  // Citations are extracted from the scribe's ANNOTATIONS_JSON block when
  // present (compile-time pass); the runtime-scribe path emits no annotation
  // block so citations stays empty and U5 will surface runtime citations
  // through its own extraction. Parse failures degrade to `[]` rather than
  // losing the audit row — the partial audit is still R19-compliant.
  const citations = extractCitationsFromOutput(output);
  let audit: Awaited<ReturnType<typeof recordAudit>>;
  try {
    audit = await recordAudit(req.db, req.userId, scribe.id, {
      requestId,
      topicKey: req.topicKey,
      mode: req.mode,
      prompt: req.userMessage,
      toolCalls: collectedToolCalls,
      output,
      citations,
      safetyClassification: classification,
      modelVersion,
    });
  } catch (auditErr) {
    // D11 breach: audit-before-gate failed to persist. Surface distinctly so
    // upstream (route handler, compile pipeline) can log the regulatory gap
    // separately from a scribe-loop failure. Include the prior loop error in
    // the message so diagnostics keep the full causal chain.
    const loopContext =
      loopError instanceof Error ? ` (prior loop error: ${loopError.message})` : '';
    throw new ScribeAuditWriteError(
      `scribe.execute: failed to persist audit for requestId=${requestId}${loopContext}`,
      auditErr,
    );
  }

  if (loopError) throw loopError;

  return {
    requestId,
    output,
    classification,
    toolCalls: collectedToolCalls,
    modelVersion,
    auditId: audit.id,
  };
}

/**
 * Collect citations referenced by any annotation in the scribe's output
 * block, deduped by `(nodeId, chunkId)`. A malformed or missing block
 * yields `[]` — the audit row still writes, just without citations. The
 * R19 audit compliance requirement is "citations recorded when present",
 * not "reject the whole write when parsing fails".
 */
function extractCitationsFromOutput(output: string): Citation[] {
  const { annotations } = parseScribeAnnotations(output);
  if (annotations.length === 0) return [];
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const ann of annotations) {
    for (const citation of ann.citations) {
      const key = `${citation.nodeId}:${citation.chunkId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(citation);
    }
  }
  return out;
}
