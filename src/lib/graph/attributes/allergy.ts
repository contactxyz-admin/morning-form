/**
 * Allergy node attribute contract.
 *
 * Well-bounded (`.strict()`). An allergy is a high-consequence datum — shape
 * drift here leads to safety-critical miscategorisations (a food allergy
 * filed as an environmental trigger). Unknown fields must be explicit
 * schema additions, not passthrough.
 */
import { z } from 'zod';

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'life_threatening', 'unknown'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export const ALLERGY_VERIFICATION_STATUSES = ['confirmed', 'suspected', 'refuted', 'unknown'] as const;
export type AllergyVerificationStatus = (typeof ALLERGY_VERIFICATION_STATUSES)[number];

export const AllergyAttributesSchema = z
  .object({
    reactantClass: z.enum(['drug', 'food', 'environmental', 'venom', 'other']),
    reaction: z.string().optional(),
    severity: z.enum(ALLERGY_SEVERITIES).optional(),
    verificationStatus: z.enum(ALLERGY_VERIFICATION_STATUSES).optional(),
    firstObservedAt: z.string().optional(),
    lastReactionAt: z.string().nullable().optional(),
    note: z.string().optional(),
    codeSystem: z.string().optional(),
    code: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();

export type AllergyAttributes = z.infer<typeof AllergyAttributesSchema>;
