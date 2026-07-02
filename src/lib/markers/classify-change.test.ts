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
  // Ferritin-like RCV ≈ 44%.
  it('holds a sub-RCV move toward the range at stable (not improved)', () => {
    // 29 → 30.5 would be "improved" (29 below the 30 floor, 30.5 in range) but
    // the +5.2% move is well within the 44% noise floor.
    expect(classifyChange(29, 30.5, 30, 400, 44)).toEqual({
      direction: 'up',
      classification: 'stable',
    });
  });

  it('holds a sub-RCV move away from the range at stable (not worsened)', () => {
    // 45 → 46 above a 42 ceiling would be "worsened"; +2.2% is within noise.
    expect(classifyChange(45, 46, 20, 42, 5.95)).toEqual({
      direction: 'up',
      classification: 'stable',
    });
  });

  it('classifies normally when the move clears the RCV', () => {
    // HbA1c 48 → 44 above a 42 ceiling: −8.3% clears the ~5.95% floor → improved.
    expect(classifyChange(48, 44, 20, 42, 5.95)).toEqual({
      direction: 'down',
      classification: 'improved',
    });
  });

  it('preserves raw direction even when gated to stable', () => {
    expect(classifyChange(45, 46, 20, 42, 5.95).direction).toBe('up');
    expect(classifyChange(46, 45, 20, 42, 5.95).direction).toBe('down');
  });

  it('a null/omitted RCV disables the gate (identical to the 4-arg form)', () => {
    expect(classifyChange(29, 30.5, 30, 400, null)).toEqual(classifyChange(29, 30.5, 30, 400));
    expect(classifyChange(29, 30.5, 30, 400, undefined)).toEqual({
      direction: 'up',
      classification: 'improved',
    });
  });

  it('does not apply the gate when there is no reference range', () => {
    // No range → unclassified regardless of RCV.
    expect(classifyChange(5, 5.1, null, null, 1)).toEqual({
      direction: 'up',
      classification: 'unclassified',
    });
  });
});
