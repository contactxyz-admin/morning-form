/**
 * Procedure node attribute contract.
 *
 * Represents an executed clinical procedure (ECG, biopsy, endoscopy).
 * Distinct from `intervention` (which is the concept/protocol, e.g. "CBT
 * course") and from `intervention_event` (per-administration adherence,
 * introduced in T8).
 */
import { z } from 'zod';

export const PROCEDURE_CODE_SYSTEMS = ['snomed_ct', 'opcs_4', 'icd_10_pcs', 'cpt', 'loinc', 'other'] as const;
export type ProcedureCodeSystem = (typeof PROCEDURE_CODE_SYSTEMS)[number];

export const PROCEDURE_STATUSES = [
  'scheduled',
  'completed',
  'aborted',
  'not_done',
  'unknown',
] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number];

export const ProcedureAttributesSchema = z
  .object({
    performedAt: z.string().optional(),
    performer: z.string().optional(),
    location: z.string().optional(),
    status: z.enum(PROCEDURE_STATUSES).optional(),
    codeSystem: z.enum(PROCEDURE_CODE_SYSTEMS).optional(),
    code: z.string().optional(),
    outcome: z.string().optional(),
    linkedEncounterId: z.string().optional(),
    linkedDocumentId: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

export type ProcedureAttributes = z.infer<typeof ProcedureAttributesSchema>;
