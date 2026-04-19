/**
 * Symptom node attribute contract.
 *
 * Represents the symptom as a concept (e.g. "fatigue"). Per-occurrence
 * detail (onset, severity curve, triggers) belongs on `symptom_episode`
 * nodes introduced in T7. Passthrough so extraction prompts can evolve
 * without breaking existing rows.
 */
import { z } from 'zod';

export const SymptomAttributesSchema = z
  .object({
    firstObservedAt: z.string().optional(),
    lastObservedAt: z.string().optional(),
    currentSeverity: z.enum(['mild', 'moderate', 'severe', 'unknown']).optional(),
    bodySystem: z.string().optional(),
    pattern: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type SymptomAttributes = z.infer<typeof SymptomAttributesSchema>;
