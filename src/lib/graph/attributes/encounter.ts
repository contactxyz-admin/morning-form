/**
 * Encounter node attribute contract.
 *
 * Represents one clinical interaction (face-to-face, telephone, indirect).
 * `linkedDocumentId` is a convenience pointer back to the SourceDocument
 * the encounter was extracted from — navigation affordance, not a graph
 * edge (the SUPPORTS provenance chain already carries that).
 */
import { z } from 'zod';

export const ENCOUNTER_KINDS = [
  'gp_visit',
  'telephone',
  'video',
  'home_visit',
  'specialist_visit',
  'a_and_e',
  'hospital_outpatient',
  'hospital_inpatient',
  'other',
] as const;
export type EncounterKind = (typeof ENCOUNTER_KINDS)[number];

export const EncounterAttributesSchema = z
  .object({
    kind: z.enum(ENCOUNTER_KINDS).optional(),
    occurredAt: z.string().optional(),
    clinician: z.string().optional(),
    location: z.string().optional(),
    reason: z.string().optional(),
    outcome: z.string().optional(),
    linkedDocumentId: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

export type EncounterAttributes = z.infer<typeof EncounterAttributesSchema>;
