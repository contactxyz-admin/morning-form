/**
 * Biomarker node attribute contract.
 *
 * Well-bounded (`.strict()`) because biomarker shape is stable and diverse
 * fields are a sign of miscategorisation (e.g., free-text observations
 * belong on `observation` nodes, not biomarkers).
 *
 * Both `value` (lab_pdf writes) and `latestValue` (intake LLM writes) are
 * accepted during the migration window; T6/T9 will normalise to a single
 * canonical field. `registryKey` is the resolved BIOMARKER_REGISTRY key when
 * the label mapped cleanly, `null` when it didn't (see
 * src/app/api/intake/documents/route.ts).
 */
import { z } from 'zod';

export const BiomarkerAttributesSchema = z
  .object({
    value: z.number().optional(),
    latestValue: z.number().optional(),
    unit: z.string().optional(),
    referenceRangeLow: z.number().nullable().optional(),
    referenceRangeHigh: z.number().nullable().optional(),
    flaggedOutOfRange: z.boolean().optional(),
    collectionDate: z.string().nullable().optional(),
    observedAt: z.string().optional(),
    registryKey: z.string().nullable().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();

export type BiomarkerAttributes = z.infer<typeof BiomarkerAttributesSchema>;
