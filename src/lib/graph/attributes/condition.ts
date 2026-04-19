/**
 * Condition node attribute contract.
 *
 * Passthrough — GP problem-list and diagnosis fields vary by source (SNOMED
 * where coded, free text from letters). Strictness here would reject real
 * GP-imported rows during T5/connector work.
 */
import { z } from 'zod';

export const ConditionAttributesSchema = z
  .object({
    status: z.enum(['active', 'resolved', 'inactive', 'unknown']).optional(),
    severity: z.enum(['mild', 'moderate', 'severe', 'unknown']).optional(),
    onsetDate: z.string().optional(),
    resolvedDate: z.string().nullable().optional(),
    codeSystem: z.string().optional(),
    code: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type ConditionAttributes = z.infer<typeof ConditionAttributesSchema>;
