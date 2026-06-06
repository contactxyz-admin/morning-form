/**
 * `propose_next_steps` — typed, validated next-step actions the scribe
 * can recommend at the end of an answer (Plan 2026-06-05-001 Phase A Unit 5).
 *
 * Safety invariants:
 *   1. Verbs are a closed vocabulary — `measure|discuss|track|behavior`.
 *   2. Every label is validated against the global forbidden-phrase set
 *      (which includes dietary directives from Unit 4). A label that
 *      matches any forbidden pattern is dropped.
 *   3. Handler returns ONLY validated actions — invalid actions drop with
 *      a logged reason, never partially rendered.
 *   4. This handler NEVER writes the DB. Persistence happens in turn.ts
 *      only AFTER enforce() classifies the answer clinical-safe AND the
 *      ChatMessage row exists (prevents orphaned actions from rejected
 *      answers).
 *   5. Behavior actions are restricted to sleep/training/routine —
 *      dietary-quantity directives are newly forbidden (Unit 4).
 */

import { z } from 'zod';
import { scanForbiddenPhrases } from '../policy/enforce';
import { FORBIDDEN_PHRASE_PATTERNS } from '../policy/forbidden-phrases';
import type { ToolContext, ToolHandler } from './types';

export const NEXT_STEP_VERBS = ['measure', 'discuss', 'track', 'behavior'] as const;
export type NextStepVerb = (typeof NEXT_STEP_VERBS)[number];

export const MAX_ACTIONS = 4;
export const MAX_LABEL_LENGTH = 200;
export const MAX_MARKER_NAME_LENGTH = 100;

export const proposeNextStepsSchema = z.object({
  actions: z
    .array(
      z.object({
        verb: z.enum(NEXT_STEP_VERBS),
        label: z.string().min(1).max(MAX_LABEL_LENGTH),
        markerName: z.string().min(1).max(MAX_MARKER_NAME_LENGTH).optional(),
      }),
    )
    .min(1)
    .max(MAX_ACTIONS),
});

export type ProposeNextStepsArgs = z.infer<typeof proposeNextStepsSchema>;

export interface ValidatedAction {
  verb: NextStepVerb;
  label: string;
  markerName?: string;
}

export interface ProposeNextStepsResult {
  actions: ValidatedAction[];
  dropped: number;
  dropReasons: string[];
}

export const proposeNextStepsHandler: ToolHandler<
  ProposeNextStepsArgs,
  ProposeNextStepsResult
> = {
  name: 'propose_next_steps',
  description:
    'Propose typed next steps for the user at the end of an answer. Each action has a verb (measure|discuss|track|behavior), a label, and optionally a markerName. Only call this tool after the full answer is complete — it is the final tool before end_turn. Actions are validated against the clinical safety policy; invalid ones are silently dropped.',
  parameters: proposeNextStepsSchema,
  async execute(_ctx: ToolContext, args: ProposeNextStepsArgs): Promise<ProposeNextStepsResult> {
    const valid: ValidatedAction[] = [];
    const dropReasons: string[] = [];
    let dropped = 0;

    for (const action of args.actions) {
      // Verb is already constrained to the closed vocabulary by the zod enum
      // at the parse boundary (proposeNextStepsSchema) — no re-check needed.

      // Label length cap.
      const label = action.label.slice(0, MAX_LABEL_LENGTH);

      // Scan label against the global forbidden phrase set (includes
      // dietary directives from Unit 4). Doses, drug names, imperative
      // treatment verbs, dietary directives — any hit drops the action.
      const phraseViolations = scanForbiddenPhrases(label, FORBIDDEN_PHRASE_PATTERNS);
      if (phraseViolations.length > 0) {
        dropped++;
        dropReasons.push(
          `Action label '${label.slice(0, 60)}' matched forbidden phrase(s): ${phraseViolations.map((v) => v.match).join(', ')}`,
        );
        continue;
      }

      // Scan markerName with the SAME forbidden-phrase gate as label — a
      // marker name is user-facing (renders in the UI chip) and persists to
      // the Action table, so a drug name or dose smuggled here (e.g.
      // 'Ferrous sulfate 65mg') must drop the whole action.
      const markerName = action.markerName?.slice(0, MAX_MARKER_NAME_LENGTH);
      if (markerName) {
        const markerViolations = scanForbiddenPhrases(markerName, FORBIDDEN_PHRASE_PATTERNS);
        if (markerViolations.length > 0) {
          dropped++;
          dropReasons.push(
            `Action markerName '${markerName.slice(0, 60)}' matched forbidden phrase(s): ${markerViolations.map((v) => v.match).join(', ')}`,
          );
          continue;
        }
      }

      valid.push({
        verb: action.verb,
        label,
        markerName,
      });
    }

    return { actions: valid, dropped, dropReasons };
  },
};
