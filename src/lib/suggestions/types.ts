import type { HealthDataPoint, SuggestionTier } from '@/types';

export interface RuleOutcome {
  kind: string;
  title: string;
  tier: SuggestionTier;
  triggeringMetricIds: string[];
}

export interface EvaluateContext {
  now: Date;
}

export interface Rule {
  kind: string;
  evaluate(points: HealthDataPoint[], ctx: EvaluateContext): RuleOutcome | null;
}
