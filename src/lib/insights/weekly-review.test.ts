import { describe, expect, it } from 'vitest';
import {
  currentMonday,
  deriveWeeklyReview,
  parseMonday,
  weekRange,
  type StoredCheckIn,
} from './weekly-review';
import type { EveningCheckIn, MorningCheckIn } from '@/types';

function morning(date: string, sleepQuality: MorningCheckIn['sleepQuality']): StoredCheckIn {
  return {
    date,
    type: 'morning',
    responses: { sleepQuality, currentFeeling: 'steady' },
  };
}

function evening(
  date: string,
  focusQuality: EveningCheckIn['focusQuality'],
  protocolAdherence: EveningCheckIn['protocolAdherence'] = 'fully',
): StoredCheckIn {
  return {
    date,
    type: 'evening',
    responses: { focusQuality, afternoonEnergy: 'steady', protocolAdherence },
  };
}

const WEEK = new Date('2026-03-23T00:00:00Z'); // Monday
const DAYS = ['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29'];

describe('parseMonday', () => {
  it('accepts a valid Monday in ISO format', () => {
    expect(parseMonday('2026-03-23')?.toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });
  it('rejects non-ISO strings', () => {
    expect(parseMonday('03/23/2026')).toBeNull();
  });
  it('rejects a non-Monday date', () => {
    expect(parseMonday('2026-03-24')).toBeNull();
  });
});

describe('currentMonday', () => {
  it('returns Monday of the week when called on a Wednesday', () => {
    const wed = new Date('2026-03-25T12:00:00Z');
    expect(currentMonday(wed).toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });
  it('returns the same Monday when called on Monday', () => {
    const mon = new Date('2026-03-23T08:00:00Z');
    expect(currentMonday(mon).toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });
  it('returns the previous Monday when called on Sunday', () => {
    const sun = new Date('2026-03-29T23:00:00Z');
    expect(currentMonday(sun).toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });
});

describe('weekRange', () => {
  it('spans Monday through Sunday inclusive', () => {
    expect(weekRange(WEEK)).toEqual({
      weekStart: '2026-03-23',
      weekEnd: '2026-03-29',
    });
  });
});

describe('deriveWeeklyReview', () => {
  it('returns zeroed counts with stable trend when there are no check-ins', () => {
    const review = deriveWeeklyReview([], WEEK);
    expect(review.sleepQuality).toMatchObject({ filled: 0, total: 7, trend: 'stable' });
    expect(review.sleepQuality.label).toBe('0 of 7 nights rated "Well" or better');
    expect(review.focusConsistency.filled).toBe(0);
    expect(review.protocolAdherence.filled).toBe(0);
    expect(review.patternInsight).toBeNull();
    expect(review.protocolStatus).toBe('no-changes');
  });

  it('counts morning check-ins where sleepQuality is well or great', () => {
    const rows: StoredCheckIn[] = [
      morning(DAYS[0], 'well'),
      morning(DAYS[1], 'great'),
      morning(DAYS[2], 'well'),
      morning(DAYS[3], 'ok'),
      morning(DAYS[4], 'well'),
      morning(DAYS[5], 'poorly'),
      morning(DAYS[6], 'great'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.sleepQuality.filled).toBe(5);
    expect(review.sleepQuality.label).toBe('5 of 7 nights rated "Well" or better');
  });

  it('ignores rows outside the current and prior weeks', () => {
    const rows: StoredCheckIn[] = [morning('2026-03-09', 'great')]; // Two weeks prior
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.sleepQuality.filled).toBe(0);
  });

  it('classifies trend as improving when current exceeds prior by >= 2', () => {
    const rows: StoredCheckIn[] = [
      // Current week: 6 good sleeps
      ...DAYS.slice(0, 6).map((d) => morning(d, 'well')),
      // Prior week: 3 good sleeps (Mon 2026-03-16 .. Sun 2026-03-22)
      morning('2026-03-16', 'well'),
      morning('2026-03-17', 'great'),
      morning('2026-03-18', 'well'),
      morning('2026-03-19', 'ok'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.sleepQuality.trend).toBe('improving');
  });

  it('classifies trend as declining when prior exceeds current by >= 2', () => {
    const rows: StoredCheckIn[] = [
      morning(DAYS[0], 'well'),
      morning(DAYS[1], 'ok'),
      morning('2026-03-16', 'well'),
      morning('2026-03-17', 'great'),
      morning('2026-03-18', 'well'),
      morning('2026-03-19', 'great'),
      morning('2026-03-20', 'well'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.sleepQuality.trend).toBe('declining');
  });

  it('classifies trend as stable when the delta is within ±1', () => {
    const rows: StoredCheckIn[] = [
      morning(DAYS[0], 'well'),
      morning(DAYS[1], 'well'),
      morning('2026-03-16', 'well'),
      morning('2026-03-17', 'great'),
      morning('2026-03-18', 'well'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.sleepQuality.trend).toBe('stable');
  });

  it('counts focus only from evening check-ins', () => {
    const rows: StoredCheckIn[] = [
      morning(DAYS[0], 'great'),
      morning(DAYS[1], 'great'),
      evening(DAYS[0], 'good'),
      evening(DAYS[1], 'locked-in'),
      evening(DAYS[2], 'variable'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.focusConsistency.filled).toBe(2);
  });

  it('counts adherence only where protocolAdherence is fully or mostly', () => {
    const rows: StoredCheckIn[] = [
      evening(DAYS[0], 'good', 'fully'),
      evening(DAYS[1], 'good', 'mostly'),
      evening(DAYS[2], 'good', 'partially'),
      evening(DAYS[3], 'good', 'skipped'),
    ];
    const review = deriveWeeklyReview(rows, WEEK);
    expect(review.protocolAdherence.filled).toBe(2);
  });
});
