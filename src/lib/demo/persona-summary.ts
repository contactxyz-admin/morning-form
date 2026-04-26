/**
 * Server-side helpers for the public `/demo` surfaces.
 *
 * Pulls the metabolic persona's 24-month synthetic series straight out of
 * `generatePersonaData`, then carves out per-metric summaries — first
 * value, last value, inflection-relative slope, and a downsampled series
 * suitable for sparkline rendering. No DB, no auth.
 */

import {
  END_DATE,
  generatePersonaData,
  INFLECTION_DAY,
  INFLECTION_MONTH,
  INFLECTION_QUARTER,
  INFLECTION_WEEK,
  PERSONA_SEED,
  type GeneratedDataPoint,
} from '../../../prisma/fixtures/synthetic/metabolic-persona';

export interface MetricSummary {
  readonly metric: string;
  readonly displayName: string;
  readonly unit: string;
  readonly cadence: 'daily' | 'weekly' | 'quarterly';
  readonly first: number;
  readonly last: number;
  readonly preInflection: number;
  readonly delta: number;
  readonly improvement: 'up' | 'down';
  readonly direction: 'improved' | 'worsened';
  readonly values: readonly number[];
  readonly inflectionIndex: number;
  readonly decimals: number;
}

const METRIC_DISPLAY: Record<string, string> = {
  hba1c_percent: 'HbA1c',
  fasting_glucose_mmol_l: 'Fasting glucose',
  total_cholesterol_mmol_l: 'Total cholesterol',
  ldl_mmol_l: 'LDL cholesterol',
  hdl_mmol_l: 'HDL cholesterol',
  triglycerides_mmol_l: 'Triglycerides',
  ferritin_ng_ml: 'Ferritin',
  tsh_miu_l: 'TSH',
  free_testosterone_pg_ml: 'Free testosterone',
  hscrp_mg_l: 'hs-CRP',
  weight_kg: 'Weight',
  systolic_bp_mmhg_morning: 'Systolic BP',
  diastolic_bp_mmhg_morning: 'Diastolic BP',
  sleep_efficiency_pct: 'Sleep efficiency',
  total_sleep_hours: 'Total sleep',
  hrv_ms: 'HRV',
  mood_score_1_10: 'Mood',
  energy_score_1_10: 'Energy',
};

/**
 * Lower-is-better metrics. Used to label the "improvement direction"
 * post-inflection without re-deriving it from the data.
 */
const LOWER_IS_BETTER = new Set([
  'hba1c_percent',
  'fasting_glucose_mmol_l',
  'total_cholesterol_mmol_l',
  'ldl_mmol_l',
  'triglycerides_mmol_l',
  'tsh_miu_l',
  'hscrp_mg_l',
  'weight_kg',
  'systolic_bp_mmhg_morning',
  'diastolic_bp_mmhg_morning',
]);

const DECIMALS: Record<string, number> = {
  hba1c_percent: 2,
  fasting_glucose_mmol_l: 1,
  total_cholesterol_mmol_l: 1,
  ldl_mmol_l: 1,
  hdl_mmol_l: 1,
  triglycerides_mmol_l: 1,
  ferritin_ng_ml: 0,
  tsh_miu_l: 1,
  free_testosterone_pg_ml: 1,
  hscrp_mg_l: 1,
  weight_kg: 1,
  systolic_bp_mmhg_morning: 0,
  diastolic_bp_mmhg_morning: 0,
  sleep_efficiency_pct: 1,
  total_sleep_hours: 1,
  hrv_ms: 0,
  mood_score_1_10: 1,
  energy_score_1_10: 1,
};

const CADENCE_INFLECTION: Record<MetricSummary['cadence'], number> = {
  daily: INFLECTION_DAY,
  weekly: INFLECTION_WEEK,
  quarterly: Math.floor(INFLECTION_QUARTER),
};

let _cached: GeneratedDataPoint[] | null = null;

function loadPersonaData(): GeneratedDataPoint[] {
  if (_cached === null) _cached = generatePersonaData(PERSONA_SEED);
  return _cached;
}

export function getMetricSummary(metric: string): MetricSummary | null {
  const all = loadPersonaData();
  const points = all
    .filter((p) => p.metric === metric)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  if (points.length === 0) return null;

  const cadence = inferCadence(points.length);
  const values = points.map((p) => p.value);
  const inflectionIndex = Math.min(CADENCE_INFLECTION[cadence], values.length - 1);

  const first = values[0];
  const last = values[values.length - 1];
  const preInflection = values[inflectionIndex];

  const lowerIsBetter = LOWER_IS_BETTER.has(metric);
  const delta = last - first;
  const improvedDirection = lowerIsBetter ? delta < 0 : delta > 0;

  return {
    metric,
    displayName: METRIC_DISPLAY[metric] ?? metric,
    unit: points[0].unit,
    cadence,
    first,
    last,
    preInflection,
    delta,
    improvement: lowerIsBetter ? 'down' : 'up',
    direction: improvedDirection ? 'improved' : 'worsened',
    values: downsample(values, 90),
    inflectionIndex: Math.round((inflectionIndex / (values.length - 1)) * Math.min(values.length - 1, 89)),
    decimals: DECIMALS[metric] ?? 1,
  };
}

function inferCadence(n: number): MetricSummary['cadence'] {
  if (n === 8) return 'quarterly';
  if (n >= 700) return 'daily';
  return 'weekly';
}

/**
 * Reduce a series to at most `maxPoints` evenly-spaced samples. Daily
 * series of 720 points become 90 — plenty of resolution for an editorial
 * sparkline at ~320px wide and faster to render.
 */
function downsample(values: readonly number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return [...values];
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor((i / (maxPoints - 1)) * (values.length - 1));
    out.push(values[idx]);
  }
  return out;
}

export function formatValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export const PERSONA_END_DATE = END_DATE;
export const PERSONA_INFLECTION_MONTH = INFLECTION_MONTH;
