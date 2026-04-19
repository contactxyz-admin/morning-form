/**
 * Immunisation node attribute contract.
 *
 * Strict: an immunisation record carries clinical consequences (missed
 * booster, contraindication, overseas-travel coverage), so unknown fields
 * here are a smell, not forward-compatibility.
 */
import { z } from 'zod';

export const IMMUNISATION_SERIES = [
  'primary',
  'booster',
  'catch_up',
  'seasonal',
  'travel',
  'unknown',
] as const;
export type ImmunisationSeries = (typeof IMMUNISATION_SERIES)[number];

export const IMMUNISATION_STATUSES = ['completed', 'in_progress', 'refused', 'entered_in_error'] as const;
export type ImmunisationStatus = (typeof IMMUNISATION_STATUSES)[number];

export const ImmunisationAttributesSchema = z
  .object({
    administeredAt: z.string().optional(),
    doseNumber: z.number().int().positive().optional(),
    series: z.enum(IMMUNISATION_SERIES).optional(),
    status: z.enum(IMMUNISATION_STATUSES).optional(),
    lotNumber: z.string().optional(),
    site: z.string().optional(),
    route: z.string().optional(),
    provider: z.string().optional(),
    codeSystem: z.string().optional(),
    code: z.string().optional(),
    note: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();

export type ImmunisationAttributes = z.infer<typeof ImmunisationAttributesSchema>;
