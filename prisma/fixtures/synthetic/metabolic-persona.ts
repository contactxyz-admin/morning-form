/**
 * Synthetic persona: 38-year-old male with mild metabolic syndrome.
 *
 * 24 months of statistically realistic data with one inflection at month 14
 * (≈ 2025-08), when the persona starts a lifestyle intervention (resistance
 * training + mediterranean-leaning diet + caffeine cutoff). Pre-inflection
 * markers drift the wrong way slowly; post-inflection trends flatten or
 * reverse. The graph narrative in `graph-narrative.ts` references the same
 * inflection point so citations and data line up.
 *
 * Baselines and slopes are calibrated against published reference ranges
 * and pre-diabetic / metabolic-syndrome trajectories:
 *
 *   - HbA1c: 5.7–6.4% is "prediabetes" (ADA, UpToDate). Persona starts
 *     5.9, drifts up to ~6.1, then trends back down post-intervention.
 *   - Total cholesterol / LDL / HDL / TG: NICE/ESC mid-range targets;
 *     borderline TG, low-normal HDL.
 *   - Ferritin: low-normal at ~40 ng/mL drifting up after iron-aware diet
 *     change.
 *   - Fasting glucose: 5.6–6.9 mmol/L is impaired fasting glucose.
 *   - hsCRP: 1–3 mg/L is "average" cardio risk; persona sits ~2.5 dropping
 *     to ~1.5 on intervention.
 *   - BP: stage-1 hypertension boundary at ~135/85; trends downward
 *     post-intervention.
 *   - Sleep efficiency: 85% is the "good" threshold; persona is below.
 *   - HRV: 30s–40s ms is age-typical low-side; intervention nudges up.
 *
 * Numbers are illustrative for a demo, not clinical truth.
 */

import { generateSeries, makeRng, roundTo, type SeriesSpec } from './generators';

export const PERSONA_SEED = 38_2025_04;
export const MONTHS = 24;
export const DAYS = MONTHS * 30; // 720
export const WEEKS = Math.floor(DAYS / 7); // 102
export const QUARTERS = MONTHS / 3; // 8

/** Month index (0-based) at which the lifestyle intervention starts. */
export const INFLECTION_MONTH = 14;
export const INFLECTION_DAY = INFLECTION_MONTH * 30;
export const INFLECTION_WEEK = Math.floor(INFLECTION_DAY / 7);
export const INFLECTION_QUARTER = INFLECTION_MONTH / 3; // ~4.67

/**
 * The "today" anchor for the persona. Real time-stamps are computed as
 * `END_DATE - (DAYS - 1 - dayIndex) * 1day` so the most recent data point
 * lands on END_DATE and earlier points stretch back 24 months.
 */
export const END_DATE = new Date('2026-04-25T08:00:00.000Z');

export interface MetricSpec {
  /** Display label, used by graph narrative + UI. */
  readonly label: string;
  /** Provider attribution — matches HealthDataPoint.provider. */
  readonly provider: 'lab' | 'wearable' | 'cuff' | 'self_report';
  /** HealthDataPoint.category (loose convention). */
  readonly category: string;
  /** HealthDataPoint.metric — stable lookup key. */
  readonly metric: string;
  readonly unit: string;
  /** Decimals to round each value to before persisting. */
  readonly decimals: number;
  /** SeriesSpec, expressed in the metric's natural cadence (see `cadence`). */
  readonly series: SeriesSpec;
  /** Sampling cadence — how often to write a point. */
  readonly cadence: 'daily' | 'weekly' | 'quarterly';
}

/**
 * Each spec's `series.inflection` is in the same time unit as `cadence`
 * (months for quarterly, weeks for weekly, days for daily) so the math is
 * grounded in the user-visible time axis.
 */
