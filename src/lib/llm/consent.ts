/**
 * LLM-consent gate primitives.
 *
 * Since 2026-05-15 the assessment is optional rather than a forced
 * onboarding gate, so the consent prose that lived inside /onboarding's
 * ConsentStep is no longer captured before the user can do anything.
 * Instead, consent is captured lazily at the moment of first LLM use —
 * any route that issues an LLM call (chat, assessment, topic compile)
 * checks `User.llmConsentAcceptedAt` and returns 412 with a structured
 * payload that the client surfaces as a one-time modal.
 *
 * Plan: docs/plans/2026-05-15-002-feat-lead-gen-signup-and-optional-assessment-plan.md
 */
import type { User } from '@prisma/client';
import { NextResponse } from 'next/server';

/**
 * Wire shape for the 412 response. Clients pattern-match on
 * `requiresConsent === true` to render the modal; everything else is
 * an opaque error.
 */
export interface RequiresConsentBody {
  requiresConsent: true;
  error: 'LLM consent required.';
}

/**
 * Returns the 412 response body and status if the user hasn't accepted
 * LLM consent yet; returns `null` if consent is on file. Route handlers
 * should check this *before* doing any LLM work.
 */
export function llmConsentGateResponse(
  user: Pick<User, 'llmConsentAcceptedAt'>,
): NextResponse | null {
  if (user.llmConsentAcceptedAt !== null) return null;
  const body: RequiresConsentBody = {
    requiresConsent: true,
    error: 'LLM consent required.',
  };
  // 412 Precondition Failed — semantically correct for "the request is
  // well-formed but a precondition (consent) is not met."
  return NextResponse.json(body, { status: 412 });
}
