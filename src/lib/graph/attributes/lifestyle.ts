/**
 * Lifestyle node attribute contract (T7).
 *
 * Lifestyle is a broad family. T7 formalises it as a discriminated
 * union keyed on `lifestyleSubtype`, each branch carrying the fields
 * specific to that subtype. Legacy rows without a subtype remain valid
 * against the fallback branch (`_untyped`) so T7 does not break old
 * writes — extraction prompts set the subtype going forward.
 *
 * `supplement` is explicitly NOT a lifestyle subtype. Per T1, supplements
 * live on `medication` with `source: 'supplement'`. Attempting to set
 * `lifestyleSubtype: 'supplement'` is rejected with a schema error
 * pointing callers to the correct node type.
 */
import { z } from 'zod';

const LIFESTYLE_SUBTYPES = [
  'diet',
  'caffeine',
  'alcohol',
  'nicotine',
  'sauna',
  'cold_exposure',
  'travel',
  'shift_work',
  'stress',
  'exposure_air_quality',
  'exposure_mold',
  'exposure_environmental',
  'exercise_program',
  'other',
] as const;
export type LifestyleSubtype = (typeof LIFESTYLE_SUBTYPES)[number];

const BaseLifestyleFields = {
  category: z.string().optional(),
  frequency: z.string().optional(),
  quantity: z.string().optional(),
  quantityValue: z.number().optional(),
  quantityUnit: z.string().optional(),
  startedOn: z.string().optional(),
  endedOn: z.string().nullable().optional(),
  note: z.string().optional(),
};

const DietBranch = z
  .object({
    lifestyleSubtype: z.literal('diet'),
    pattern: z.string().optional(),
    avgProteinGramsPerDay: z.number().optional(),
    avgCarbsGramsPerDay: z.number().optional(),
    avgFatGramsPerDay: z.number().optional(),
    avgCaloriesPerDay: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const CaffeineBranch = z
  .object({
    lifestyleSubtype: z.literal('caffeine'),
    mgPerDay: z.number().optional(),
    lastIntakeTime: z.string().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const AlcoholBranch = z
  .object({
    lifestyleSubtype: z.literal('alcohol'),
    unitsPerWeek: z.number().optional(),
    pattern: z.enum(['none', 'weekly', 'daily', 'binge', 'unknown']).optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const NicotineBranch = z
  .object({
    lifestyleSubtype: z.literal('nicotine'),
    form: z.enum(['cigarette', 'vape', 'pouch', 'patch', 'other']).optional(),
    perDay: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const SaunaBranch = z
  .object({
    lifestyleSubtype: z.literal('sauna'),
    sessionsPerWeek: z.number().optional(),
    avgTemperatureC: z.number().optional(),
    avgDurationMinutes: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ColdExposureBranch = z
  .object({
    lifestyleSubtype: z.literal('cold_exposure'),
    sessionsPerWeek: z.number().optional(),
    avgTemperatureC: z.number().optional(),
    avgDurationMinutes: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const TravelBranch = z
  .object({
    lifestyleSubtype: z.literal('travel'),
    timezoneShiftHours: z.number().optional(),
    destination: z.string().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ShiftWorkBranch = z
  .object({
    lifestyleSubtype: z.literal('shift_work'),
    pattern: z.enum(['days', 'nights', 'rotating', 'on_call']).optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const StressBranch = z
  .object({
    lifestyleSubtype: z.literal('stress'),
    selfRated: z.number().min(0).max(10).optional(),
    primaryDomain: z.enum(['work', 'family', 'financial', 'health', 'other']).optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ExposureAirQualityBranch = z
  .object({
    lifestyleSubtype: z.literal('exposure_air_quality'),
    aqi: z.number().optional(),
    pm25: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ExposureMoldBranch = z
  .object({
    lifestyleSubtype: z.literal('exposure_mold'),
    location: z.string().optional(),
    severity: z.enum(['low', 'moderate', 'high']).optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ExposureEnvironmentalBranch = z
  .object({
    lifestyleSubtype: z.literal('exposure_environmental'),
    agent: z.string().optional(),
    severity: z.enum(['low', 'moderate', 'high']).optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const ExerciseProgramBranch = z
  .object({
    lifestyleSubtype: z.literal('exercise_program'),
    modality: z.string().optional(),
    sessionsPerWeek: z.number().optional(),
    avgDurationMinutes: z.number().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const OtherBranch = z
  .object({
    lifestyleSubtype: z.literal('other'),
    label: z.string().optional(),
    ...BaseLifestyleFields,
  })
  .passthrough();

// Legacy / untyped branch: rows written before T7 had no lifestyleSubtype.
// Preserves the pre-T7 passthrough shape so reads stay tolerant.
const UntypedBranch = z
  .object({
    ...BaseLifestyleFields,
  })
  .passthrough()
  .refine((v) => !('lifestyleSubtype' in v) || v.lifestyleSubtype === undefined, {
    message: 'lifestyleSubtype present but not matched to a known branch',
    path: ['lifestyleSubtype'],
  });

// Deliberate guard: callers tempted to write `lifestyleSubtype: 'supplement'`
// should instead use a `medication` node with `source: 'supplement'`. We
// surface that redirection as a schema error at the top level so the caller
// sees the correct path rather than a generic union mismatch.
const SupplementGuard = z
  .object({ lifestyleSubtype: z.literal('supplement') })
  .passthrough()
  .refine(() => false, {
    message:
      "Supplements belong on a `medication` node with `source: 'supplement'`, not on lifestyle.",
    path: ['lifestyleSubtype'],
  });

export const LifestyleAttributesSchema = z.union([
  DietBranch,
  CaffeineBranch,
  AlcoholBranch,
  NicotineBranch,
  SaunaBranch,
  ColdExposureBranch,
  TravelBranch,
  ShiftWorkBranch,
  StressBranch,
  ExposureAirQualityBranch,
  ExposureMoldBranch,
  ExposureEnvironmentalBranch,
  ExerciseProgramBranch,
  OtherBranch,
  SupplementGuard,
  UntypedBranch,
]);

export type LifestyleAttributes = z.infer<typeof LifestyleAttributesSchema>;

export { LIFESTYLE_SUBTYPES };
