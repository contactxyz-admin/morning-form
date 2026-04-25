/**
 * Seeded PRNG and autocorrelated time-series helpers for synthetic personas.
 *
 * Determinism is the central invariant: regenerating with the same seed must
 * produce byte-identical output so demos and snapshot tests stay stable. We
 * roll our own PRNG (Mulberry32) so the math is fully owned and reproducible
 * across Node versions; `Math.random()` is non-deterministic and unsuitable.
 *
 * The series model is:
 *
 *   value(t) = clamp(
 *     baseline +
 *       trendPre  * min(t, inflection) +
 *       trendPost * max(0, t - inflection) +
 *       AR(1) noise(t),
 *     [physicalMin, physicalMax]
 *   )
 *
 * AR(1) is `x_t = phi * x_{t-1} + eps_t` with `eps_t ~ N(0, sigma² (1 - phi²))`,
 * scaled so the long-run variance equals `sigma²` regardless of `phi`. This is
 * what gives the series its lived-in feel — adjacent points correlate instead
 * of jittering independently.
 */

export type Rng = () => number;

/**
 * Mulberry32 — 32-bit PRNG by Tommy Ettinger. Small, fast, good distribution
 * for fixture data; not cryptographic. Seed must be a non-negative integer.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller standard normal sample. Loops past u1 === 0 so the log() never
 * blows up.
 */
export function gaussian(rng: Rng): number {
  let u1 = 0;
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface SeriesSpec {
  /** Value at t = 0 before noise, before clamp. */
  readonly baseline: number;
  /** Slope per unit time (e.g., per month) before the inflection. */
  readonly trendPre: number;
  /** Slope per unit time after the inflection. */
  readonly trendPost: number;
  /** Time index at which the slope changes (in the same units as t). */
  readonly inflection: number;
  /** AR(1) coefficient. 0 = white noise, ~0.7 = mildly correlated. */
  readonly phi: number;
  /** Long-run noise standard deviation. */
  readonly sigma: number;
  /** Physical lower bound. Values below this are clamped. */
  readonly min: number;
  /** Physical upper bound. Values above this are clamped. */
  readonly max: number;
}

/**
 * Generate `n` values for the given spec, sampling at integer t in [0, n).
 * Pure: no global state, no I/O.
 */
export function generateSeries(rng: Rng, n: number, spec: SeriesSpec): number[] {
  const values = new Array<number>(n);
  const epsStd = spec.sigma * Math.sqrt(Math.max(0, 1 - spec.phi * spec.phi));
  let prevNoise = 0;
  for (let t = 0; t < n; t++) {
    const eps = gaussian(rng) * epsStd;
    const noise = spec.phi * prevNoise + eps;
    prevNoise = noise;
    const trendComponent =
      spec.trendPre * Math.min(t, spec.inflection) +
      spec.trendPost * Math.max(0, t - spec.inflection);
    const raw = spec.baseline + trendComponent + noise;
    values[t] = clamp(raw, spec.min, spec.max);
  }
  return values;
}

export function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/**
 * Round to `decimals` places. Stabilizes serialization across platforms so
 * snapshot tests don't drift over tiny floating-point differences.
 */
export function roundTo(x: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(x * factor) / factor;
}
