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

export function getPilotWeekStatus(date: Date): PilotWeekStatus {
  const dayUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekIndex = Math.floor((dayUtc - PILOT_START_UTC) / WEEK_MS);

  if (weekIndex < 0) return { state: 'before' };

  const week = PILOT_PLAN.weeks.find((candidate) => candidate.w === weekIndex + 1);
  if (!week) return { state: 'after' };
  return { state: 'active', week: week.w, label: week.label };
}

export function buildTimelineModel(currentDate: Date = new Date()) {
  const weeks = PILOT_PLAN.weeks;
  const weekLabels = new Map<number, string>(weeks.map((week) => [week.w, week.label]));
  const rows: TimelineRow[] = PILOT_PLAN.bars.map(([label, from, to, colorClassKey, lane, isCritical]) => ({
    label,
    from,
    to,
    lane,
    colorClassKey,
    isCritical,
    weeks: Array.from({ length: to - from + 1 }, (_, index) => from + index),
    startLabel: weekLabels.get(from) ?? `W${from}`,
    endLabel: weekLabels.get(to) ?? `W${to}`,
  }));

  const milestonesByWeek: Partial<Record<number, string>> = Object.fromEntries(
    Object.entries(PILOT_PLAN.milestones).map(([week, label]) => [Number(week), label]),
  );

  return {
    weeks,
    rows,
    milestonesByWeek,
    currentWeek: getPilotWeekStatus(currentDate),
  };
}

export function timelineWindowCopy(status: PilotWeekStatus): string {
  if (status.state === 'before') {
    return `Pilot window has not started yet. Week 1 begins on ${PILOT_PLAN.weeks[0].label}.`;
  }
  if (status.state === 'after') return 'Pilot window is complete. Use this as the final 12-week reference.';
  return `Active now: week ${status.week}, starting ${status.label}.`;
}

export function milestoneLabelsForWeeks(weeks: number[], milestonesByWeek: Partial<Record<number, string>>): string[] {
  return weeks.map((week) => milestonesByWeek[week]).filter((label): label is string => Boolean(label));
}
