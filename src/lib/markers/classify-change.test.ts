import { describe, expect, it } from 'vitest';
import { classifyChange } from './classify-change';

/**
 * Pure classifier tests (no DB). The DB-backed panel-diff tests live in
 * panel-diff.test.ts; here we pin the range-relative logic and the optional
 * Reference Change Value noise gate (audit item A7).
 */

describe('classifyChange without an RCV gate (unchanged behaviour)', () => {
  it('improved when moving toward the interval', () => {
    expect(classifyChange(18, 41, 30, 400)).toEqual({ direction: 'up', classification: 'improved' });
  });
  it('worsened when moving away from the interval', () => {
    expect(classifyChange(35, 20, 30, 400)).toEqual({ direction: 'down', classification: 'worsened' });
  });
  it('stable in-range to in-range', () => {
    expect(classifyChange(80, 95, 30, 400)).toEqual({ direction: 'up', classification: 'stable' });
  });
  it('unclassified with no range', () => {
    expect(classifyChange(5, 9, null, null)).toEqual({ direction: 'up', classification: 'unclassified' });
  });
});

describe('classifyChange with an RCV noise gate', () => {
  const ferritin = { upPct: 55, downPct: 35.5 };
  const hba1c = { upPct: 6.13, downPct: 5.78 };

  it('holds a sub-RCV move toward the range at stable (not improved)', () => {
    // 29 → 30.5 would be "improved" (29 below the 30 floor, 30.5 in range) but
    // the +5.2% rise is well within the 55% up-limit.
    expect(classifyChange(29, 30.5, 30, 400, ferritin)).toEqual({
      direction: 'up',
      classification: 'stable',
    });
  });

  it('holds a sub-RCV move away from the range at stable (not worsened)', () => {
    // 45 → 46 above a 42 ceiling would be "worsened"; +2.2% is within noise.
    expect(classifyChange(45, 46, 20, 42, hba1c)).toEqual({
      direction: 'up',
      classification: 'stable',
    });
  });

  it('classifies normally when the move clears the RCV', () => {
    // HbA1c 48 → 44 above a 42 ceiling: −8.3% clears the 5.78% down-limit → improved.
    expect(classifyChange(48, 44, 20, 42, hba1c)).toEqual({
      direction: 'down',
      classification: 'improved',
    });
  });

  it('preserves raw direction even when gated to stable', () => {
    expect(classifyChange(45, 46, 20, 42, hba1c).direction).toBe('up');
    expect(classifyChange(46, 45, 20, 42, hba1c).direction).toBe('down');
  });

  it('gates exactly at the limit (boundary is inclusive → stable)', () => {
    // 210 → 220.5 above a 200 ceiling would be "worsened"; +5% == up-limit → stable.
    expect(classifyChange(210, 220.5, 50, 200, { upPct: 5, downPct: 5 })).toEqual({
      direction: 'up',
      classification: 'stable',
    });
  });

  it('a null/omitted RCV disables the gate (identical to the 4-arg form)', () => {
    expect(classifyChange(29, 30.5, 30, 400, null)).toEqual(classifyChange(29, 30.5, 30, 400));
    expect(classifyChange(29, 30.5, 30, 400, undefined)).toEqual({
      direction: 'up',
      classification: 'improved',
    });
  });

  it('does not apply the gate before the no-range check (would-fire RCV still yields unclassified)', () => {
    // RCV up/down = 10% and the move is only +2% — so IF the gate ran it would
    // fire; a correct impl returns `unclassified` because there is no range,
    // pinning that the range check precedes the gate.
    expect(classifyChange(5, 5.1, null, null, { upPct: 10, downPct: 10 })).toEqual({
      direction: 'up',
      classification: 'unclassified',
    });
  });
});
