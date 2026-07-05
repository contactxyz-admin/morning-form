import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';

export type TimelineColorKey = (typeof PILOT_PLAN.bars)[number][3];

export type PilotWeekStatus =
  | { state: 'before' }
  | { state: 'active'; week: number; label: string }
  | { state: 'after' };

export type TimelineRow = {
  label: string;
  from: number;
  to: number;
  lane: string;
  colorClassKey: TimelineColorKey;
  isCritical: boolean;
  weeks: number[];
  startLabel: string;
  endLabel: string;
};

const PILOT_START_UTC = Date.UTC(2026, 5, 22);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const LANE_BY_COLOR = {
  coral: 'Operating phase',
  gym: 'Gym partnerships',
  tech: 'Product build',
  sage: 'Pilot live',
  gold: 'Fundraise',
} satisfies Record<TimelineColorKey, string>;

export function getPilotWeekStatus(date: Date): PilotWeekStatus {
  const dayUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekIndex = Math.floor((dayUtc - PILOT_START_UTC) / WEEK_MS);

  if (weekIndex < 0) return { state: 'before' };
  if (weekIndex >= PILOT_PLAN.weeks.length) return { state: 'after' };

  const week = PILOT_PLAN.weeks[weekIndex];
  return { state: 'active', week: week.w, label: week.label };
}

export function buildTimelineModel(currentDate: Date = new Date()) {
  const weeks = PILOT_PLAN.weeks;
  const weekLabels = new Map<number, string>(weeks.map((week) => [week.w, week.label]));
  const rows = PILOT_PLAN.bars.map(([label, from, to, colorClassKey]) => ({
    label,
    from,
    to,
    lane: LANE_BY_COLOR[colorClassKey],
    colorClassKey,
    isCritical: colorClassKey === 'gym' || label.startsWith('Phlebotomy partner') || label.startsWith('Product '),
    weeks: Array.from({ length: to - from + 1 }, (_, index) => from + index),
    startLabel: weekLabels.get(from) ?? `W${from}`,
    endLabel: weekLabels.get(to) ?? `W${to}`,
  }));

  return {
    weeks,
    rows,
    milestonesByWeek: Object.fromEntries(
      Object.entries(PILOT_PLAN.milestones).map(([week, label]) => [Number(week), label]),
    ) as Partial<Record<number, string>>,
    currentWeek: getPilotWeekStatus(currentDate),
  };
}
