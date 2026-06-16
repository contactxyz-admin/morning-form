import { describe, expect, it } from 'vitest';
import { deriveChange } from './derive-change';
import type { DemoReading } from '../../../prisma/fixtures/demo-navigable-record';

const r = (
  value: number,
  at: string,
  referenceLow: number | null = null,
  referenceHigh: number | null = null,
  unit = 'x',
): DemoReading => ({ value, unit, at, referenceLow, referenceHigh });

const A = '2024-04-20T09:00:00.000Z';
const B = '2026-02-10T09:00:00.000Z';

describe('deriveChange', () => {
  it('no readings → undefined (no decoration)', () => {
    expect(deriveChange(undefined)).toBeUndefined();
    expect(deriveChange([])).toBeUndefined();
  });

  it('one reading → new (measured only in the latest panel)', () => {
    const c = deriveChange([r(11.8, B, 9.3, 26.5)])!;
    expect(c.classification).toBe('new');
    expect(c.direction).toBeNull();
    expect(c.beforeValue).toBeNull();
    expect(c.afterValue).toBe(11.8);
  });

  it('improved — moves toward the reference interval', () => {
    // 5.9 (above high 5.7) → 5.7 (at boundary, in range)
    const c = deriveChange([r(5.9, A, null, 5.7), r(5.7, B, null, 5.7)])!;
    expect(c.classification).toBe('improved');
    expect(c.direction).toBe('down');
    expect(c.beforeValue).toBe(5.9);
    expect(c.afterValue).toBe(5.7);
  });

  it('worsened — moves away from the reference interval', () => {
    const c = deriveChange([r(2.9, A, null, 3.0), r(3.6, B, null, 3.0)])!;
    expect(c.classification).toBe('worsened');
    expect(c.direction).toBe('up');
  });

  it('stable — in range both times (the range method cannot claim improved)', () => {
    const c = deriveChange([r(42, A, 30, 400), r(68, B, 30, 400)])!;
    expect(c.classification).toBe('stable');
    expect(c.direction).toBe('up'); // value moved up, but stayed in range
  });

  it('flat — same value both times → flat direction, stable', () => {
    const c = deriveChange([r(42, A, 30, 400), r(42, B, 30, 400)])!;
    expect(c.direction).toBe('flat');
    expect(c.classification).toBe('stable');
  });

  it('unclassified — no reference range to judge against', () => {
    const c = deriveChange([r(100, A), r(120, B)])!;
    expect(c.classification).toBe('unclassified');
    expect(c.direction).toBe('up');
  });

  it('uses the latest two readings by date even when unsorted', () => {
    const c = deriveChange([r(68, B, 30, 400), r(42, A, 30, 400)])!;
    expect(c.beforeValue).toBe(42);
    expect(c.beforeAt).toBe(A);
    expect(c.afterValue).toBe(68);
    expect(c.afterAt).toBe(B);
  });

  it('carries the unit from the latest reading', () => {
    const c = deriveChange([r(42, A, 30, 400, 'ng/mL'), r(68, B, 30, 400, 'ng/mL')])!;
    expect(c.unit).toBe('ng/mL');
  });
});
