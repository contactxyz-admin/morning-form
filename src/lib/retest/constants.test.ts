import { describe, expect, it } from 'vitest';
import {
  DRAW_DEDUP_WINDOW_DAYS,
  RETEST_CADENCE_DAYS,
  RETEST_LAPSE_GRACE_DAYS,
  RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS,
  RETEST_NUDGE_OFFSETS_DAYS,
  addDays,
  nextRetestDate,
} from './constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('retest constants', () => {
  it('nextRetestDate is completedAt + RETEST_CADENCE_DAYS (derived, not a literal)', () => {
    const completed = new Date('2026-01-01T00:00:00.000Z');
    const due = nextRetestDate(completed);
    expect(due.getTime()).toBe(completed.getTime() + RETEST_CADENCE_DAYS * MS_PER_DAY);
    // 2026-01-01 + 90d → 2026-04-01 (2026 is not a leap year).
    expect(due.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('addDays adds whole days for every nudge offset', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    for (const offset of RETEST_NUDGE_OFFSETS_DAYS) {
      expect(addDays(base, offset).getTime()).toBe(base.getTime() + offset * MS_PER_DAY);
    }
  });

  it('nudge offsets are a capped, ascending sequence starting at 0', () => {
    const arr = [...RETEST_NUDGE_OFFSETS_DAYS];
    expect(arr[0]).toBe(0);
    expect(arr.length).toBeGreaterThanOrEqual(1);
    expect([...arr].sort((a, b) => a - b)).toEqual(arr);
  });

  it('tunables are sane positive windows', () => {
    for (const v of [
      RETEST_CADENCE_DAYS,
      RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS,
      RETEST_LAPSE_GRACE_DAYS,
      DRAW_DEDUP_WINDOW_DAYS,
    ]) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
