import { describe, expect, it, vi } from 'vitest';
import type { HealthDataPoint } from '@/types';
import { recoveryLowRule, evaluateRules, rules } from './rules';

/**
 * Rule-contract tests. Titles are user-facing safety strings and must not
 * drift silently — we use `toBe` (not `toContain`) so a refactor that
 * rewords a rule will fail loudly.
 */

const NOW = new Date('2026-04-15T12:00:00Z');

function point(overrides: Partial<HealthDataPoint> & { id: string }): HealthDataPoint {
  return {
    category: 'recovery',
    metric: 'recovery_score',
    value: 50,
    unit: '%',
    timestamp: '2026-04-15T08:00:00Z',
    provider: 'whoop',
    ...overrides,
  };
}

describe('recoveryLowRule', () => {
  it('fires at recovery_score = 39 with the verbatim title and tier', () => {
    const outcome = recoveryLowRule.evaluate([point({ id: 'p1', value: 39 })], { now: NOW });
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe('recovery_low');
    expect(outcome!.title).toBe('Prioritise recovery today — consider a lighter session and an earlier bedtime');
    expect(outcome!.tier).toBe('moderate');
    expect(outcome!.triggeringMetricIds).toEqual(['p1']);
  });

  it('does not fire at recovery_score = 40 (boundary)', () => {
    const outcome = recoveryLowRule.evaluate([point({ id: 'p1', value: 40 })], { now: NOW });
    expect(outcome).toBeNull();
  });

  it('uses the most recent point when multiple exist', () => {
    const outcome = recoveryLowRule.evaluate(
      [
        point({ id: 'old', value: 25, timestamp: '2026-04-10T08:00:00Z' }),
        point({ id: 'new', value: 80, timestamp: '2026-04-15T08:00:00Z' }),
      ],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('returns null when no recovery_score points are present', () => {
    const outcome = recoveryLowRule.evaluate(
      [point({ id: 'p1', metric: 'resting_hr', value: 20 })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });
});

describe('evaluateRules', () => {
  it('returns one outcome per firing rule', () => {
    const outcomes = evaluateRules([point({ id: 'p1', value: 20 })], { now: NOW });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe('recovery_low');
  });

  it('returns empty array when no rules fire', () => {
    const outcomes = evaluateRules([point({ id: 'p1', value: 80 })], { now: NOW });
    expect(outcomes).toEqual([]);
  });

  it('swallows a single rule throwing so other rules still run', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingRule = {
      kind: 'broken',
      evaluate() {
        throw new Error('rule blew up');
      },
    };
    const runnable = [throwingRule, recoveryLowRule];
    const outcomes = evaluateRules([point({ id: 'p1', value: 20 })], { now: NOW }, runnable);
    expect(outcomes.map((o) => o.kind)).toEqual(['recovery_low']);
  });

  it('the default rule registry includes recovery_low', () => {
    expect(rules.map((r) => r.kind)).toContain('recovery_low');
  });
});
