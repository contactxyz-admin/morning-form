import type { EveningCheckIn, MetricSummary, MorningCheckIn, WeeklyReview } from '@/types';

export type StoredCheckIn = {
  date: string;
  type: 'morning' | 'evening';
  responses: MorningCheckIn | EveningCheckIn;
};

const GOOD_SLEEP = new Set<MorningCheckIn['sleepQuality']>(['well', 'great']);
const GOOD_FOCUS = new Set<EveningCheckIn['focusQuality']>(['good', 'locked-in']);
const GOOD_ADHERENCE = new Set<EveningCheckIn['protocolAdherence']>(['fully', 'mostly']);

// Trend threshold: a ±2-day swing in filled count flips trend from stable.
// Reasoning: 7-day windows are small; ±1 is noise, ±2 is a meaningful shift.
const TREND_DELTA = 2;

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function parseMonday(weekStart: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const date = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCDay() !== 1) return null;
  return date;
}

export function weekRange(start: Date): { weekStart: string; weekEnd: string } {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

export function currentMonday(now: Date = new Date()): Date {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = utc.getUTCDay();
  // Sun=0, Mon=1 ... Sat=6. Shift back to Monday.
  const offset = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - offset);
  return utc;
}

function withinWeek(date: string, weekStart: Date): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  const delta = diffDays(weekStart, d);
  return delta >= 0 && delta <= 6;
}

function countFilled(
  rows: StoredCheckIn[],
  weekStart: Date,
  predicate: (row: StoredCheckIn) => boolean,
): number {
  return rows.filter((row) => withinWeek(row.date, weekStart) && predicate(row)).length;
}

function classifyTrend(current: number, prior: number): MetricSummary['trend'] {
  const delta = current - prior;
  if (delta >= TREND_DELTA) return 'improving';
  if (delta <= -TREND_DELTA) return 'declining';
  return 'stable';
}

function summary(
  filled: number,
  prior: number,
  label: (n: number) => string,
): MetricSummary {
  return { filled, total: 7, trend: classifyTrend(filled, prior), label: label(filled) };
}

/**
 * Derives the WeeklyReview for a given week from persisted check-ins.
 *
 * `rows` should contain at least the current and prior week's check-ins so
 * trend classification has a baseline; rows outside those ranges are ignored.
 * The derivation is pure — all trend/count logic lives here so it can be
 * tested without a database.
 */
export function deriveWeeklyReview(rows: StoredCheckIn[], weekStart: Date): WeeklyReview {
  const prior = new Date(weekStart);
  prior.setUTCDate(prior.getUTCDate() - 7);

  const sleepFilled = countFilled(
    rows,
    weekStart,
    (r) =>
      r.type === 'morning' &&
      GOOD_SLEEP.has((r.responses as MorningCheckIn).sleepQuality),
  );
  const sleepPrior = countFilled(
    rows,
    prior,
    (r) =>
      r.type === 'morning' &&
      GOOD_SLEEP.has((r.responses as MorningCheckIn).sleepQuality),
  );

  const focusFilled = countFilled(
    rows,
    weekStart,
    (r) =>
      r.type === 'evening' &&
      GOOD_FOCUS.has((r.responses as EveningCheckIn).focusQuality),
  );
  const focusPrior = countFilled(
    rows,
    prior,
    (r) =>
      r.type === 'evening' &&
      GOOD_FOCUS.has((r.responses as EveningCheckIn).focusQuality),
  );

  const adherenceFilled = countFilled(
    rows,
    weekStart,
    (r) =>
      r.type === 'evening' &&
      GOOD_ADHERENCE.has((r.responses as EveningCheckIn).protocolAdherence),
  );
  const adherencePrior = countFilled(
    rows,
    prior,
    (r) =>
      r.type === 'evening' &&
      GOOD_ADHERENCE.has((r.responses as EveningCheckIn).protocolAdherence),
  );

  const { weekStart: ws, weekEnd } = weekRange(weekStart);

  return {
    weekStart: ws,
    weekEnd,
    sleepQuality: summary(
      sleepFilled,
      sleepPrior,
      (n) => `${n} of 7 nights rated "Well" or better`,
    ),
    focusConsistency: summary(
      focusFilled,
      focusPrior,
      (n) => `${n} of 7 days rated "Good" or better`,
    ),
    protocolAdherence: summary(
      adherenceFilled,
      adherencePrior,
      (n) => `${n} of 7 days "Fully" or "Mostly"`,
    ),
    patternInsight: null,
    protocolStatus: 'no-changes',
  };
}
