/**
 * Symptom-episode attribute contract (T7).
 *
 * One time-bounded instance of a parent `symptom` (or mood/energy) node.
 * Separate from `symptom` because a symptom concept persists across
 * episodes while each episode has its own onset, severity curve, and
 * trigger set — bundling them on the concept makes querying a diary
 * view impossible without JSON surgery.
 *
 * Linked upward via `INSTANCE_OF` to the parent symptom/mood/energy node.
 */
import { z } from 'zod';

export const SymptomEpisodeAttributesSchema = z
  .object({
    onsetAt: z.string(),
    resolvedAt: z.string().nullable().optional(),
    severityAtPeak: z.number().min(0).max(10).optional(),
    durationMinutes: z.number().int().nonnegative().optional(),
    triggers: z.array(z.string()).optional(),
    relievers: z.array(z.string()).optional(),
    functionalImpact: z.enum(['none', 'mild', 'moderate', 'severe']).optional(),
    notes: z.string().optional(),
    linkedDocumentId: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();

export type SymptomEpisodeAttributes = z.infer<typeof SymptomEpisodeAttributesSchema>;
