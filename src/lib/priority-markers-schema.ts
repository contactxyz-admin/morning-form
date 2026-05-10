/**
 * Schema for archetype-to-priority-marker content files.
 *
 * Each content/priority-markers/{archetype}.ts exports an
 * `ArchetypePriorities` object via `defineArchetypePriorities()`. The
 * engine at `src/lib/priority-marker-engine.ts` looks up the user's
 * archetype and returns the corresponding content; the editorial-QA
 * gate at src/lib/compliance/static-copy.test.ts scans the same files
 * for forbidden phrases (drug names, doses, imperative-treatment).
 *
 * Reviewer metadata (lastReviewedAt + reviewerKey) lives at the file
 * level rather than per-marker because clinical review happens against
 * the whole archetype's marker set, not against individual markers in
 * isolation. The shape mirrors the marketing-page content pattern in
 * content/marketing/{market}/{slug}.ts.
 */
import { z } from 'zod';

const ARCHETYPE_KEYS = [
  'sustained-activator',
  'fragmented-sleeper',
  'sympathetic-dominant',
  'flat-liner',
  'over-stimulated',
  'well-regulated',
] as const;

export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

const PriorityMarkerInputSchema = z.object({
  /** Marker name, e.g. "Ferritin", "Free testosterone", "ApoB". */
  markerName: z.string().min(1),
  /** One-sentence rationale tied to assessment answers. */
  rationale: z.string().min(20).max(280),
  /** Grouping tag (e.g. "iron", "hormones", "cardio"). */
  category: z.string().min(1),
  /** Panel availability indicator. See PriorityMarker schema docs. */
  panelAvailability: z.enum(['uk', 'us', 'both', 'neither']),
  /** Display order (0 = top priority). */
  sortOrder: z.number().int().min(0),
});

export const ArchetypePrioritiesSchema = z.object({
  archetype: z.enum(ARCHETYPE_KEYS),
  /** Profile-level rationale rendered on /reveal/rationale. */
  rationale: z.string().min(80).max(800),
  /** ISO date string. CI warns when >90 days old. */
  lastReviewedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'must be ISO date'),
  /** Identifier of the reviewer who signed off. 'morning-form-editorial'
   *  is the founder-only placeholder; UK GP + US PCP keys replace it
   *  pre-Phase-3 deploy. */
  reviewerKey: z.string().min(1),
  /** 3–5 ranked priority markers. */
  markers: z.array(PriorityMarkerInputSchema).min(3).max(5),
});

export type ArchetypePriorities = z.infer<typeof ArchetypePrioritiesSchema>;
export type PriorityMarkerInput = z.infer<typeof PriorityMarkerInputSchema>;

/**
 * Build-time validation entrypoint. Each content file calls this so
 * Zod parse-errors throw during import (i.e., next build / vitest
 * import) rather than at runtime. Same pattern as the marketing-page
 * `defineMarketingPage()` helper.
 */
export function defineArchetypePriorities(input: unknown): ArchetypePriorities {
  return ArchetypePrioritiesSchema.parse(input);
}

export { ARCHETYPE_KEYS };
