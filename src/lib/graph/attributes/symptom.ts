/**
 * Symptom node attribute contract.
 *
 * Represents the symptom as a concept (e.g. "fatigue"). Per-occurrence
 * detail (onset, severity curve, triggers) belongs on `symptom_episode`
 * nodes (T7), linked to this node via `INSTANCE_OF` edges.
 *
 * T7 adds `severityScale`, `commonTriggers`, `commonRelievers`, and
 * `qualityOfLifeImpact` to carry the rolling picture of the symptom
 * without re-walking every episode.
 *
 * Passthrough so extraction prompts can evolve without breaking
 * existing rows.
 */
import { z } from 'zod';

export const SYMPTOM_SEVERITY_SCALES = ['0_10', 'qualitative'] as const;
export type SymptomSeverityScale = (typeof SYMPTOM_SEVERITY_SCALES)[number];

export const QUALITY_OF_LIFE_IMPACTS = ['none', 'mild', 'moderate', 'severe'] as const;
export type QualityOfLifeImpact = (typeof QUALITY_OF_LIFE_IMPACTS)[number];

export const SymptomAttributesSchema = z
  .object({
    firstObservedAt: z.string().optional(),
    lastObservedAt: z.string().optional(),
    currentSeverity: z.enum(['mild', 'moderate', 'severe', 'unknown']).optional(),
    bodySystem: z.string().optional(),
    pattern: z.string().optional(),
    severityScale: z.enum(SYMPTOM_SEVERITY_SCALES).optional(),
    defaultSeverity: z.number().optional(),
    commonTriggers: z.array(z.string()).optional(),
    commonRelievers: z.array(z.string()).optional(),
    qualityOfLifeImpact: z.enum(QUALITY_OF_LIFE_IMPACTS).optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type SymptomAttributes = z.infer<typeof SymptomAttributesSchema>;
