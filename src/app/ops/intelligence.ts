/**
 * Pure "company intelligence" helpers for the /ops board — everything the
 * Briefing tab and the interactive reference tabs compute from live tasks
 * plus the static pilot plan. No React/CSS/server imports so it stays
 * importable from both server components, client components, and plain
 * Vitest (same convention as board-grouping.ts).
 */
import type { OpsTaskDto } from './board-client';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import { getPilotWeekStatus, PILOT_START_UTC, WEEK_MS, type PilotWeekStatus } from './timeline-helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days ahead (inclusive) that count as "due soon" on the board + briefing. */
export const DUE_SOON_DAYS = 7;

function dayUtcOf(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function weekStartUtc(week: number): number {
  return PILOT_START_UTC + (week - 1) * WEEK_MS;
}

/* ------------------------------------------------------------------ */
/* Due-date state                                                      */
/* ------------------------------------------------------------------ */

export type DueState = 'overdue' | 'due_soon' | 'scheduled' | 'none';

/**
 * Date-only comparison in UTC: a task due "2026-07-08" is overdue from
 * 2026-07-09 onwards, never during its own due day. Done tasks are never
 * overdue — the date has served its purpose.
 */
export function taskDueState(task: Pick<OpsTaskDto, 'dueDate' | 'status'>, now: Date): DueState {
  if (!task.dueDate || task.status === 'done') return 'none';
  const due = Date.parse(task.dueDate.slice(0, 10));
  if (Number.isNaN(due)) return 'none';
  const today = dayUtcOf(now);
  if (due < today) return 'overdue';
  if (due <= today + DUE_SOON_DAYS * DAY_MS) return 'due_soon';
  return 'scheduled';
}

/* ------------------------------------------------------------------ */
/* Workstream filtering                                                */
/* ------------------------------------------------------------------ */

export type BoardStatusFilter = 'all' | 'open' | OpsTaskDto['status'] | 'overdue';
export type BoardOwnerFilter = 'all' | 'unassigned' | string;

export interface BoardFilters {
  query: string;
  owner: BoardOwnerFilter;
  status: BoardStatusFilter;
}

export function filterTasks(tasks: OpsTaskDto[], filters: BoardFilters, now: Date): OpsTaskDto[] {
  const query = filters.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filters.owner === 'unassigned') {
      if (t.ownerEmail) return false;
    } else if (filters.owner !== 'all' && t.ownerEmail !== filters.owner) {
      return false;
    }

    if (filters.status === 'open') {
      if (t.status === 'done') return false;
    } else if (filters.status === 'overdue') {
      if (taskDueState(t, now) !== 'overdue') return false;
    } else if (filters.status !== 'all' && t.status !== filters.status) {
      return false;
    }

    if (query) {
      const haystack = `${t.title} ${t.detail} ${t.phase}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Briefing model                                                      */
/* ------------------------------------------------------------------ */

export interface PhaseProgress {
  phase: string;
  done: number;
  total: number;
}

export interface OwnerLoad {
  ownerEmail: string | null;
  open: number;
  done: number;
}

export interface AttentionItem {
  task: OpsTaskDto;
  reason: 'overdue' | 'blocked' | 'due_soon';
}

export interface NextMilestone {
  week: number;
  label: string;
  /** Days from `now` until the milestone week starts; 0 or negative = that week is underway. */
  daysUntilWeekStart: number;
}

export interface BriefingModel {
  week: PilotWeekStatus;
  weekCount: number;
  daysToPilotLive: number;
  nextMilestone: NextMilestone | null;
  statusCounts: Record<OpsTaskDto['status'], number>;
  total: number;
  overdueCount: number;
  attention: AttentionItem[];
  attentionOverflow: number;
  phaseProgress: PhaseProgress[];
  ownerLoad: OwnerLoad[];
  unassignedOpen: number;
}

export const ATTENTION_CAP = 8;
/** Pilot LIVE = start of W9 (17 Aug 2026), per the plan's North Star. */
export const PILOT_LIVE_UTC = weekStartUtc(9);

export function nextMilestoneFor(now: Date): NextMilestone | null {
  const today = dayUtcOf(now);
  const weeks = Object.keys(PILOT_PLAN.milestones)
    .map(Number)
    .sort((a, b) => a - b);
  for (const week of weeks) {
    const start = weekStartUtc(week);
    // A milestone stays "next" until its week has fully elapsed.
    if (today < start + WEEK_MS) {
      return {
        week,
        label: PILOT_PLAN.milestones[String(week) as keyof typeof PILOT_PLAN.milestones],
        daysUntilWeekStart: Math.round((start - today) / DAY_MS),
      };
    }
  }
  return null;
}

export function buildBriefing(tasks: OpsTaskDto[], now: Date): BriefingModel {
  const statusCounts: Record<OpsTaskDto['status'], number> = {
    not_started: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
  };
  const overdue: OpsTaskDto[] = [];
  const dueSoon: OpsTaskDto[] = [];
  const blocked: OpsTaskDto[] = [];
  const phaseMap = new Map<string, PhaseProgress>();
  const ownerMap = new Map<string | null, OwnerLoad>();

  for (const task of tasks) {
    statusCounts[task.status] += 1;

    const dueState = taskDueState(task, now);
    if (dueState === 'overdue') overdue.push(task);
    // A blocked task is one list entry, not two — blocked is the louder signal.
    else if (task.status === 'blocked') blocked.push(task);
    else if (dueState === 'due_soon') dueSoon.push(task);

    const phase = phaseMap.get(task.phase) ?? { phase: task.phase, done: 0, total: 0 };
    phase.total += 1;
    if (task.status === 'done') phase.done += 1;
    phaseMap.set(task.phase, phase);

    const owner = ownerMap.get(task.ownerEmail) ?? { ownerEmail: task.ownerEmail, open: 0, done: 0 };
    if (task.status === 'done') owner.done += 1;
    else owner.open += 1;
    ownerMap.set(task.ownerEmail, owner);
  }

  const byDueDate = (a: OpsTaskDto, b: OpsTaskDto) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  overdue.sort(byDueDate);
  dueSoon.sort(byDueDate);

  const attentionAll: AttentionItem[] = [
    ...overdue.map((task): AttentionItem => ({ task, reason: 'overdue' })),
    ...blocked.map((task): AttentionItem => ({ task, reason: 'blocked' })),
    ...dueSoon.map((task): AttentionItem => ({ task, reason: 'due_soon' })),
  ];

  const ownerLoad = Array.from(ownerMap.values()).sort((a, b) => {
    // Unassigned pinned last; otherwise busiest first.
    if ((a.ownerEmail === null) !== (b.ownerEmail === null)) return a.ownerEmail === null ? 1 : -1;
    return b.open - a.open;
  });

  const today = dayUtcOf(now);
  return {
    week: getPilotWeekStatus(now),
    weekCount: PILOT_PLAN.weeks.length,
    daysToPilotLive: Math.round((PILOT_LIVE_UTC - today) / DAY_MS),
    nextMilestone: nextMilestoneFor(now),
    statusCounts,
    total: tasks.length,
    overdueCount: overdue.length,
    attention: attentionAll.slice(0, ATTENTION_CAP),
    attentionOverflow: Math.max(0, attentionAll.length - ATTENTION_CAP),
    phaseProgress: Array.from(phaseMap.values()),
    ownerLoad,
    unassignedOpen: ownerMap.get(null)?.open ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Operating rhythm                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which PILOT_PLAN.rhythm row applies today: Monday -> the weekly plan,
 * Friday -> the weekly review, anything else -> the daily close-out.
 * The "(When you hire)" row is never "today".
 */
export function rhythmIndexForDate(date: Date): number {
  const day = date.getUTCDay();
  if (day === 1) return 1;
  if (day === 5) return 2;
  return 0;
}

/* ------------------------------------------------------------------ */
/* KPI target weeks                                                    */
/* ------------------------------------------------------------------ */

/**
 * Best-effort extraction of a pilot-week deadline from free-text KPI targets
 * ("By W3", "Week 1", "Draft Wk 6 · final Wk 10" -> earliest wins). Returns
 * null when the target names no week ("≥ 10%", "~8 weeks — wk of 17 Aug" —
 * "8 weeks" is a duration and "wk of" has no trailing number, neither parses).
 */
export function parseTargetWeek(text: string): number | null {
  const matches = Array.from(text.matchAll(/\bw(?:eek|k)?\s*(\d{1,2})\b/gi), (m) => Number(m[1]));
  const valid = matches.filter((w) => w >= 1 && w <= PILOT_PLAN.weeks.length);
  return valid.length ? Math.min(...valid) : null;
}

export type KpiWeekFlag = { week: number; state: 'passed' | 'this_week' | 'upcoming' };

export function kpiWeekFlag(target: string, now: Date): KpiWeekFlag | null {
  const week = parseTargetWeek(target);
  if (week === null) return null;
  const status = getPilotWeekStatus(now);
  if (status.state === 'before') return { week, state: 'upcoming' };
  if (status.state === 'after') return { week, state: 'passed' };
  if (week < status.week) return { week, state: 'passed' };
  if (week === status.week) return { week, state: 'this_week' };
  return { week, state: 'upcoming' };
}

/* ------------------------------------------------------------------ */
/* Funnel reverse math                                                 */
/* ------------------------------------------------------------------ */

/** Conversion targets straight from the Objectives & KPIs tab. */
export const FUNNEL_TARGETS = {
  booking: 0.1, // members reached -> booked
  show: 0.85, // booked -> drawn
  protocol: 0.95, // result returned -> protocol delivered
  retest: 0.3, // protocol delivered -> retest booked
} as const;

export interface FunnelStage {
  label: string;
  count: number;
  /** Human-readable conversion target from the previous stage, if one exists. */
  rateLabel: string | null;
}

/**
 * Works the funnel backwards from a draw goal at target conversion rates:
 * "to bank N draws, how many members do we need to reach?" Result returned
 * is assumed lossless (the ≤3-day turnaround KPI covers quality, not volume).
 */
export function funnelScenario(draws: number): FunnelStage[] {
  const booked = Math.ceil(draws / FUNNEL_TARGETS.show);
  const reached = Math.ceil(booked / FUNNEL_TARGETS.booking);
  const protocols = Math.round(draws * FUNNEL_TARGETS.protocol);
  const retests = Math.round(protocols * FUNNEL_TARGETS.retest);
  return [
    { label: 'Members reached', count: reached, rateLabel: null },
    { label: 'Booked a slot', count: booked, rateLabel: '≥ 10% booking' },
    { label: 'Drawn (sample taken)', count: draws, rateLabel: '≥ 85% show rate' },
    { label: 'Result returned', count: draws, rateLabel: 'lab turnaround ≤ 3 days' },
    { label: 'Protocol delivered', count: protocols, rateLabel: '≥ 95% delivered' },
    { label: 'Retest booked', count: retests, rateLabel: '≥ 30% retest' },
  ];
}

/* ------------------------------------------------------------------ */
/* Contacts pipeline                                                   */
/* ------------------------------------------------------------------ */

export const CONTACT_BUCKETS = ['act_now', 'waiting', 'queue', 'done', 'parked'] as const;
export type ContactBucket = (typeof CONTACT_BUCKETS)[number];

export const CONTACT_BUCKET_LABELS: Record<ContactBucket, string> = {
  act_now: 'Act now',
  waiting: 'Waiting on them',
  queue: 'Not started',
  done: 'Done',
  parked: 'Parked',
};

/**
 * Buckets the outreach status vocabulary by what it demands of US:
 * a reply or a ready draft or a booked call needs action today; "Sent"
 * means the ball is in their court; everything untouched is queue.
 */
export function contactBucket(status: string): ContactBucket {
  switch (status) {
    case 'Replied':
    case 'Draft ready':
    case 'Draft sent':
    case 'Call booked':
      return 'act_now';
    case 'Sent':
      return 'waiting';
    case 'Done':
    case 'Connected':
    case 'Confirmed':
    case 'Verified':
    case 'Decided':
      return 'done';
    case 'Parked':
    case 'Deferred':
      return 'parked';
    default:
      return 'queue';
  }
}
