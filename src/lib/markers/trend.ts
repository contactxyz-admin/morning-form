/**
 * Descriptive forward-looking trend reader (longitudinal-trajectory plan
 * 2026-06-30-001 U11).
 *
 * Describes the DIRECTION and MOMENTUM of a marker over its last N dated
 * points — improving / worsening / stable, with magnitude and "since when" —
 * reference-aware via the shared `classifyChange`. This is the regulator-safe
 * version of "prediction": it characterises *observed* history, NOT a forecast.
 *
 * It deliberately does NOT:
 *  - predict a future value,
 *  - emit a probability or risk score,
 *  - rank diagnoses or assert causation.
 *
 * Pure and Prisma-free: callers pass the series (e.g. from
 * `buildMarkerTrajectory`) and the marker's reference range. "improving" means
 * moving toward / further into the reference interval (the same range-relative
 * semantics as the panel diff), never "clinically good"; without a reference
 * range direction is reported as `stable` and `referenceAware: false`, with the
 * raw movement still exposed via `rawDirection`.
 */

import { classifyChange } from './classify-change';

/** Minimal point shape; `SeriesPoint` from the trajectory reader satisfies it. */
export interface TrendPoint {
  value: number;
  unit: string;
  timestamp: string;
}

export type TrendDirection = 'improving' | 'worsening' | 'stable';
export type RawDirection = 'up' | 'down' | 'flat';
/**
 * How much to trust the direction:
 *  - `single-reading`: one point — no trend, a retest candidate (U12).
 *  - `low`: two points, or ≥3 with a non-monotonic (zig-zag) path.
 *  - `ok`: ≥3 points moving consistently in one direction.
 */
export type TrendConfidence = 'single-reading' | 'low' | 'ok';

export interface TrendDescription {
  direction: TrendDirection;
  /** Raw value movement over the window, independent of the reference range. */
  rawDirection: RawDirection;
  /** Whether a reference range informed `direction` (false → direction is `stable`). */
  referenceAware: boolean;
  /** |latest − earliest| over the considered window, in `unit`. */
  magnitude: number;
  fromValue: number;
  toValue: number;
  /** ISO date of the earliest considered point ("since when"). */
  sinceAt: string;
  /** ISO date of the latest point. */
  asOfAt: string;
  /** Points considered (≤ window). */
  pointCount: number;
  confidence: TrendConfidence;
  unit: string;
}

export interface TrendOptions {
  /** How many most-recent points to consider. Default 4. */
  window?: number;
}

const DEFAULT_WINDOW = 4;

/**
 * Describe a marker's trend over its last `window` dated points. Returns null
 * for an empty series. Points may arrive in any order; they're sorted
 * ascending by timestamp and the most-recent `window` are considered.
 */
export function describeTrend(
  points: readonly TrendPoint[],
  range?: { low: number | null; high: number | null },
  opts: TrendOptions = {},
): TrendDescription | null {
  if (points.length === 0) return null;
  const window = opts.window ?? DEFAULT_WINDOW;

  const sorted = points
    .filter((p) => typeof p.value === 'number' && Number.isFinite(p.value) && !!p.timestamp)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sorted.length === 0) return null;

  const considered = sorted.slice(-window);
  const first = considered[0];
  const last = considered[considered.length - 1];
  const n = considered.length;
  const unit = considered.find((p) => p.unit)?.unit ?? '';

  // Single reading — no trend to assert; a retest candidate.
  if (n === 1) {
    return {
      direction: 'stable',
      rawDirection: 'flat',
      referenceAware: false,
      magnitude: 0,
      fromValue: first.value,
      toValue: last.value,
      sinceAt: first.timestamp,
      asOfAt: last.timestamp,
      pointCount: 1,
      confidence: 'single-reading',
      unit,
    };
  }

  const low = range?.low ?? null;
  const high = range?.high ?? null;
  const { classification } = classifyChange(first.value, last.value, low, high);
  const referenceAware = classification !== 'unclassified';

  const direction: TrendDirection =
    classification === 'improved' ? 'improving' : classification === 'worsened' ? 'worsening' : 'stable';

  const rawDelta = last.value - first.value;
  const rawDirection: RawDirection = rawDelta > 0 ? 'up' : rawDelta < 0 ? 'down' : 'flat';

  // Confidence: ≥3 consistently-moving points = ok; 2 points, or a zig-zag
  // path, = low. A non-monotonic series (both an up-step and a down-step) is
  // too noisy to call a confident trend.
  let confidence: TrendConfidence;
  if (n === 2) {
    confidence = 'low';
  } else {
    confidence = isMonotonic(considered) ? 'ok' : 'low';
  }

  return {
    direction,
    rawDirection,
    referenceAware,
    magnitude: Math.abs(rawDelta),
    fromValue: first.value,
    toValue: last.value,
    sinceAt: first.timestamp,
    asOfAt: last.timestamp,
    pointCount: n,
    confidence,
    unit,
  };
}

