/**
 * Referral node attribute contract.
 *
 * Captures a GP→specialist (or GP→service) handoff. `linkedEncounterId` is
 * the encounter canonicalKey that originated the referral, when known.
 */
import { z } from 'zod';

export const REFERRAL_STATUSES = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'declined',
  'cancelled',
  'unknown',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_PRIORITIES = ['routine', 'urgent', 'two_week_wait', 'emergency', 'unknown'] as const;
export type ReferralPriority = (typeof REFERRAL_PRIORITIES)[number];

export const ReferralAttributesSchema = z
  .object({
    specialty: z.string().optional(),
    service: z.string().optional(),
    reason: z.string().optional(),
    status: z.enum(REFERRAL_STATUSES).optional(),
    priority: z.enum(REFERRAL_PRIORITIES).optional(),
    requestedAt: z.string().optional(),
    completedAt: z.string().nullable().optional(),
    linkedEncounterId: z.string().optional(),
    linkedDocumentId: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

export type ReferralAttributes = z.infer<typeof ReferralAttributesSchema>;
