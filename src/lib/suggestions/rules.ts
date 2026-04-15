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
import type { EvaluateContext, Rule, RuleOutcome } from './types';

function mostRecent(points: HealthDataPoint[], metric: string): HealthDataPoint | null {
  const matching = points.filter((p) => p.metric === metric);
  if (matching.length === 0) return null;
  return matching.reduce((latest, p) =>
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

export const rules: Rule[] = [recoveryLowRule];

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
