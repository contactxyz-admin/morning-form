/**
 * Observation node attribute contract (T4).
 *
 * Represents one measured vital sign or body-composition value —
 * blood pressure, pulse, weight, BMI, SpO₂. Distinct from `biomarker`
 * (lab analytes) and `metric_window` (wearable aggregations).
 *
 * `canonicalKey` on the parent node is typically one of
 * `VITAL_SIGNS_CANONICAL_KEYS`, but unknown keys are accepted — the
 * registry is advisory, not enforcing. `context` tracks where the
 * reading came from so downstream ranking can prefer clinic-grade
 * measurements over wearable estimates.
 */
import { z } from 'zod';

export const OBSERVATION_CONTEXTS = ['clinic', 'home', 'wearable', 'self', 'unknown'] as const;
export type ObservationContext = (typeof OBSERVATION_CONTEXTS)[number];

export const ObservationAttributesSchema = z
  .object({
    value: z.number(),
    unit: z.string(),
    measuredAt: z.string(),
    context: z.enum(OBSERVATION_CONTEXTS).optional(),
    device: z.string().optional(),
    performer: z.string().optional(),
    bodySite: z.string().optional(),
    method: z.string().optional(),
    linkedEncounterId: z.string().optional(),
    linkedDocumentId: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

export type ObservationAttributes = z.infer<typeof ObservationAttributesSchema>;
