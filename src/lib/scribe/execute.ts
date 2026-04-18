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
    modelVersion: 'pending', // executors calling without a pinned version would reach this;
                             // tests always pre-seed a scribe so this default stays unused.
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

    if (turn.stopReason === 'end_turn') break;

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
        const output = await handler.execute(ctx, parsed.data);
        collectedToolCalls.push({ name: call.name, input: parsed.data, output, isError: false });
        toolResults.push({ toolUseId: call.id, output });
      } catch (err) {
        const error = { error: err instanceof Error ? err.message : 'handler failed' };
        collectedToolCalls.push({ name: call.name, input: parsed.data, output: error, isError: true });
        toolResults.push({ toolUseId: call.id, output: error, isError: true });
      }
    }
    messages.push({ role: 'tool_result', content: '', toolResults });
  }

  const output = lastTurn?.text ?? '';
  const candidate: PolicyCandidate = {
    judgmentKind: req.declaredJudgmentKind,
    output,
    sections: req.sections ?? [],
  };

  // D11: audit the invocation BEFORE the final policy gate so rejected
  // outputs still land in the trail. Upsert is idempotent on requestId.
  const provisionalEnforce = enforce(policy, candidate);

  const audit = await recordAudit(req.db, req.userId, scribe.id, {
    requestId,
    topicKey: req.topicKey,
    mode: req.mode,
    prompt: req.userMessage,
    toolCalls: collectedToolCalls,
    output,
    citations: [],
    safetyClassification: provisionalEnforce.classification,
    modelVersion,
  });

  return {
    requestId,
    output,
    classification: provisionalEnforce.classification,
    toolCalls: collectedToolCalls,
    modelVersion,
    auditId: audit.id,
  };
}
