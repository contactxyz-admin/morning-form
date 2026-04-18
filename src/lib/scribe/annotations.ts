/**
 * Scribe annotations — structured judgments the compile-time scribe emits
 * alongside the topic narrative. Each annotation is a narrow clinically-safe
 * claim tied to a span of prose and grounded in graph-node citations.
 *
 * Contract:
 *   - `spanAnchor` is a substring of the section's `bodyMarkdown` where the
 *     UI renders the annotation pill. Minimum length 8 so the scribe cannot
 *     anchor on a trivial word like "iron" and have it match in three places.
 *   - `judgmentKind` is declared by the scribe and must be in the topic's
 *     `allowedJudgmentKinds` — enforced by `enforce(policy, output)` upstream.
 *   - `citations` reuse the compile-pipeline `Citation` shape so the UI can
 *     render citation pills with the same primitive in both places.
 *   - `outOfScopeRoute` is set when the scribe decides the claim cannot be
 *     safely made inline and should be redirected. Today the only route is
 *     `gpPrep`; `discussWithClinician` handling lives in the safety policy.
 *
 * The scribe's LLM loop emits annotations as a JSON block appended to its
 * final turn's `text`. `parseScribeAnnotations` extracts and validates them;
 * unparseable output yields an empty list so a malformed scribe response
 * never poisons the compiled page — the narrative still lands, just without
 * annotations.
 */
import { z } from 'zod';
import {
  ScribeAnnotationSchema,
  type ScribeAnnotation,
} from '@/lib/topics/types';

export { ScribeAnnotationSchema, type ScribeAnnotation };

/**
 * Marker the scribe emits on its final turn; everything after it is JSON
 * we parse. Keeping the marker verbose lowers the risk of false positives
 * inside prose. Case-sensitive — the prompt instructs the scribe to use
 * exactly this spelling.
 */
export const ANNOTATION_BLOCK_MARKER = 'ANNOTATIONS_JSON:';

const AnnotationsListSchema = z.array(ScribeAnnotationSchema).max(24);

export interface ParseAnnotationsResult {
  annotations: ScribeAnnotation[];
  /** Non-null when the block was present but failed to parse. */
  parseError: string | null;
}

/**
 * Extracts annotations from a scribe's final `output` string. Returns an
 * empty list (not an error) when the marker is absent — a scribe that
 * produced only prose is a valid clinical-safe output.
 */
export function parseScribeAnnotations(output: string): ParseAnnotationsResult {
  const idx = output.indexOf(ANNOTATION_BLOCK_MARKER);
  if (idx === -1) {
    return { annotations: [], parseError: null };
  }
  const rest = output.slice(idx + ANNOTATION_BLOCK_MARKER.length).trim();
  // Accept either a bare JSON array or an array wrapped in a fenced block.
  const jsonSource = stripCodeFence(rest);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSource);
  } catch (err) {
    return {
      annotations: [],
      parseError: `scribe annotations JSON parse failed: ${(err as Error).message}`,
    };
  }
  const result = AnnotationsListSchema.safeParse(parsed);
  if (!result.success) {
    return {
      annotations: [],
      parseError: `scribe annotations schema rejected: ${result.error.message}`,
    };
  }
  return { annotations: result.data, parseError: null };
}

/**
 * Strip the `output` string of its `ANNOTATIONS_JSON:` block so callers can
 * keep only the human-readable prose (useful for audit/prompt debugging).
 */
export function stripAnnotationBlock(output: string): string {
  const idx = output.indexOf(ANNOTATION_BLOCK_MARKER);
  return idx === -1 ? output : output.slice(0, idx).trimEnd();
}

function stripCodeFence(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;
  const m = s.match(fence);
  return (m ? m[1] : s).trim();
}

/**
 * Best-effort: given an annotation and the three narrative sections, decide
 * which section contains the `spanAnchor`. Returns `'gpPrep'` when the
 * annotation is out-of-scope. Falls back to `'discussWithClinician'` when
 * the spanAnchor doesn't substring-match any section — we'd rather render
 * a judgment under "Discuss with a clinician" than drop it silently.
 */
export type AnnotationTarget =
  | 'understanding'
  | 'whatYouCanDoNow'
  | 'discussWithClinician'
  | 'gpPrep';

export function targetSectionFor(
  annotation: ScribeAnnotation,
  sections: { understanding: string; whatYouCanDoNow: string; discussWithClinician: string },
): AnnotationTarget {
  if (annotation.outOfScopeRoute === 'gpPrep') return 'gpPrep';
  const anchor = annotation.spanAnchor;
  if (sections.understanding.includes(anchor)) return 'understanding';
  if (sections.whatYouCanDoNow.includes(anchor)) return 'whatYouCanDoNow';
  if (sections.discussWithClinician.includes(anchor)) return 'discussWithClinician';
  return 'discussWithClinician';
}
