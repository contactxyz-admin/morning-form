/**
 * Vital-signs registry for `observation` nodes (T4).
 *
 * Separate from `BIOMARKER_REGISTRY` — vitals are non-lab observations
 * (home BP cuffs, clinic readings, wearable trends, body-composition
 * scan outputs) with their own reference ranges and display conventions.
 *
 * The registry is the canonical-key allowlist for observation nodes.
 * Unknown keys are not rejected at the schema level (observation schema
 * does not enum-constrain `canonicalKey`), but UI + retrieval callers
 * should prefer registry-backed entries so units and display names are
 * consistent.
 */

export type VitalSignContext = 'vital' | 'body_composition' | 'cardiorespiratory';

export interface VitalSignEntry {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly unit: string;
  readonly context: VitalSignContext;
  readonly aliases?: readonly string[];
}

export const VITAL_SIGNS_REGISTRY: readonly VitalSignEntry[] = [
  { canonicalKey: 'bp_systolic', displayName: 'Systolic BP', unit: 'mmHg', context: 'vital', aliases: ['systolic', 'sbp'] },
  { canonicalKey: 'bp_diastolic', displayName: 'Diastolic BP', unit: 'mmHg', context: 'vital', aliases: ['diastolic', 'dbp'] },
  { canonicalKey: 'pulse_resting', displayName: 'Resting pulse', unit: 'bpm', context: 'cardiorespiratory', aliases: ['resting heart rate', 'resting hr', 'rhr'] },
  { canonicalKey: 'temperature_core', displayName: 'Core temperature', unit: '°C', context: 'vital', aliases: ['temperature', 'body temp'] },
  { canonicalKey: 'respiratory_rate', displayName: 'Respiratory rate', unit: 'breaths/min', context: 'cardiorespiratory', aliases: ['resp rate', 'rr'] },
  { canonicalKey: 'spo2', displayName: 'SpO₂', unit: '%', context: 'cardiorespiratory', aliases: ['oxygen saturation', 'sats'] },
  { canonicalKey: 'weight', displayName: 'Weight', unit: 'kg', context: 'body_composition', aliases: ['body weight'] },
  { canonicalKey: 'height', displayName: 'Height', unit: 'cm', context: 'body_composition' },
  { canonicalKey: 'bmi', displayName: 'BMI', unit: 'kg/m²', context: 'body_composition', aliases: ['body mass index'] },
  { canonicalKey: 'waist_circumference', displayName: 'Waist circumference', unit: 'cm', context: 'body_composition', aliases: ['waist'] },
  { canonicalKey: 'body_fat_percent', displayName: 'Body fat %', unit: '%', context: 'body_composition', aliases: ['body fat', 'bf%'] },
] as const;

export const VITAL_SIGNS_CANONICAL_KEYS: ReadonlySet<string> = new Set(
  VITAL_SIGNS_REGISTRY.map((v) => v.canonicalKey),
);

const BY_LABEL: ReadonlyMap<string, VitalSignEntry> = (() => {
  const map = new Map<string, VitalSignEntry>();
  for (const entry of VITAL_SIGNS_REGISTRY) {
    map.set(entry.canonicalKey.toLowerCase(), entry);
    map.set(entry.displayName.toLowerCase(), entry);
    for (const alias of entry.aliases ?? []) map.set(alias.toLowerCase(), entry);
  }
  return map;
})();

/**
 * Case-insensitive lookup across `canonicalKey`, `displayName`, and
 * `aliases`. Returns `undefined` for unknown vitals — callers fall back
 * to writing the raw canonical key and the observation is still valid
 * per the schema, just unregistered.
 */
export function resolveVitalSign(label: string): VitalSignEntry | undefined {
  return BY_LABEL.get(label.trim().toLowerCase());
}
