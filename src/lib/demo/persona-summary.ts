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
  METRICS,
  PERSONA_SEED,
  type GeneratedDataPoint,
  type MetricSpec,
} from '../../../prisma/fixtures/synthetic/metabolic-persona';

export interface PersonaMetricSummary {
  readonly metric: string;
  readonly displayName: string;
  readonly unit: string;
  readonly cadence: MetricSpec['cadence'];
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

/** O(1) lookup into the fixture's MetricSpec by stable metric key. */
const SPEC_BY_METRIC: ReadonlyMap<string, MetricSpec> = new Map(
  METRICS.map((m) => [m.metric, m]),
);

/**
 * Lower-is-better metrics. Used to label the "improvement direction"
 * post-inflection without re-deriving it from the data. Not on
 * MetricSpec because the fixture is also consumed by the seed script
 * and graph narrative, neither of which need this notion.
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

const CADENCE_INFLECTION: Record<MetricSpec['cadence'], number> = {
  daily: INFLECTION_DAY,
  weekly: INFLECTION_WEEK,
  quarterly: Math.floor(INFLECTION_QUARTER),
};

// Populated once per Node.js process lifetime; safe across concurrent
// requests because generatePersonaData is deterministic and stateless.
let cachedPersonaData: readonly GeneratedDataPoint[] | null = null;

function loadPersonaData(): readonly GeneratedDataPoint[] {
  if (cachedPersonaData === null) cachedPersonaData = generatePersonaData(PERSONA_SEED);
  return cachedPersonaData;
}

export function getMetricSummary(metric: string): PersonaMetricSummary | null {
  const spec = SPEC_BY_METRIC.get(metric);
  if (!spec) return null;

  const all = loadPersonaData();
  const points = all
    .filter((p) => p.metric === metric)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const inflectionIndex = Math.min(CADENCE_INFLECTION[spec.cadence], values.length - 1);

  const first = values[0];
  const last = values[values.length - 1];
  const preInflection = values[inflectionIndex];

  const lowerIsBetter = LOWER_IS_BETTER.has(metric);
  const delta = last - first;
  const improvedDirection = lowerIsBetter ? delta < 0 : delta > 0;

  return {
    metric,
    displayName: spec.label,
    unit: spec.unit,
    cadence: spec.cadence,
    first,
    last,
    preInflection,
    delta,
    improvement: lowerIsBetter ? 'down' : 'up',
    direction: improvedDirection ? 'improved' : 'worsened',
    values: downsample(values, 90),
    inflectionIndex: Math.round((inflectionIndex / (values.length - 1)) * Math.min(values.length - 1, 89)),
    decimals: spec.decimals,
  };
}

/**
 * Reduce a series to at most `maxPoints` evenly-spaced samples. Daily
 * series of 720 points become 90 — plenty of resolution for an editorial
 * sparkline at ~320px wide and faster to render.
 */
function downsample(values: readonly number[], maxPoints: number): number[] {
  if (maxPoints < 2) return values.length === 0 ? [] : [values[0]];
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
