/**
 * Per-node-type attribute contracts for the Health Graph (T1).
 *
 * Migration semantics:
 * - Writes: `validateAttributesForWrite` is called inside `addNode` and
 *   `ingestExtraction`. Shape mismatches throw `NodeAttributesValidationError`
 *   and abort the write (in `ingestExtraction`, the whole transaction rolls
 *   back).
 * - Reads: `parseNodeAttributes` is tolerant. Legacy rows whose JSON does
 *   not match the current schema are returned as
 *   `{ _unvalidated: true, raw: <object> }` with a console warning, instead
 *   of throwing. This lets the read path keep working across the one-release
 *   migration window while the write path enforces the new shape going
 *   forward.
 *
 * Typed narrowing is available via the discriminated `NodeAttributesSchema`
 * for callers that want `{ nodeType, attributes }` round-trips.
 */
import { z, type ZodTypeAny } from 'zod';
import type { NodeType } from '../types';
import { NodeAttributesValidationError } from '../errors';
import { BiomarkerAttributesSchema, type BiomarkerAttributes } from './biomarker';
import { MedicationAttributesSchema, type MedicationAttributes } from './medication';
import { ConditionAttributesSchema, type ConditionAttributes } from './condition';
import { SymptomAttributesSchema, type SymptomAttributes } from './symptom';
import { LifestyleAttributesSchema, type LifestyleAttributes } from './lifestyle';
import { InterventionAttributesSchema, type InterventionAttributes } from './intervention';
import { MoodAttributesSchema, type MoodAttributes } from './mood';
import { EnergyAttributesSchema, type EnergyAttributes } from './energy';
import { MetricWindowAttributesSchema, type MetricWindowAttributes } from './metric_window';
import { SourceDocumentAttributesSchema, type SourceDocumentAttributes } from './source_document';
import { AllergyAttributesSchema, type AllergyAttributes } from './allergy';
import { ImmunisationAttributesSchema, type ImmunisationAttributes } from './immunisation';
import { EncounterAttributesSchema, type EncounterAttributes } from './encounter';
import { ReferralAttributesSchema, type ReferralAttributes } from './referral';
import { ProcedureAttributesSchema, type ProcedureAttributes } from './procedure';
import { ObservationAttributesSchema, type ObservationAttributes } from './observation';
import { InterventionEventAttributesSchema, type InterventionEventAttributes } from './intervention_event';
import { SymptomEpisodeAttributesSchema, type SymptomEpisodeAttributes } from './symptom_episode';

export const ATTRIBUTE_SCHEMAS: Record<NodeType, ZodTypeAny> = {
  biomarker: BiomarkerAttributesSchema,
  medication: MedicationAttributesSchema,
  condition: ConditionAttributesSchema,
  symptom: SymptomAttributesSchema,
  lifestyle: LifestyleAttributesSchema,
  intervention: InterventionAttributesSchema,
  mood: MoodAttributesSchema,
  energy: EnergyAttributesSchema,
  metric_window: MetricWindowAttributesSchema,
  source_document: SourceDocumentAttributesSchema,
  allergy: AllergyAttributesSchema,
  immunisation: ImmunisationAttributesSchema,
  encounter: EncounterAttributesSchema,
  referral: ReferralAttributesSchema,
  procedure: ProcedureAttributesSchema,
  observation: ObservationAttributesSchema,
  intervention_event: InterventionEventAttributesSchema,
  symptom_episode: SymptomEpisodeAttributesSchema,
};

export interface AttributesByNodeType {
  biomarker: BiomarkerAttributes;
  medication: MedicationAttributes;
  condition: ConditionAttributes;
  symptom: SymptomAttributes;
  lifestyle: LifestyleAttributes;
  intervention: InterventionAttributes;
  mood: MoodAttributes;
  energy: EnergyAttributes;
  metric_window: MetricWindowAttributes;
  source_document: SourceDocumentAttributes;
  allergy: AllergyAttributes;
  immunisation: ImmunisationAttributes;
  encounter: EncounterAttributes;
  referral: ReferralAttributes;
  procedure: ProcedureAttributes;
  observation: ObservationAttributes;
  intervention_event: InterventionEventAttributes;
  symptom_episode: SymptomEpisodeAttributes;
}

