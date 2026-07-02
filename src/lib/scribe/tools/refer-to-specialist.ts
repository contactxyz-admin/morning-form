/**
 * `refer_to_specialist` — the general scribe's lever for pulling a core
 * specialist into a turn. Plan 2026-04-25-001 Unit 5.
 *
 * Three structural invariants live here:
 *
 *   1. **Depth-1 referrals.** Only the general scribe (`ctx.topicKey ===
 *      'general'`) may refer. Specialists invoking this tool are refused
 *      with `REFERRAL_DEPTH_VIOLATION`. This is enforced by topicKey rather
 *      than a runtime depth counter — a specialist's ctx.topicKey simply is
 *      not 'general', so the gate is structural, not policy.
 *
 *   2. **No self-referral.** `general -> general` would loop. Refused with
 *      `REFERRAL_TOPIC_VIOLATION`.
 *
 *   3. **Audit chain.** Successful core referrals call `execute()` with
 *      `parentRequestId: ctx.requestId`. The child audit row records the
 *      parent's requestId so the chain (`parent.requestId -> child.parentRequestId`)
 *      is queryable for the audit trail.
 *
 * Stub specialties return their `referralFallbackMessage` without invoking
 * a scribe — the general scribe gets a visible "not yet built" string and
 * must answer with its own knowledge. No child audit row is written for
 * stub or unknown specialties.
 *
 * Test seam: production wiring will set the runtime ScribeLLMClient via
 * `__setReferralScribeLLMForTest` (or its production-path equivalent at app
 * boot). Tests inject a scripted client to make the tool deterministic.
 */
import { z } from 'zod';
// `execute` is loaded dynamically at handler-call time to avoid the
// circular import: `execute.ts` -> `tool-catalog.ts` -> `refer-to-specialist.ts`.
// Static `import type` is fine — types do not run at module-init time.
import type { ScribeLLMClient } from '../execute';
import { getScribeLLMClient } from '../llm';
import { getSpecialty } from '../specialties/registry';
import { loadSpecialtySystemPrompt } from '../specialties/load-prompt';
import type { ToolContext, ToolHandler } from './types';
import { appendAskAnswerStylePrompt } from '@/lib/chat/answer-style';

export const REFERRAL_DEPTH_VIOLATION =
  'refer_to_specialist may only be called by the general scribe. Specialists answer directly within their own scope.';

export const REFERRAL_TOPIC_VIOLATION =
  'refer_to_specialist cannot refer the general scribe to itself.';

/**
 * Surfaced in place of a child specialist's raw text when the child's output
 * was classified `rejected` (a forbidden-phrase hit). The referral surface
 * (`collectReferrals` → `ReferralChip`) renders `response` verbatim and does
 * NOT gate on the child's classification, so the raw rejected text would
 * otherwise reach the user. Descriptive + in-lane.
 */
export const REFERRAL_REJECTED_FALLBACK =
  "This specialist's detailed reply was withheld for safety — the relevant points are worth raising with your clinician.";

export const referToSpecialistSchema = z.object({
  specialtyKey: z.string().min(1).max(64),
  question: z.string().min(1).max(2000),
});

export type ReferToSpecialistArgs = z.infer<typeof referToSpecialistSchema>;

export type ReferToSpecialistResult =
  | {
      status: 'core';
      specialtyKey: string;
      response: string;
      requestId: string;
      classification: 'clinical-safe' | 'out-of-scope-routed' | 'rejected';
    }
  | {
      status: 'stub';
      specialtyKey: string;
      response: string;
      requestId?: undefined;
      classification?: undefined;
    }
  | {
      status: 'unknown';
      specialtyKey?: undefined;
      response: string;
      requestId?: undefined;
      classification?: undefined;
    }
  | {
      status: 'refused';
      specialtyKey?: undefined;
      response: string;
      requestId?: undefined;
      classification?: undefined;
    };

let referralScribeLLM: ScribeLLMClient | null = null;

/**
 * Test seam — inject a scripted ScribeLLMClient. Production wiring (when it
 * lands) should set the same module-level via its own setter at app boot
 * rather than reusing the test name.
 */
