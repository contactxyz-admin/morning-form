/**
 * `route_to_gp_prep` — the scribe's referral discipline made tactile. When
 * the specialist concludes the question is outside their scope of practice,
 * calling this tool produces a deterministic handoff payload:
 *
 *   - at compile time, `src/lib/topics/compile.ts` folds the `reason` +
 *     `suggestedQuestion` into `gpPrep.questionsToAsk`
 *   - at runtime, the `InlineExplainCard` renders an "Add to GP prep" button
 *     bound to this payload rather than showing a watered-down answer
 *
 * No DB read. The only topic-scoping we apply is a sanity check that
 * `topicKey` on the context matches the call's topic — the executor always
 * passes its own ctx, so this is belt-and-braces; a test covers it.
 *
 * Clinician-mediated supplement handoff (Plan 2026-06-19-001 Unit 2): when a
 * supplement/medication question is routed and `category` is supplied, the
 * handler MAY attach a curated, clinician-reviewed `evidenceNote` so the
 * handoff carries the general evidence picture + the question to raise — never
 * a recommendation. Gated by SUPPLEMENT_HANDOFF_ENABLED (off by default) AND
 * the per-note clinician sign-off in scribe/supplement-handoff/evidence-notes.ts.
 * Flag off → byte-for-byte the legacy payload.
 */
import { z } from 'zod';
import { env } from '@/lib/env';
import { resolveEvidenceNote } from '../supplement-handoff/evidence-notes';
import type { ToolContext, ToolHandler } from './types';

export const routeToGpPrepSchema = z.object({
  reason: z.string().min(4).max(500),
  suggestedQuestion: z.string().min(4).max(300),
  /**
   * Optional category for a supplement/medication question (e.g.
   * 'sleep-supplement'). When a curated clinician-reviewed note exists for it
   * AND the feature is enabled, an evidence note is attached. Unknown / absent
   * → no note, handoff unchanged.
   */
  category: z.string().min(1).max(64).optional(),
});

export type RouteToGpPrepArgs = z.infer<typeof routeToGpPrepSchema>;

export interface RouteToGpPrepResult {
  routed: true;
  topicKey: string;
  reason: string;
  suggestedQuestion: string;
  /** Category of the attached evidence note, when one was attached. */
  category?: string;
  /**
   * Curated, clinician-reviewed, scan-clean general-evidence context for the
   * handoff. Present only when the feature is enabled and a reviewed note
   * exists. Descriptive register — never a dose, brand, or recommendation.
   */
  evidenceNote?: string;
}

export const routeToGpPrepHandler: ToolHandler<RouteToGpPrepArgs, RouteToGpPrepResult> = {
  name: 'route_to_gp_prep',
  description:
    'Refer the current question out of scope. Use when a user prompt (or a compile-time judgment) falls outside your specialty\'s allowed judgment kinds — never partial-answer instead. Produces a GP-prep question the user can take to their clinician. For a supplement or medication question, optionally pass `category` (e.g. "sleep-supplement"); when a curated, clinician-reviewed evidence note exists it is attached for you to fold into the handoff descriptively — never as a recommendation, dose, or product name.',
  parameters: routeToGpPrepSchema,
  async execute(ctx: ToolContext, args: RouteToGpPrepArgs): Promise<RouteToGpPrepResult> {
    const base: RouteToGpPrepResult = {
      routed: true as const,
      topicKey: ctx.topicKey,
      reason: args.reason.trim(),
      suggestedQuestion: args.suggestedQuestion.trim(),
    };

    // Clinician-mediated supplement handoff (Plan 2026-06-19-001 Unit 2).
    // Double-gated: the feature flag AND a per-note clinician sign-off (the
    // loader returns null for anything unreviewed or scan-dirty). Off / no
    // category / no reviewed note → the legacy payload, unchanged.
    if (env.SUPPLEMENT_HANDOFF_ENABLED === 'true' && args.category) {
      const note = resolveEvidenceNote(args.category);
      if (note) {
        return { ...base, category: note.category, evidenceNote: note.note };
      }
    }

    return base;
  },
};
