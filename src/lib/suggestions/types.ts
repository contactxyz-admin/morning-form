import type { HealthDataPoint, SuggestionTier } from '@/types';

export interface RuleOutcome {
  kind: string;
  title: string;
  tier: SuggestionTier;
  triggeringMetricIds: string[];
}

export interface EvaluateContext {
  now: Date;
  /**
   * A longer window of points (≥30 days) for rules that need a personal
   * baseline. Population/threshold rules read `points` (the recent slice);
   * baseline-deviation rules read `baselinePoints`. Optional so direct
   * unit tests of a single rule can omit it (a rule falls back to `points`).
   */
  baselinePoints?: HealthDataPoint[];
}

export interface Rule {
  kind: string;
  evaluate(points: HealthDataPoint[], ctx: EvaluateContext): RuleOutcome | null;
}