export const METRICS: readonly MetricSpec[] = [
  // ── Quarterly labs (8 points) ─────────────────────────────────────────────
  {
    label: 'HbA1c',
    provider: 'lab',
    category: 'metabolic',
    metric: 'hba1c_percent',
    unit: '%',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 5.85,
      trendPre: 0.04, // +0.04% per quarter pre-intervention
      trendPost: -0.06, // returns toward baseline
      inflection: INFLECTION_QUARTER,
      phi: 0.3,
      sigma: 0.05,
      min: 4.0,
      max: 12.0,
    },
  },
  {
    label: 'Fasting glucose',
    provider: 'lab',
    category: 'metabolic',
    metric: 'fasting_glucose_mmol_l',
    unit: 'mmol/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 5.7,
      trendPre: 0.05,
      trendPost: -0.08,
      inflection: INFLECTION_QUARTER,
      phi: 0.2,
      sigma: 0.1,
      min: 3.0,
      max: 10.0,
    },
  },
  {
    label: 'Total cholesterol',
    provider: 'lab',
    category: 'lipids',
    metric: 'total_cholesterol_mmol_l',
    unit: 'mmol/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 5.6,
      trendPre: 0.05,
      trendPost: -0.15,
      inflection: INFLECTION_QUARTER,
      phi: 0.3,
      sigma: 0.15,
      min: 2.5,
      max: 9.0,
    },
  },
  {
    label: 'LDL cholesterol',
    provider: 'lab',
    category: 'lipids',
    metric: 'ldl_mmol_l',
    unit: 'mmol/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 3.6,
      trendPre: 0.04,
      trendPost: -0.12,
      inflection: INFLECTION_QUARTER,
      phi: 0.3,
      sigma: 0.12,
      min: 1.5,
      max: 7.0,
    },
  },
  {
    label: 'HDL cholesterol',
    provider: 'lab',
    category: 'lipids',
    metric: 'hdl_mmol_l',
    unit: 'mmol/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 1.05,
      trendPre: -0.01,
      trendPost: 0.04,
      inflection: INFLECTION_QUARTER,
      phi: 0.2,
      sigma: 0.05,
      min: 0.6,
      max: 2.5,
    },
  },
  {
    label: 'Triglycerides',
    provider: 'lab',
    category: 'lipids',
    metric: 'triglycerides_mmol_l',
    unit: 'mmol/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 2.1,
      trendPre: 0.06,
      trendPost: -0.18,
      inflection: INFLECTION_QUARTER,
      phi: 0.3,
      sigma: 0.15,
      min: 0.5,
      max: 5.0,
    },
  },
  {
    label: 'Ferritin',
    provider: 'lab',
    category: 'iron',
    metric: 'ferritin_ng_ml',
    unit: 'ng/mL',
    decimals: 0,
    cadence: 'quarterly',
    series: {
      baseline: 42,
      trendPre: -1.5,
      trendPost: 4,
      inflection: INFLECTION_QUARTER,
      phi: 0.4,
      sigma: 4,
      min: 10,
      max: 300,
    },
  },
  {
    label: 'TSH',
    provider: 'lab',
    category: 'thyroid',
    metric: 'tsh_miu_l',
    unit: 'mIU/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 2.4,
      trendPre: 0.0,
      trendPost: 0.0,
      inflection: INFLECTION_QUARTER,
      phi: 0.3,
      sigma: 0.25,
      min: 0.4,
      max: 6.0,
    },
  },
  {
    label: 'Free testosterone',
    provider: 'lab',
    category: 'hormonal',
    metric: 'free_testosterone_pg_ml',
    unit: 'pg/mL',
    decimals: 1,
    cadence: 'quarterly',
    series: {
      baseline: 9.5,
      trendPre: -0.1,
      trendPost: 0.4,
      inflection: INFLECTION_QUARTER,
      phi: 0.4,
      sigma: 0.6,
      min: 4.0,
      max: 25.0,
    },
  },
  {
    label: 'hsCRP',
    provider: 'lab',
    category: 'inflammation',
    metric: 'hscrp_mg_l',
    unit: 'mg/L',
    decimals: 2,
    cadence: 'quarterly',
    series: {
      baseline: 2.5,
      trendPre: 0.05,
      trendPost: -0.2,
      inflection: INFLECTION_QUARTER,
      phi: 0.2,
      sigma: 0.3,
      min: 0.2,
      max: 10.0,
    },
  },

  // ── Weekly weight (102 points) ────────────────────────────────────────────
  {
    label: 'Body weight',
    provider: 'self_report',
    category: 'anthropometric',
    metric: 'weight_kg',
    unit: 'kg',
    decimals: 1,
    cadence: 'weekly',
    series: {
      baseline: 88,
      trendPre: 0.05, // ~+5kg over 14 months unchecked
      trendPost: -0.12, // ~-5kg over 10 months on intervention
      inflection: INFLECTION_WEEK,
      phi: 0.6,
      sigma: 0.4,
      min: 60,
      max: 130,
    },
  },

  // ── Daily BP morning (720 points) ─────────────────────────────────────────
  {
    label: 'Systolic BP (morning)',
    provider: 'cuff',
    category: 'cardiovascular',
    metric: 'systolic_bp_mmhg_morning',
    unit: 'mmHg',
    decimals: 0,
    cadence: 'daily',
    series: {
      baseline: 134,
      trendPre: 0.005, // +1.5mmHg/year unchecked
      trendPost: -0.025, // ~-7mmHg over the post-intervention window
      inflection: INFLECTION_DAY,
      phi: 0.5,
      sigma: 4,
      min: 90,
      max: 180,
    },
  },
  {
    label: 'Diastolic BP (morning)',
    provider: 'cuff',
    category: 'cardiovascular',
    metric: 'diastolic_bp_mmhg_morning',
    unit: 'mmHg',
    decimals: 0,
    cadence: 'daily',
    series: {
      baseline: 86,
      trendPre: 0.003,
      trendPost: -0.015,
      inflection: INFLECTION_DAY,
      phi: 0.5,
      sigma: 3,
      min: 50,
      max: 120,
    },
  },

  // ── Daily sleep (720 points each) ─────────────────────────────────────────
  {
    label: 'Sleep efficiency',
    provider: 'wearable',
    category: 'sleep',
    metric: 'sleep_efficiency_pct',
    unit: '%',
    decimals: 1,
    cadence: 'daily',
    series: {
      baseline: 81,
      trendPre: -0.005,
      trendPost: 0.012,
      inflection: INFLECTION_DAY,
      phi: 0.4,
      sigma: 3.5,
      min: 50,
      max: 99,
    },
  },
  {
    label: 'Total sleep',
    provider: 'wearable',
    category: 'sleep',
    metric: 'total_sleep_hours',
    unit: 'hours',
    decimals: 2,
    cadence: 'daily',
    series: {
      baseline: 6.7,
      trendPre: -0.0008,
      trendPost: 0.0015,
      inflection: INFLECTION_DAY,
      phi: 0.4,
      sigma: 0.5,
      min: 3.0,
      max: 10.0,
    },
  },
  {
    label: 'HRV',
    provider: 'wearable',
    category: 'recovery',
    metric: 'hrv_ms',
    unit: 'ms',
    decimals: 0,
    cadence: 'daily',
    series: {
      baseline: 38,
      trendPre: -0.01,
      trendPost: 0.04,
      inflection: INFLECTION_DAY,
      phi: 0.5,
      sigma: 4,
      min: 12,
      max: 100,
    },
  },

  // ── Weekly self-report (102 points each) ─────────────────────────────────
  {
    label: 'Mood (self-report)',
    provider: 'self_report',
    category: 'mood',
    metric: 'mood_score_1_10',
    unit: 'score',
    decimals: 0,
    cadence: 'weekly',
    series: {
      baseline: 6,
      trendPre: -0.01,
      trendPost: 0.03,
      inflection: INFLECTION_WEEK,
      phi: 0.5,
      sigma: 0.7,
      min: 1,
      max: 10,
    },
  },
  {
    label: 'Energy (self-report)',
    provider: 'self_report',
    category: 'energy',
    metric: 'energy_score_1_10',
    unit: 'score',
    decimals: 0,
    cadence: 'weekly',
    series: {
      baseline: 5,
      trendPre: -0.01,
      trendPost: 0.04,
      inflection: INFLECTION_WEEK,
      phi: 0.5,
      sigma: 0.7,
      min: 1,
      max: 10,
    },
  },
];

