/**
 * Energy node attribute contract.
 *
 * Mirror of mood — energy as a concept; daily ratings and trend data live
 * on observation or metric_window nodes.
 */
import { z } from 'zod';

export const EnergyAttributesSchema = z
  .object({
    currentRating: z.number().min(0).max(10).optional(),
    pattern: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type EnergyAttributes = z.infer<typeof EnergyAttributesSchema>;
