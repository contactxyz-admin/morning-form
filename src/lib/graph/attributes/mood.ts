/**
 * Mood node attribute contract.
 *
 * Represents the mood concept; per-observation ratings live on
 * `observation` nodes (T4) or check-in payloads. Passthrough because the
 * check-in and daily-brief flows (U14) will grow this shape.
 */
import { z } from 'zod';

export const MoodAttributesSchema = z
  .object({
    currentRating: z.number().min(0).max(10).optional(),
    pattern: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type MoodAttributes = z.infer<typeof MoodAttributesSchema>;
