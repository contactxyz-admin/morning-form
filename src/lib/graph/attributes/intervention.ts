/**
 * Intervention node attribute contract.
 *
 * Describes the intervention itself (e.g. "iron supplementation", "CBT
 * course"). Per-execution adherence/outcome data lives on
 * `intervention_event` nodes introduced in T8. Passthrough for the same
 * reason as medication.
 */
import { z } from 'zod';

export const InterventionAttributesSchema = z
  .object({
    category: z
      .enum(['supplement', 'medication', 'therapy', 'procedure', 'lifestyle', 'other'])
      .optional(),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    startedOn: z.string().optional(),
    endedOn: z.string().nullable().optional(),
    protocol: z.string().optional(),
    goal: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type InterventionAttributes = z.infer<typeof InterventionAttributesSchema>;