// ---------------------------------------------------------------------------
// Derived views (plan 2026-06-30-001 U12)
// ---------------------------------------------------------------------------

export interface MarkerSeriesInput {
  marker: string;
  points: TrendPoint[];
  range?: { low: number | null; high: number | null };
}

export interface MarkerTrend {
  marker: string;
  trend: TrendDescription;
}

/** Describe every marker's trend, dropping those with no usable points. */
export function buildMarkerTrends(
  inputs: readonly MarkerSeriesInput[],
  opts: TrendOptions = {},
): MarkerTrend[] {
  const out: MarkerTrend[] = [];
  for (const input of inputs) {
    const trend = describeTrend(input.points, input.range, opts);
    if (trend) out.push({ marker: input.marker, trend });
  }
  return out;
}

/**
 * "Markers trending in the wrong direction" (design doc Q4): markers moving
 * AWAY from their reference range. Range-aware by construction (`worsening`
 * only arises when a reference range was available), and excludes
 * single-reading markers (no trend to call). Sorted by marker name for a
 * deterministic order — NOT by magnitude, since magnitudes in different units
 * (e.g. nmol/L vs mU/L) aren't comparable across markers.
 */
export function markersTrendingWrongDirection(trends: readonly MarkerTrend[]): MarkerTrend[] {
  return trends
    .filter((t) => t.trend.direction === 'worsening' && t.trend.confidence !== 'single-reading')
    .sort((a, b) => a.marker.localeCompare(b.marker));
}

/**
 * "Single-reading, low-confidence markers that deserve a retest" (design doc
 * Q10): exactly one dated reading, so no trend can be asserted.
 */
export function singleReadingMarkers(trends: readonly MarkerTrend[]): MarkerTrend[] {
  return trends.filter((t) => t.trend.confidence === 'single-reading');
}

/**
 * A DESCRIPTIVE retest suggestion for a marker — "a repeat test would confirm…"
 * — never a treatment, dose, or causal claim (it is written to pass the
 * forbidden-phrase scanner incl. the U14 false-causality patterns). Returns
 * null for a confident, in-range-or-improving marker that doesn't warrant one.
 */
export function retestSuggestion(t: MarkerTrend): string | null {
  const since = t.trend.sinceAt.slice(0, 10);
  if (t.trend.confidence === 'single-reading') {
    return `You have a single reading for ${t.marker}; a repeat test would confirm whether this is a trend.`;
  }
  if (t.trend.direction === 'worsening') {
    return `${t.marker} has moved away from its reference range since ${since}; a repeat test would confirm this direction.`;
  }
  if (t.trend.confidence === 'low' && t.trend.direction === 'improving') {
    return `${t.marker} appears to be moving toward its reference range since ${since}; a repeat test would confirm this direction.`;
  }
  return null;
}

/** True when consecutive deltas never reverse sign (flats allowed). */
function isMonotonic(points: readonly TrendPoint[]): boolean {
  let sawUp = false;
  let sawDown = false;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].value - points[i - 1].value;
    if (d > 0) sawUp = true;
    else if (d < 0) sawDown = true;
    if (sawUp && sawDown) return false;
  }
  return true;
}
