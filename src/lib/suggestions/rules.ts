/**
 * Suggestions rule registry.
 *
 * Each rule is a pure function over the canonical HealthDataPoint stream.
 * Titles are user-facing strings and are treated as a safety contract:
 * rule tests use `toBe` (verbatim equality), so a refactor that rewords
 * a rule will fail loudly. New rules should add `toBe` assertions in
 * rules.test.ts — not `toContain` — for the same reason.
 *
 * Mutual exclusion lives inside rules (a rule returns `null` when a
 * stronger rule in the same family should win). The evaluator is
 * intentionally dumb.
 */

import type { HealthDataPoint } from '@/types';
import { computeBaselines, utcDayKey } from './baselines';
import type { EvaluateContext, Rule, RuleOutcome } from './types';

function mostRecent(points: HealthDataPoint[], metric: string): HealthDataPoint | null {
  const matching = points.filter((p) => p.metric === metric);
  if (matching.length === 0) return null;
  return matching.reduce((latest, p) =>
    p.timestamp.localeCompare(latest.timestamp) > 0 ? p : latest,
  );
}

// Fasting window: 04:00 inclusive to 08:00 exclusive, interpreted in UTC.
// Timezone-aware handling is deferred (see the suggestions plan's Open Questions).
function isFastingWindow(timestamp: string): boolean {
  const hour = new Date(timestamp).getUTCHours();
  return hour >= 4 && hour < 8;
}

function mostRecentFastingGlucose(points: HealthDataPoint[]): HealthDataPoint | null {
  const fasting = points.filter((p) => p.metric === 'glucose' && isFastingWindow(p.timestamp));
  if (fasting.length === 0) return null;
  return fasting.reduce((latest, p) =>
    p.timestamp.localeCompare(latest.timestamp) > 0 ? p : latest,
  );
}

export const recoveryLowRule: Rule = {
  kind: 'recovery_low',
  evaluate(points) {
    const latest = mostRecent(points, 'recovery_score');
    if (!latest || latest.value >= 40) return null;
    return {
      kind: 'recovery_low',
      title: 'Prioritise recovery today — consider a lighter session and an earlier bedtime',
      tier: 'moderate',
      triggeringMetricIds: latest.id ? [latest.id] : [],
    };
  },
};

export const glucoseFastingElevatedRule: Rule = {
  kind: 'glucose_fasting_elevated',
  evaluate(points) {
    const latest = mostRecentFastingGlucose(points);
    if (!latest) return null;
    // Mutual exclusion: diabetic range wins.
    if (latest.value >= 126) return null;
    if (latest.value < 100) return null;
    return {
      kind: 'glucose_fasting_elevated',
      title: 'Trim refined carbs at dinner and walk 10 minutes after meals',
      tier: 'moderate',
      triggeringMetricIds: latest.id ? [latest.id] : [],
    };
  },
};

export const glucoseFastingDiabeticRule: Rule = {
  kind: 'glucose_fasting_diabetic',
  evaluate(points) {
    const latest = mostRecentFastingGlucose(points);
    if (!latest || latest.value < 126) return null;
    return {
      kind: 'glucose_fasting_diabetic',
      title:
        'Please consult a clinician — morning-form should not be your primary intervention here',
      tier: 'strong',
      triggeringMetricIds: latest.id ? [latest.id] : [],
    };
  },
};

// Personal-baseline anomaly detection (RHRAD; Snyder et al. 2021). Fixed
// clinical thresholds miss a change that is abnormal *for this person* but
// still inside the population-normal band. This rule flags a resting-heart-
// rate reading that sits more than k standard deviations above the user's own
// 30-day median — the RHRAD elevated-RHR early-warning signal.
//
// Deliberate guards (bias hard toward precision, not recall):
//  - one-sided: only an elevation is flagged (a low RHR is not a concern here);
//  - the baseline is the user's PRIOR history — the reading under test (its whole
//    UTC day) is excluded, so an anomaly never contaminates the median/σ it is
//    measured against (a flat series + today's bump can't manufacture the very
//    variance the 3σ test needs, and a sustained elevation can't inflate the σ
//    and silence itself). This matches RHRAD's trailing-baseline method;
//  - needs ≥30 prior daily values so `median30`/`std30` are defined
//    (`computeBaselines` returns null otherwise) → no alerts on thin history;
//  - `std30 > 0` so a genuinely flat prior series can't make any wobble look
//    like a spike;
//  - freshness: the triggering reading must be recent, so we never alert on
//    stale history that merely happens to be the most recent point on file.
const RESTING_HR_METRIC = 'resting_hr';
const RESTING_HR_BASELINE_K = 3;
const BASELINE_FRESHNESS_MS = 48 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 15 * 60 * 1000;

/**
 * Metric aliases consumed by personal-baseline rules. The engine fetches these
 * over the longer baseline window; add a metric here when adding a baseline
 * rule that reads it.
 */
export const BASELINE_METRICS = [RESTING_HR_METRIC] as const;

export const restingHrAboveBaselineRule: Rule = {
  kind: 'resting_hr_above_baseline',
  evaluate(points, ctx) {
    const series = ctx.baselinePoints ?? points;
    const latest = mostRecent(series, RESTING_HR_METRIC);
    if (!latest) return null;

    // Only alert on a current reading — never on stale history, and never on a
    // future-dated reading (device clock skew: a negative ageMs would otherwise
    // pass the freshness check and shift latestDay past the real baseline).
    const ageMs = ctx.now.getTime() - new Date(latest.timestamp).getTime();
    if (ageMs > BASELINE_FRESHNESS_MS || ageMs < -CLOCK_SKEW_TOLERANCE_MS) return null;

    // Baseline = resting-HR history strictly before the reading's UTC day, so
    // the value being tested is not part of the distribution it is compared to.
    const latestDay = utcDayKey(latest.timestamp);
    const priorBaselineInput = series
      .filter((p) => p.metric === RESTING_HR_METRIC && utcDayKey(p.timestamp) < latestDay)
      .map((p) => ({ metric: p.metric, value: p.value, timestamp: p.timestamp }));
    const baseline = computeBaselines(priorBaselineInput)[RESTING_HR_METRIC];
    if (!baseline || baseline.median30 === null || baseline.std30 === null) return null;
    if (baseline.std30 <= 0) return null;

    const threshold = baseline.median30 + RESTING_HR_BASELINE_K * baseline.std30;
    if (latest.value <= threshold) return null;

    return {
      kind: 'resting_hr_above_baseline',
      title:
        'Your resting heart rate is running above your recent baseline — consider extra rest, hydration, and easing off hard training until it settles',
      tier: 'moderate',
      triggeringMetricIds: latest.id ? [latest.id] : [],
    };
  },
};

export const rules: Rule[] = [
  recoveryLowRule,
  glucoseFastingElevatedRule,
  glucoseFastingDiabeticRule,
  restingHrAboveBaselineRule,
];

export function evaluateRules(
  points: HealthDataPoint[],
  ctx: EvaluateContext,
  ruleSet: Rule[] = rules,
): RuleOutcome[] {
  const outcomes: RuleOutcome[] = [];
  for (const rule of ruleSet) {
    try {
      const outcome = rule.evaluate(points, ctx);
      if (outcome) outcomes.push(outcome);
    } catch (error) {
      // One broken rule must not silence the rest. Log and continue.
      console.error(`[suggestions] rule ${rule.kind} threw:`, error);
    }
  }
  return outcomes;
}
