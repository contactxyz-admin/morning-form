/**
 * Intervention-event attribute contract (T8).
 *
 * One administration / adherence event of a parent `intervention`,
 * `medication`, or `lifestyle` node. Captured as its own node so the
 * graph can carry dosage changes, missed doses, side effects, and
 * outcome deltas without polluting the parent's rolling attributes.
 *
 * Linked upward via `INSTANCE_OF` (to the parent intervention) and
 * outward via `OUTCOME_CHANGED` (to the biomarker / symptom /
 * observation / metric_window that moved as a result).
 */
import { z } from 'zod';

export const INTERVENTION_EVENT_KINDS = [
  'started',
  'taken_as_prescribed',
  'missed_dose',
  'dose_changed',
  'stopped',
  'side_effect',
  'completed',
  'paused',
] as const;
export type InterventionEventKind = (typeof INTERVENTION_EVENT_KINDS)[number];

export const InterventionEventAttributesSchema = z
  .object({
    eventKind: z.enum(INTERVENTION_EVENT_KINDS),
    occurredAt: z.string(),
    notes: z.string().optional(),
    selfReportedCompliance: z.number().min(0).max(1).optional(),
    dose: z.string().optional(),
    doseUnit: z.string().optional(),
    sideEffect: z.string().optional(),
    sideEffectSeverity: z.enum(['mild', 'moderate', 'severe']).optional(),
    source: z.string().optional(),
    linkedDocumentId: z.string().optional(),
  })
  .strict();

export type InterventionEventAttributes = z.infer<typeof InterventionEventAttributesSchema>;
