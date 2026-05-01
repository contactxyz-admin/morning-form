/**
 * Server-side helpers for the public `/demo` surfaces.
 *
 * Pulls the metabolic persona's 24-month synthetic series straight out of
 * `generatePersonaData`, then carves out per-metric summaries — first
 * value, last value, inflection-relative slope, and a downsampled series
 * suitable for sparkline rendering. No DB, no auth.
 */

import {
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
  // Need at least 2 points: inflectionIndex math divides by (length - 1),
  // and Sparkline itself early-returns on values.length < 2.
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const inflectionIndex = Math.min(CADENCE_INFLECTION[spec.cadence], values.length - 1);

  const first = values[0];
  const last = values[values.length - 1];
  const preInflection = values[inflectionIndex];

  const lowerIsBetter = spec.improvementDirection === 'lower';
  // Compare last vs preInflection rather than last vs first: the persona
  // arc is "drift up to a peak at inflection, then recover", and on
  // noisy daily series the first sample is just noise around baseline,
  // so first-vs-last can sit either side of zero on randomness alone.
  // preInflection is the value at the moment the protocol started — the
  // honest reference point for "did the protocol work".
  const delta = last - preInflection;
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
 *
 * Exported for testing. Edge-case contract:
 *   - empty input → empty output (regardless of maxPoints)
 *   - maxPoints < 2 → at most one sample (the first), to avoid the
 *     divide-by-zero on (maxPoints - 1)
 *   - values.length <= maxPoints → returns a copy unchanged
 */
export function downsample(values: readonly number[], maxPoints: number): number[] {
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

/**
 * Arrow glyph for the demo overview's MetricCard, derived from the full
 * (direction, improvement) truth table. `improvement` encodes which way
 * is good for this metric; `direction` encodes whether the persona
 * moved that way. The arrow follows the *physical* direction of the
 * line, so it is `improvement` for "improved" cards and the inverse
 * for "worsened" cards.
 */
export function arrowFor(
  summary: Pick<PersonaMetricSummary, 'direction' | 'improvement'>,
): '↗' | '↘' {
  const movedUp =
    summary.direction === 'improved'
      ? summary.improvement === 'up'
      : summary.improvement === 'down';
  return movedUp ? '↗' : '↘';
}

export const PERSONA_INFLECTION_MONTH = INFLECTION_MONTH;