export type AttributesFor<T extends NodeType> = AttributesByNodeType[T];

export interface UnvalidatedAttributes {
  readonly _unvalidated: true;
  readonly raw: Record<string, unknown>;
}

export const NodeAttributesSchema = z.discriminatedUnion('nodeType', [
  z.object({ nodeType: z.literal('biomarker'), attributes: BiomarkerAttributesSchema }),
  z.object({ nodeType: z.literal('medication'), attributes: MedicationAttributesSchema }),
  z.object({ nodeType: z.literal('condition'), attributes: ConditionAttributesSchema }),
  z.object({ nodeType: z.literal('symptom'), attributes: SymptomAttributesSchema }),
  z.object({ nodeType: z.literal('lifestyle'), attributes: LifestyleAttributesSchema }),
  z.object({ nodeType: z.literal('intervention'), attributes: InterventionAttributesSchema }),
  z.object({ nodeType: z.literal('mood'), attributes: MoodAttributesSchema }),
  z.object({ nodeType: z.literal('energy'), attributes: EnergyAttributesSchema }),
  z.object({ nodeType: z.literal('metric_window'), attributes: MetricWindowAttributesSchema }),
  z.object({ nodeType: z.literal('source_document'), attributes: SourceDocumentAttributesSchema }),
  z.object({ nodeType: z.literal('allergy'), attributes: AllergyAttributesSchema }),
  z.object({ nodeType: z.literal('immunisation'), attributes: ImmunisationAttributesSchema }),
  z.object({ nodeType: z.literal('encounter'), attributes: EncounterAttributesSchema }),
  z.object({ nodeType: z.literal('referral'), attributes: ReferralAttributesSchema }),
  z.object({ nodeType: z.literal('procedure'), attributes: ProcedureAttributesSchema }),
  z.object({ nodeType: z.literal('observation'), attributes: ObservationAttributesSchema }),
  z.object({ nodeType: z.literal('intervention_event'), attributes: InterventionEventAttributesSchema }),
  z.object({ nodeType: z.literal('symptom_episode'), attributes: SymptomEpisodeAttributesSchema }),
]);

export type NodeAttributesEnvelope = z.infer<typeof NodeAttributesSchema>;

/**
 * Node types whose schemas carry genuinely required fields (T4/T7/T8 added
 * these). Writing an empty attributes object for any of these would produce
 * a row that can never satisfy the contract, so we enforce non-empty at
 * write time for this set. Other types (biomarker, medication, etc.) keep
 * the legacy-tolerant "empty is a no-op" behaviour so partial ingests from
 * older pipelines still succeed.
 */
const REQUIRE_NONEMPTY_ATTRIBUTES: ReadonlySet<NodeType> = new Set<NodeType>([
  'observation',
  'metric_window',
  'symptom_episode',
  'intervention_event',
]);

/**
 * Validate attributes for a node being written. Throws
 * `NodeAttributesValidationError` on mismatch. Empty/undefined attribute
 * objects are treated as valid (they stringify to null in storage) for
 * types outside `REQUIRE_NONEMPTY_ATTRIBUTES`.
 */
export function validateAttributesForWrite(
  nodeType: NodeType,
  canonicalKey: string,
  attributes: Record<string, unknown> | undefined,
): void {
  const isEmpty = !attributes || Object.keys(attributes).length === 0;
  if (isEmpty) {
    if (!REQUIRE_NONEMPTY_ATTRIBUTES.has(nodeType)) return;
    // Fall through to schema.safeParse({}) so the caller gets the exact
    // list of missing fields via NodeAttributesValidationError.
  }
  const schema = ATTRIBUTE_SCHEMAS[nodeType];
  const result = schema.safeParse(attributes ?? {});
  if (!result.success) {
    throw new NodeAttributesValidationError(nodeType, canonicalKey, result.error.issues);
  }
}

