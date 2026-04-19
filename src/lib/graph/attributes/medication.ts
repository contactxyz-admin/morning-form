/**
 * Medication node attribute contract.
 *
 * Family grows (supplements, prescribed, compounded, OTC, route variants),
 * so passthrough preserves unknown fields written by future extraction
 * prompts without requiring a schema bump here.
 *
 * `source` distinguishes origin classes that behave differently downstream
 * (a GP-prescribed ACE inhibitor is not a patient-bought supplement). T8
 * moves dose/frequency onto per-administration `intervention_event` nodes;
 * the fields below describe the medication itself.
 */
import { z } from 'zod';

export const MedicationAttributesSchema = z
  .object({
    dose: z.string().optional(),
    doseValue: z.number().optional(),
    doseUnit: z.string().optional(),
    frequency: z.string().optional(),
    route: z.string().optional(),
    source: z
      .enum(['prescribed', 'supplement', 'otc', 'unknown'])
      .optional(),
    startedOn: z.string().optional(),
    endedOn: z.string().nullable().optional(),
    indication: z.string().optional(),
  })
  .passthrough();

export type MedicationAttributes = z.infer<typeof MedicationAttributesSchema>;
