import { describe, expect, it } from 'vitest';
import { describeTrend, type TrendPoint } from './trend';

/** Build a point; unit defaults to ug/L. */
function p(value: number, timestamp: string, unit = 'ug/L'): TrendPoint {
  return { value, unit, timestamp };
}

const FERRITIN_RANGE = { low: 30, high: 400 };

describe('describeTrend', () => {
  it('returns null for an empty series', () => {
    expect(describeTrend([], FERRITIN_RANGE)).toBeNull();
  });

  it('flags a single reading as single-reading confidence, no asserted direction', () => {
    const t = describeTrend([p(18, '2026-02-01')], FERRITIN_RANGE);
    expect(t).toMatchObject({
      direction: 'stable',
      confidence: 'single-reading',
      pointCount: 1,
      magnitude: 0,
      fromValue: 18,
      toValue: 18,
    });
  });

  it('reports improving when rising toward the reference range across ≥3 points', () => {
    const t = describeTrend(
      [p(18, '2026-02-01'), p(41, '2026-04-01'), p(62, '2026-06-01')],
      FERRITIN_RANGE,
    );
    expect(t).toMatchObject({
      direction: 'improving',
      rawDirection: 'up',
      referenceAware: true,
      confidence: 'ok',
      pointCount: 3,
      magnitude: 44,
      sinceAt: '2026-02-01',
      asOfAt: '2026-06-01',
    });
  });

  it('reports worsening when falling away from the reference range', () => {
    // Vitamin D dropping below range, three consistent steps.
    const t = describeTrend(
      [p(70, '2026-01-01', 'nmol/L'), p(55, '2026-03-01', 'nmol/L'), p(40, '2026-05-01', 'nmol/L')],
      { low: 50, high: 150 },
    );
    expect(t?.direction).toBe('worsening');
    expect(t?.rawDirection).toBe('down');
    expect(t?.confidence).toBe('ok');
  });

  it('is order-independent (unsorted input yields the same trend)', () => {
    const t = describeTrend(
      [p(62, '2026-06-01'), p(18, '2026-02-01'), p(41, '2026-04-01')],
      FERRITIN_RANGE,
    );
    expect(t).toMatchObject({ direction: 'improving', sinceAt: '2026-02-01', asOfAt: '2026-06-01' });
  });

  it('downgrades a zig-zag (non-monotonic) path to low confidence', () => {
    const t = describeTrend(
      [p(40, '2026-02-01'), p(80, '2026-04-01'), p(45, '2026-06-01')],
      FERRITIN_RANGE,
    );
    expect(t?.confidence).toBe('low');
  });

  it('treats two points as low confidence even when consistent', () => {
    const t = describeTrend([p(18, '2026-02-01'), p(41, '2026-06-01')], FERRITIN_RANGE);
    expect(t).toMatchObject({ confidence: 'low', direction: 'improving', pointCount: 2 });
  });

  it('reports stable when in-range both ends', () => {
    const t = describeTrend(
      [p(120, '2026-02-01'), p(118, '2026-04-01'), p(122, '2026-06-01')],
      FERRITIN_RANGE,
    );
    expect(t?.direction).toBe('stable');
  });

  it('without a reference range, direction is stable + referenceAware=false but rawDirection still moves', () => {
    const t = describeTrend(
      [p(10, '2026-02-01', ''), p(20, '2026-04-01', ''), p(30, '2026-06-01', '')],
      { low: null, high: null },
    );
    expect(t).toMatchObject({ direction: 'stable', referenceAware: false, rawDirection: 'up' });
  });

  it('never projects a future value — output carries only observed from/to', () => {
    const t = describeTrend(
      [p(18, '2026-02-01'), p(41, '2026-04-01'), p(62, '2026-06-01')],
      FERRITIN_RANGE,
    );
    // toValue is the latest OBSERVED value, never a forecast beyond asOfAt.
    expect(t?.toValue).toBe(62);
    expect(t).not.toHaveProperty('predicted');
    expect(t).not.toHaveProperty('forecast');
    expect(t).not.toHaveProperty('probability');
  });

  it('honours the window (older points beyond N are dropped)', () => {
    const t = describeTrend(
      [p(10, '2026-01-01'), p(20, '2026-02-01'), p(30, '2026-03-01'), p(40, '2026-04-01'), p(50, '2026-05-01')],
      FERRITIN_RANGE,
      { window: 3 },
    );
    expect(t?.pointCount).toBe(3);
    expect(t?.sinceAt).toBe('2026-03-01'); // only the last 3 considered
    expect(t?.fromValue).toBe(30);
  });
});