export function __setReferralScribeLLMForTest(client: ScribeLLMClient | null): void {
  referralScribeLLM = client;
}

/**
 * Lazy-resolve the production ScribeLLMClient. Returns null when no key is
 * configured — the tool responds with a `refused` error shape so the turn
 * continues gracefully rather than crashing.
 */
function resolveProductionClient(): ScribeLLMClient | null {
  try {
    return getScribeLLMClient();
  } catch {
    return null;
  }
}

export const referToSpecialistHandler: ToolHandler<ReferToSpecialistArgs, ReferToSpecialistResult> = {
  name: 'refer_to_specialist',
  description:
    'Refer the current question to a core specialist scribe (cardiometabolic, sleep-recovery, hormonal-endocrine, medication-supplement). Returns the specialist\'s response. Only callable by the general scribe; specialists answer directly. Stub specialties return a visible fallback message — answer the user with general-scribe knowledge in that case.',
  parameters: referToSpecialistSchema,
  async execute(ctx: ToolContext, args: ReferToSpecialistArgs): Promise<ReferToSpecialistResult> {
    if (ctx.topicKey !== 'general') {
      return { status: 'refused', response: REFERRAL_DEPTH_VIOLATION };
    }
    if (args.specialtyKey === 'general') {
      return { status: 'refused', response: REFERRAL_TOPIC_VIOLATION };
    }

    const specialty = getSpecialty(args.specialtyKey);
    if (!specialty) {
      return {
        status: 'unknown',
        response: `no specialty registered for key '${args.specialtyKey}'`,
      };
    }

    if (specialty.status === 'stub') {
      return {
        status: 'stub',
        specialtyKey: specialty.key,
        response: specialty.referralFallbackMessage ?? 'Specialist is not yet built.',
      };
    }

    // Core specialty — run the specialist scribe.
    // Lazy-resolve: test seam first, then production factory. Neither
    // in-scope → tool returns an error shape so the turn continues (the
    // general scribe must answer with its own knowledge instead of
    // crashing the turn).
    const client = referralScribeLLM ?? resolveProductionClient();
    if (!client) {
      return {
        status: 'refused',
        response: 'refer_to_specialist: no ScribeLLMClient configured. Production wiring or a test seam must set one before invoking the tool.',
      };
    }

    const { execute } = await import('../execute');
    const specialtyPrompt = loadSpecialtySystemPrompt(specialty.key);
    const result = await execute({
      db: ctx.db,
      userId: ctx.userId,
      topicKey: specialty.key,
      mode: 'runtime',
      userMessage: args.question,
      declaredJudgmentKind: null,
      llm: client,
      // Referral responses are surfaced inside Ask referral chips, so child
      // specialists need the same answer-shape contract as the parent turn.
      systemPrompt: specialtyPrompt
        ? appendAskAnswerStylePrompt(specialtyPrompt)
        : specialtyPrompt,
      parentRequestId: ctx.requestId,
      // Forward the parent's cancellation signal so an aborted parent turn
      // also short-circuits the child specialist loop.
      signal: ctx.signal,
      // Forward demographics so the child specialist ranges markers by the same
      // sex/age as the parent (A6). Already on ctx — no extra load.
      sexAtBirth: ctx.sexAtBirth,
      birthYear: ctx.birthYear,
    });

    // Safety net: a child whose output the forbidden-phrase scan rejected must
    // never be surfaced raw. The referral surface renders `response` verbatim
    // regardless of classification, so withhold the raw text and hand back a
    // safe fallback (the parent scribe also builds on `response`, so this keeps
    // a rejected drug/dose mention out of the parent's context too). Referral
    // children run with declaredJudgmentKind=null, so `rejected` here always
    // means a forbidden-phrase hit; the scan-clean case is `out-of-scope-routed`
    // and is returned unchanged.
    const response =
      result.classification === 'rejected' ? REFERRAL_REJECTED_FALLBACK : result.output;

    return {
      status: 'core',
      specialtyKey: specialty.key,
      response,
      requestId: result.requestId,
      classification: result.classification,
    };
  },
};
