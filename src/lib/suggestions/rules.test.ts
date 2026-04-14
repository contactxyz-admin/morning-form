import { describe, expect, it } from 'vitest';
import { evaluateRules, type Baselines, type RuleMetric, type RuleProtocolItem } from './rules';

function metric(metric: string, value: number, daysAgo: number, id?: string): RuleMetric {
  const ts = new Date();
  ts.setUTCDate(ts.getUTCDate() - daysAgo);
  return {
    id: id ?? `${metric}_${daysAgo}`,
    metric,
    value,
    timestamp: ts.toISOString(),
  };
}

const noBaselines: Baselines = {};
const noProtocol: RuleProtocolItem[] = [];

function baseline(median7: number | null, median30: number | null = null, std30: number | null = null) {
  return { median7, median30, std30 };
}

describe('HRV deload rule', () => {
  it('fires when HRV is 20% below 7-day median', () => {
    const metrics = [metric('hrv', 60, 0, 'hrv_today')];
    const baselines: Baselines = { hrv: baseline(75) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'hrv_deload');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Add glycine 2g before bed and take it easier today');
    expect(hit!.evidenceTier).toBe('strong');
    expect(hit!.triggeringMetricIds).toEqual(['hrv_today']);
    expect(hit!.rationale).toContain('60');
    expect(hit!.rationale).toContain('75');
    expect(hit!.rationale.toLowerCase()).toContain('hrv');
  });

  it('does not fire when HRV is only 6% below 7-day median', () => {
    const metrics = [metric('hrv', 70, 0)];
    const baselines: Baselines = { hrv: baseline(75) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'hrv_deload')).toBeUndefined();
  });

  it('fires exactly at the 15% threshold', () => {
    const metrics = [metric('hrv', 63.75, 0)]; // 75 * 0.85
    const baselines: Baselines = { hrv: baseline(75) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'hrv_deload')).toBeDefined();
  });

  it('is skipped when HRV baseline is null (insufficient data)', () => {
    const metrics = [metric('hrv', 30, 0)];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'hrv_deload')).toBeUndefined();
  });

  it('uses the most recent HRV reading', () => {
    const metrics = [
      metric('hrv', 75, 2, 'old'),
      metric('hrv', 50, 0, 'today'), // 33% drop
    ];
    const baselines: Baselines = { hrv: baseline(75) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'hrv_deload');
    expect(hit?.triggeringMetricIds).toEqual(['today']);
  });
});

describe('Resting HR elevated rule', () => {
  it('fires when resting HR is 10% above 7-day median', () => {
    const metrics = [metric('resting_hr', 66, 0, 'rhr_today')];
    const baselines: Baselines = { resting_hr: baseline(60) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'rhr_elevated');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Hydrate and defer caffeine until 10am');
    expect(hit!.evidenceTier).toBe('moderate');
    expect(hit!.triggeringMetricIds).toEqual(['rhr_today']);
  });

  it('does not fire when resting HR is 5% above baseline', () => {
    const metrics = [metric('resting_hr', 63, 0)];
    const baselines: Baselines = { resting_hr: baseline(60) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'rhr_elevated')).toBeUndefined();
  });

  it('is skipped when baseline is null', () => {
    const metrics = [metric('resting_hr', 90, 0)];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'rhr_elevated')).toBeUndefined();
  });
});

describe('Magnesium PM (deep sleep) rule', () => {
  it('fires when deep sleep is < 1h for 3 consecutive nights', () => {
    const metrics = [
      metric('deep_sleep', 0.8, 0, 'd0'),
      metric('deep_sleep', 0.5, 1, 'd1'),
      metric('deep_sleep', 0.7, 2, 'd2'),
    ];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'magnesium_pm');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Add magnesium glycinate 400mg, 30min before bed');
    expect(hit!.evidenceTier).toBe('strong');
    expect(new Set(hit!.triggeringMetricIds)).toEqual(new Set(['d0', 'd1', 'd2']));
  });

  it('does not fire when only 2 consecutive nights are below 1h', () => {
    const metrics = [
      metric('deep_sleep', 0.8, 0),
      metric('deep_sleep', 0.5, 1),
      metric('deep_sleep', 1.4, 2),
    ];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'magnesium_pm')).toBeUndefined();
  });

  it('is suppressed when protocol already contains magnesium', () => {
    const metrics = [
      metric('deep_sleep', 0.8, 0),
      metric('deep_sleep', 0.5, 1),
      metric('deep_sleep', 0.7, 2),
    ];
    const protocol: RuleProtocolItem[] = [
      { compounds: 'Magnesium glycinate 200mg', timeSlot: 'evening' },
    ];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol });
    expect(results.find((r) => r.kind === 'magnesium_pm')).toBeUndefined();
  });
});

describe('Low activity rule', () => {
  it('fires when steps < 3000 for 2 consecutive days', () => {
    const metrics = [
      metric('steps', 1500, 0, 's0'),
      metric('steps', 2400, 1, 's1'),
    ];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'low_activity');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Take a 20-minute walk before noon');
    expect(hit!.evidenceTier).toBe('behavioral');
    expect(new Set(hit!.triggeringMetricIds)).toEqual(new Set(['s0', 's1']));
  });

  it('does not fire when only 1 day is under 3000', () => {
    const metrics = [
      metric('steps', 1500, 0),
      metric('steps', 5000, 1),
    ];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'low_activity')).toBeUndefined();
  });
});

describe('Short sleep rule', () => {
  it('fires when last night sleep duration < 6h', () => {
    const metrics = [metric('duration', 5.2, 0, 'sleep_today')];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    const hit = results.find((r) => r.kind === 'short_sleep');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Skip morning stimulants today');
    expect(hit!.evidenceTier).toBe('behavioral');
    expect(hit!.triggeringMetricIds).toEqual(['sleep_today']);
  });

  it('does not fire when sleep duration was 6h or more', () => {
    const metrics = [metric('duration', 6.5, 0)];
    const results = evaluateRules({ metrics, baselines: noBaselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'short_sleep')).toBeUndefined();
  });
});

describe('evaluateRules', () => {
  it('runs all rules independently — one failing rule does not block others', () => {
    // duration metric is malformed (NaN) but short_sleep should fail safely; HRV rule still fires.
    const metrics = [
      metric('hrv', 50, 0, 'hrv_t'),
      { id: 'bad', metric: 'duration', value: NaN, timestamp: new Date().toISOString() },
    ];
    const baselines: Baselines = { hrv: baseline(75) };
    const results = evaluateRules({ metrics, baselines, protocol: noProtocol });
    expect(results.find((r) => r.kind === 'hrv_deload')).toBeDefined();
  });
});
