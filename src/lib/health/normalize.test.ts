import { describe, expect, it } from 'vitest';
import { pointFromCanonical } from './normalize';

const TS = '2026-04-14T12:00:00.000Z';

describe('pointFromCanonical', () => {
  it('resolves a rule-engine alias to a fully-populated point', () => {
    const p = pointFromCanonical('hrv', 68, { timestamp: TS, provider: 'whoop' });
    expect(p).toEqual({
      category: 'recovery',
      metric: 'hrv',
      value: 68,
      unit: 'ms',
      timestamp: TS,
      provider: 'whoop',
    });
  });

  it('resolves a canonical storage name to the SAME point as its alias', () => {
    const viaAlias = pointFromCanonical('hrv', 68, { timestamp: TS, provider: 'whoop' });
    const viaCanonical = pointFromCanonical('heart_rate_variability_rmssd', 68, {
      timestamp: TS,
      provider: 'whoop',
    });
    expect(viaCanonical).toEqual(viaAlias);
  });

  it('always emits the alias as `metric` (locks rule-engine contract)', () => {
    const p = pointFromCanonical('sleep_duration_total', 7.5, { timestamp: TS, provider: 'oura' });
    expect(p.metric).toBe('duration');
  });

  it('fills unit from the registry when not overridden', () => {
    expect(pointFromCanonical('blood_glucose', 95, { timestamp: TS, provider: 'whoop' }).unit).toBe(
      'mg/dL',
    );
  });

  it('honors a unit override (rare — for upstream conversions)', () => {
    const p = pointFromCanonical('blood_glucose', 5.3, {
      timestamp: TS,
      provider: 'whoop',
      unit: 'mmol/L',
    });
    expect(p.unit).toBe('mmol/L');
  });

  it('throws on unknown metric names', () => {
    expect(() =>
      pointFromCanonical('not_a_metric', 1, { timestamp: TS, provider: 'whoop' }),
    ).toThrow(/Unknown metric/);
  });
});
