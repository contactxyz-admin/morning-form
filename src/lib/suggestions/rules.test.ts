import { describe, expect, it, vi } from 'vitest';
import type { HealthDataPoint } from '@/types';
import {
  recoveryLowRule,
  glucoseFastingElevatedRule,
  glucoseFastingDiabeticRule,
  restingHrAboveBaselineRule,
  evaluateRules,
  rules,
} from './rules';

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

function glucose(overrides: Partial<HealthDataPoint> & { id: string }): HealthDataPoint {
  return {
    category: 'metabolic',
    metric: 'glucose',
    value: 95,
    unit: 'mg/dL',
    timestamp: '2026-04-15T06:00:00Z',
    provider: 'libre',
    ...overrides,
  };
}

describe('glucoseFastingElevatedRule', () => {
  it('fires at exactly 100 mg/dL with the verbatim title and tier', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', value: 100 })],
      { now: NOW },
    );
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe('glucose_fasting_elevated');
    expect(outcome!.title).toBe('Trim refined carbs at dinner and walk 10 minutes after meals');
    expect(outcome!.tier).toBe('moderate');
    expect(outcome!.triggeringMetricIds).toEqual(['g1']);
  });

  it('does not fire at 99 mg/dL (lower boundary)', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', value: 99 })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('does not fire when the only reading is outside the 04:00–08:00 fasting window', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', value: 110, timestamp: '2026-04-15T14:00:00Z' })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('does not fire at the 08:00 UTC fasting-window upper boundary (exclusive)', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', value: 110, timestamp: '2026-04-15T08:00:00Z' })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('uses the most recent fasting reading when multiple exist', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [
        glucose({ id: 'old', value: 110, timestamp: '2026-04-15T05:00:00Z' }),
        glucose({ id: 'new', value: 90, timestamp: '2026-04-15T07:00:00Z' }),
      ],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('suppresses itself when the diabetic rule would fire (mutual exclusion)', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', value: 130 })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('returns null when no glucose points are present', () => {
    const outcome = glucoseFastingElevatedRule.evaluate(
      [glucose({ id: 'g1', metric: 'recovery_score', value: 80 })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });
});

describe('glucoseFastingDiabeticRule', () => {
  it('fires at exactly 126 mg/dL with the verbatim safety-contract title', () => {
    const outcome = glucoseFastingDiabeticRule.evaluate(
      [glucose({ id: 'g1', value: 126 })],
      { now: NOW },
    );
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe('glucose_fasting_diabetic');
    expect(outcome!.title).toBe(
      'Please consult a clinician — morning-form should not be your primary intervention here',
    );
    expect(outcome!.tier).toBe('strong');
    expect(outcome!.triggeringMetricIds).toEqual(['g1']);
  });

  it('does not fire at 125 mg/dL (boundary — elevated territory)', () => {
    const outcome = glucoseFastingDiabeticRule.evaluate(
      [glucose({ id: 'g1', value: 125 })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('does not fire when the only reading is outside the 04:00–08:00 fasting window', () => {
    const outcome = glucoseFastingDiabeticRule.evaluate(
      [glucose({ id: 'g1', value: 200, timestamp: '2026-04-15T14:00:00Z' })],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });

  it('uses the most recent fasting reading when multiple exist', () => {
    const outcome = glucoseFastingDiabeticRule.evaluate(
      [
        glucose({ id: 'old', value: 200, timestamp: '2026-04-10T06:00:00Z' }),
        glucose({ id: 'new', value: 90, timestamp: '2026-04-15T07:00:00Z' }),
      ],
      { now: NOW },
    );
    expect(outcome).toBeNull();
  });
});

describe('restingHrAboveBaselineRule', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function rhr(id: string, value: number, msAgo: number): HealthDataPoint {
    return {
      id,
      category: 'heart',
      metric: 'resting_hr',
      value,
      unit: 'bpm',
      timestamp: new Date(NOW.getTime() - msAgo).toISOString(),
      provider: 'whoop',
    };
  }

  // `days` prior daily readings (alternating 54/56 → median ≈ 55, small std),
  // each strictly older than the single latest reading `msAgo` old.
  function windowEndingAt(latestValue: number, latestMsAgo: number, days = 30): HealthDataPoint[] {
    const pts: HealthDataPoint[] = [];
    for (let d = 1; d <= days; d++) {
      pts.push(rhr(`b${d}`, d % 2 === 0 ? 54 : 56, latestMsAgo + d * DAY_MS));
    }
    pts.push(rhr('latest', latestValue, latestMsAgo));
    return pts;
  }

  it('fires when a fresh reading exceeds median30 + 3·std30, with verbatim title/tier', () => {
    const outcome = restingHrAboveBaselineRule.evaluate(windowEndingAt(80, 60 * 1000), { now: NOW });
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe('resting_hr_above_baseline');
    expect(outcome!.title).toBe(
      'Your resting heart rate is running above your recent baseline — consider extra rest, hydration, and easing off hard training until it settles',
    );
    expect(outcome!.tier).toBe('moderate');
    expect(outcome!.triggeringMetricIds).toEqual(['latest']);
  });

  it('does not fire when the reading stays within k·std of the personal baseline', () => {
    expect(restingHrAboveBaselineRule.evaluate(windowEndingAt(58, 60 * 1000), { now: NOW })).toBeNull();
  });

  it('does not fire on a downward deviation (one-sided: elevation only)', () => {
    expect(restingHrAboveBaselineRule.evaluate(windowEndingAt(30, 60 * 1000), { now: NOW })).toBeNull();
  });

  it('does not fire on a stale reading (older than the 48h freshness window)', () => {
    // Spike present, but the most-recent reading is 3 days old → no alert.
    expect(restingHrAboveBaselineRule.evaluate(windowEndingAt(80, 3 * DAY_MS), { now: NOW })).toBeNull();
  });

  it('does not fire with fewer than 30 days of history (median30/std30 undefined)', () => {
    expect(
      restingHrAboveBaselineRule.evaluate(windowEndingAt(80, 60 * 1000, 20), { now: NOW }),
    ).toBeNull();
  });

  it('reads ctx.baselinePoints in preference to the recent slice', () => {
    // Recent slice has no resting_hr; the baseline window carries the history.
    const outcome = restingHrAboveBaselineRule.evaluate([point({ id: 'r', value: 50 })], {
      now: NOW,
      baselinePoints: windowEndingAt(80, 60 * 1000),
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe('resting_hr_above_baseline');
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

  it('the default rule registry includes both glucose fasting rules', () => {
    expect(rules.map((r) => r.kind)).toContain('glucose_fasting_elevated');
    expect(rules.map((r) => r.kind)).toContain('glucose_fasting_diabetic');
  });

  it('the default rule registry includes the resting-HR personal-baseline rule', () => {
    expect(rules.map((r) => r.kind)).toContain('resting_hr_above_baseline');
  });

  it('diabetic glucose at 130 fires diabetic and suppresses elevated (integration)', () => {
    const outcomes = evaluateRules([glucose({ id: 'g1', value: 130 })], { now: NOW });
    const kinds = outcomes.map((o) => o.kind);
    expect(kinds).toContain('glucose_fasting_diabetic');
    expect(kinds).not.toContain('glucose_fasting_elevated');
  });
});
