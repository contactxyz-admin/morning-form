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
  'sun_exposure',
  'social_isolation',
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

const SunExposureBranch = z
  .object({
    lifestyleSubtype: z.literal('sun_exposure'),
    sessionsPerWeek: z.number().optional(),
    avgDurationMinutes: z.number().optional(),
    uvIndex: z.number().optional(),
    usedSunscreen: z.boolean().optional(),
    ...BaseLifestyleFields,
  })
  .strict();

const SocialIsolationBranch = z
  .object({
    lifestyleSubtype: z.literal('social_isolation'),
    selfRated: z.number().min(0).max(10).optional(),
    // MNT-04 carry-over from PR #80 review: parity with alcohol/shift_work
    // pattern enums that include `'none'` for "doesn't apply to me" and
    // `'unknown'` for "user didn't say". Extraction prompts can now emit
    // either without the write rejecting.
    pattern: z
      .enum(['none', 'rare', 'occasional', 'frequent', 'daily', 'unknown'])
      .optional(),
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

// Sentinel branch for the redirection guard below. Accepts the shape so the
// discriminated union can match successfully, then `superRefine` on the top
// schema produces the redirection error. Without this branch, 'supplement'
// would fail at discriminator lookup and `superRefine` would never run.
const SupplementSentinelBranch = z
  .object({
    lifestyleSubtype: z.literal('supplement'),
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

// When `lifestyleSubtype` is present, route through a discriminated union so
// Zod gives branch-specific error messages instead of collapsing every
// branch failure into a single "no union member matched" error. When the
// field is absent, fall back to `UntypedBranch` for pre-T7 legacy rows.
// Ordering matters: `DiscriminatedTypedBranches` must be tried first — a
// passthrough `UntypedBranch` would otherwise swallow any typed row.
const DiscriminatedTypedBranches = z.discriminatedUnion('lifestyleSubtype', [
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
  SunExposureBranch,
  SocialIsolationBranch,
  OtherBranch,
  SupplementSentinelBranch,
]);

// Deliberate guard: callers tempted to write `lifestyleSubtype: 'supplement'`
// should instead use a `medication` node with `source: 'supplement'`.
//
// Two mechanisms cooperate:
//   1. A preprocess step normalises `lifestyleSubtype` to lowercase so any
//      casing variant the extraction LLM emits ("SUPPLEMENT", "Supplement")
//      still routes through the sentinel branch and hits the redirection
//      refine below — without it, uppercase values fail the discriminated
//      union with a generic mismatch and never reach the refine.
//   2. A top-level superRefine produces the redirection error. Kept at the
//      top level because `.refine` on a ZodObject returns ZodEffects, which
//      z.discriminatedUnion does not accept as a member.
export const LifestyleAttributesSchema = z
  .preprocess((value) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'lifestyleSubtype' in (value as Record<string, unknown>)
    ) {
      const subtype = (value as { lifestyleSubtype?: unknown }).lifestyleSubtype;
      if (typeof subtype === 'string') {
        return { ...(value as Record<string, unknown>), lifestyleSubtype: subtype.toLowerCase() };
      }
    }
    return value;
  }, z.union([DiscriminatedTypedBranches, UntypedBranch]))
  .superRefine((value, ctx) => {
    if (
      value &&
      typeof value === 'object' &&
      'lifestyleSubtype' in value &&
      (value as { lifestyleSubtype?: unknown }).lifestyleSubtype === 'supplement'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lifestyleSubtype'],
        message:
          "Supplements belong on a `medication` node with `source: 'supplement'`, not on lifestyle.",
      });
    }
  });

// Exclude the supplement sentinel from the exported static type. The sentinel
// branch exists only so the discriminated union can match a 'supplement' value
// long enough for the superRefine to emit the redirection error at runtime —
// it must never be a legal TypeScript-visible shape.
export type LifestyleAttributes = Exclude<
  z.infer<typeof LifestyleAttributesSchema>,
  { lifestyleSubtype: 'supplement' }
>;

export { LIFESTYLE_SUBTYPES };