export interface GeneratedDataPoint {
  readonly provider: string;
  readonly category: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  /** ISO timestamp string. */
  readonly timestamp: string;
}

/**
 * Compute the timestamp for the i-th sample in a given cadence, anchored so
 * the last sample lands on END_DATE.
 */
export function timestampFor(cadence: MetricSpec['cadence'], i: number, totalSamples: number): Date {
  const dayMs = 24 * 60 * 60 * 1000;
  const stepDays = cadence === 'daily' ? 1 : cadence === 'weekly' ? 7 : 90;
  const lastIndex = totalSamples - 1;
  return new Date(END_DATE.getTime() - (lastIndex - i) * stepDays * dayMs);
}

export function samplesForCadence(cadence: MetricSpec['cadence']): number {
  if (cadence === 'daily') return DAYS;
  if (cadence === 'weekly') return WEEKS;
  return QUARTERS;
}

/**
 * Generate the full persona dataset deterministically. Each metric gets its
 * own RNG keyed off `seed + metricIndex` so adding or reordering metrics
 * does not perturb existing series — important for stable snapshots when
 * the persona evolves.
 */
export function generatePersonaData(seed: number = PERSONA_SEED): GeneratedDataPoint[] {
  const out: GeneratedDataPoint[] = [];
  for (let i = 0; i < METRICS.length; i++) {
    const spec = METRICS[i];
    const rng = makeRng(seed + i);
    const n = samplesForCadence(spec.cadence);
    const series = generateSeries(rng, n, spec.series);
    for (let s = 0; s < n; s++) {
      out.push({
        provider: spec.provider,
        category: spec.category,
        metric: spec.metric,
        value: roundTo(series[s], spec.decimals),
        unit: spec.unit,
        timestamp: timestampFor(spec.cadence, s, n).toISOString(),
      });
    }
  }
  return out;
}