/**
 * Read-tolerant accessor. Parses the JSON stored in GraphNode.attributes
 * (`string | null`) against the node-type contract. Returns an empty
 * object for null/missing attributes, the typed shape on match, and an
 * `UnvalidatedAttributes` envelope on legacy/malformed rows so readers can
 * decide how to render without crashing.
 */
export function parseNodeAttributes<T extends NodeType>(
  nodeType: T,
  raw: string | null,
): AttributesFor<T> | UnvalidatedAttributes | Record<string, never> {
  if (raw === null || raw === undefined || raw === '') return {} as Record<string, never>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[parseNodeAttributes] malformed JSON for ${nodeType} — returning unvalidated envelope`);
    return { _unvalidated: true, raw: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[parseNodeAttributes] non-object attributes for ${nodeType} — returning unvalidated envelope`);
    return { _unvalidated: true, raw: {} };
  }
  const schema = ATTRIBUTE_SCHEMAS[nodeType];
  const result = schema.safeParse(parsed);
  if (result.success) {
    return result.data as AttributesFor<T>;
  }
  console.warn(
    `[parseNodeAttributes] legacy attributes for ${nodeType} failed current contract: ${result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')}`,
  );
  return { _unvalidated: true, raw: parsed as Record<string, unknown> };
}

export { NodeAttributesValidationError } from '../errors';
export {
  BiomarkerAttributesSchema,
  MedicationAttributesSchema,
  ConditionAttributesSchema,
  SymptomAttributesSchema,
  LifestyleAttributesSchema,
  InterventionAttributesSchema,
  MoodAttributesSchema,
  EnergyAttributesSchema,
  MetricWindowAttributesSchema,
  SourceDocumentAttributesSchema,
  AllergyAttributesSchema,
  ImmunisationAttributesSchema,
  EncounterAttributesSchema,
  ReferralAttributesSchema,
  ProcedureAttributesSchema,
  ObservationAttributesSchema,
  InterventionEventAttributesSchema,
  SymptomEpisodeAttributesSchema,
};
export type {
  BiomarkerAttributes,
  MedicationAttributes,
  ConditionAttributes,
  SymptomAttributes,
  LifestyleAttributes,
  InterventionAttributes,
  MoodAttributes,
  EnergyAttributes,
  MetricWindowAttributes,
  SourceDocumentAttributes,
  AllergyAttributes,
  ImmunisationAttributes,
  EncounterAttributes,
  ReferralAttributes,
  ProcedureAttributes,
  ObservationAttributes,
  InterventionEventAttributes,
  SymptomEpisodeAttributes,
};
export {
  ALLERGY_REACTANT_REGISTRY,
  ALLERGY_REACTANT_CANONICAL_KEYS,
  resolveAllergyReactant,
} from './allergy-registry';
export type { AllergyReactantEntry, ReactantClass } from './allergy-registry';
export {
  IMMUNISATION_VACCINE_REGISTRY,
  IMMUNISATION_CANONICAL_KEYS,
  resolveVaccine,
} from './immunisation-registry';
export type { ImmunisationVaccineEntry, VaccineCategory } from './immunisation-registry';
export {
  VITAL_SIGNS_REGISTRY,
  VITAL_SIGNS_CANONICAL_KEYS,
  resolveVitalSign,
} from './vital-signs-registry';
export type { VitalSignEntry, VitalSignContext } from './vital-signs-registry';
export { METRIC_WINDOW_AGGREGATIONS, METRIC_WINDOW_GRANULARITIES } from './metric_window';
export type { MetricWindowAggregation, MetricWindowGranularity } from './metric_window';
export { OBSERVATION_CONTEXTS } from './observation';
export type { ObservationContext } from './observation';
export { INTERVENTION_EVENT_KINDS } from './intervention_event';
export type { InterventionEventKind } from './intervention_event';
export {
  SYMPTOM_SEVERITY_SCALES,
  QUALITY_OF_LIFE_IMPACTS,
} from './symptom';
export type { SymptomSeverityScale, QualityOfLifeImpact } from './symptom';
export { LIFESTYLE_SUBTYPES } from './lifestyle';
export type { LifestyleSubtype } from './lifestyle';
