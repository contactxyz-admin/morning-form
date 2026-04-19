/**
 * Lifestyle node attribute contract.
 *
 * Broad family (diet, sleep habits, exercise regimen, caffeine, alcohol,
 * sauna, cold exposure). Passthrough because T7 introduces lifestyle
 * subtyping and we don't want T1 to block that.
 */
import { z } from 'zod';

export const LifestyleAttributesSchema = z
  .object({
    category: z.string().optional(),
    frequency: z.string().optional(),
    quantity: z.string().optional(),
    quantityValue: z.number().optional(),
    quantityUnit: z.string().optional(),
    startedOn: z.string().optional(),
    endedOn: z.string().nullable().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type LifestyleAttributes = z.infer<typeof LifestyleAttributesSchema>;
