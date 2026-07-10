import { describe, expect, it } from 'vitest';
import type { OpsTaskDto } from './board-client';
import {
  ATTENTION_CAP,
  buildBriefing,
  buildWindowState,
  contactBucket,
  currentWeekStartUtc,
  daysBetweenUtc,
  filterTasks,
  funnelScenario,
  kpiWeekFlag,
  nextMilestoneFor,
  parseTargetWeek,
  parseWeekRange,
  rhythmIndexForDate,
  taskDueState,
} from './intelligence';

function makeTask(overrides: Partial<OpsTaskDto> & Pick<OpsTaskDto, 'id'>): OpsTaskDto {
  return {
    board: 'pilot',
    title: 'x',
    detail: '',
    phase: '',
    ownerEmail: null,
    status: 'not_started',
    dueDate: null,
    orderIndex: 0,
    ...overrides,
  };
}

// A Thursday inside pilot week 3 (W3 = 6 Jul – 12 Jul 2026).
const NOW = new Date('2026-07-09T10:00:00Z');

describe('taskDueState', () => {
  it('is none without a due date', () => {
    expect(taskDueState(makeTask({ id: '1' }), NOW)).toBe('none');
  });

  it('is none for done tasks even when the date has passed', () => {
    expect(taskDueState(makeTask({ id: '1', status: 'done', dueDate: '2026-07-01T00:00:00.000Z' }), NOW)).toBe('none');
  });

  it('is overdue strictly after the due day, not during it', () => {
    expect(taskDueState(makeTask({ id: '1', dueDate: '2026-07-08T00:00:00.000Z' }), NOW)).toBe('overdue');
    expect(taskDueState(makeTask({ id: '1', dueDate: '2026-07-09T00:00:00.000Z' }), NOW)).toBe('due_soon');
  });

  it('is due_soon within 7 days and scheduled beyond', () => {
    expect(taskDueState(makeTask({ id: '1', dueDate: '2026-07-16T00:00:00.000Z' }), NOW)).toBe('due_soon');
    expect(taskDueState(makeTask({ id: '1', dueDate: '2026-07-17T00:00:00.000Z' }), NOW)).toBe('scheduled');
  });
});

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: '1', title: 'Send partner deck', ownerEmail: 'reuben@contact.xyz', status: 'in_progress' }),
    makeTask({ id: '2', title: 'Book venue', status: 'done', ownerEmail: 'joe@contact.xyz' }),
    makeTask({ id: '3', title: 'Chase TDL quote', dueDate: '2026-07-01T00:00:00.000Z' }),
  ];

  it('filters by owner including unassigned', () => {
    expect(filterTasks(tasks, { query: '', owner: 'reuben@contact.xyz', status: 'all' }, NOW)).toHaveLength(1);
    expect(filterTasks(tasks, { query: '', owner: 'unassigned', status: 'all' }, NOW)).toEqual([tasks[2]]);
  });

  it('supports the synthetic open and overdue status filters', () => {
    expect(filterTasks(tasks, { query: '', owner: 'all', status: 'open' }, NOW)).toHaveLength(2);
    expect(filterTasks(tasks, { query: '', owner: 'all', status: 'overdue' }, NOW)).toEqual([tasks[2]]);
  });

  it('matches query against title/detail/phase, case-insensitively', () => {
    expect(filterTasks(tasks, { query: 'tdl', owner: 'all', status: 'all' }, NOW)).toEqual([tasks[2]]);
    expect(filterTasks(tasks, { query: 'zzz', owner: 'all', status: 'all' }, NOW)).toEqual([]);
  });
});

describe('buildBriefing', () => {
  it('computes counts, attention ordering (overdue, blocked, due-soon) and phase progress', () => {
    const tasks = [
      makeTask({ id: 'a', phase: 'P0', status: 'done' }),
      makeTask({ id: 'b', phase: 'P0', status: 'in_progress', dueDate: '2026-07-10T00:00:00.000Z' }),
      makeTask({ id: 'c', phase: 'P1', status: 'blocked' }),
      makeTask({ id: 'd', phase: 'P1', dueDate: '2026-07-02T00:00:00.000Z' }),
      makeTask({ id: 'e', phase: 'P1', dueDate: '2026-07-01T00:00:00.000Z' }),
    ];
    const briefing = buildBriefing(tasks, NOW);

    expect(briefing.total).toBe(5);
    expect(briefing.statusCounts.done).toBe(1);
    expect(briefing.overdueCount).toBe(2);
    expect(briefing.attention.map((a) => `${a.task.id}:${a.reason}`)).toEqual([
      'e:overdue',
      'd:overdue',
      'c:blocked',
      'b:due_soon',
    ]);
    expect(briefing.phaseProgress).toEqual([
      { phase: 'P0', done: 1, total: 2 },
      { phase: 'P1', done: 0, total: 3 },
    ]);
    expect(briefing.week).toEqual({ state: 'active', week: 3, label: '6 Jul' });
    // W9 (Pilot LIVE) starts 17 Aug 2026; 9 Jul -> 39 days out.
    expect(briefing.daysToPilotLive).toBe(39);
  });

  it('lists an overdue blocked task once, as overdue', () => {
    const tasks = [makeTask({ id: 'a', status: 'blocked', dueDate: '2026-07-01T00:00:00.000Z' })];
    const briefing = buildBriefing(tasks, NOW);
    expect(briefing.attention).toHaveLength(1);
    expect(briefing.attention[0].reason).toBe('overdue');
  });

  it('caps the attention list and reports the overflow', () => {
    const tasks = Array.from({ length: ATTENTION_CAP + 3 }, (_, i) =>
      makeTask({ id: `t${i}`, status: 'blocked' }),
    );
    const briefing = buildBriefing(tasks, NOW);
    expect(briefing.attention).toHaveLength(ATTENTION_CAP);
    expect(briefing.attentionOverflow).toBe(3);
  });

  it('sorts owner load busiest-first with unassigned pinned last', () => {
    const tasks = [
      makeTask({ id: 'a', ownerEmail: 'a@x.com' }),
      makeTask({ id: 'b', ownerEmail: 'b@x.com' }),
      makeTask({ id: 'c', ownerEmail: 'b@x.com' }),
      makeTask({ id: 'd' }),
      makeTask({ id: 'e' }),
      makeTask({ id: 'f' }),
    ];
    const briefing = buildBriefing(tasks, NOW);
    expect(briefing.ownerLoad.map((o) => o.ownerEmail)).toEqual(['b@x.com', 'a@x.com', null]);
    expect(briefing.unassignedOpen).toBe(3);
  });
});

describe('nextMilestoneFor', () => {
  it('keeps a milestone "next" while its week is underway', () => {
    // W3 (Partner signed) runs 6–12 Jul; on 9 Jul it is still the next milestone.
    const milestone = nextMilestoneFor(NOW);
    expect(milestone).toEqual({ week: 3, label: 'Partner signed', daysUntilWeekStart: -3 });
  });

  it('advances once the milestone week has fully elapsed', () => {
    const milestone = nextMilestoneFor(new Date('2026-07-13T00:00:00Z'));
    expect(milestone?.week).toBe(4);
    expect(milestone?.label).toBe('Gyms secured');
  });

  it('returns null after the last milestone week', () => {
    expect(nextMilestoneFor(new Date('2026-09-14T00:00:00Z'))).toBeNull();
  });
});

describe('rhythmIndexForDate', () => {
  it('maps Monday to plan, Friday to review, other days to the daily close-out', () => {
    expect(rhythmIndexForDate(new Date('2026-07-06T09:00:00Z'))).toBe(1); // Monday
    expect(rhythmIndexForDate(new Date('2026-07-10T09:00:00Z'))).toBe(2); // Friday
    expect(rhythmIndexForDate(new Date('2026-07-09T09:00:00Z'))).toBe(0); // Thursday
    expect(rhythmIndexForDate(new Date('2026-07-11T09:00:00Z'))).toBe(0); // Saturday
  });
});

describe('parseTargetWeek', () => {
  it('parses the W / Wk / week spellings', () => {
    expect(parseTargetWeek('By W3')).toBe(3);
    expect(parseTargetWeek('Week 1')).toBe(1);
    expect(parseTargetWeek('By W4 (~13 Jul)')).toBe(4);
    expect(parseTargetWeek('By week 12')).toBe(12);
  });

  it('takes the earliest week when several are named', () => {
    expect(parseTargetWeek('Draft Wk 6 · final Wk 10')).toBe(6);
  });

  it('ignores durations, bare dates and out-of-window numbers', () => {
    expect(parseTargetWeek('≥ 10%')).toBeNull();
    expect(parseTargetWeek('~8 weeks — wk of 17 Aug')).toBeNull();
    expect(parseTargetWeek('50–100')).toBeNull();
    expect(parseTargetWeek('W99')).toBeNull();
  });
});

describe('kpiWeekFlag', () => {
  it('classifies weeks relative to the active pilot week', () => {
    expect(kpiWeekFlag('Week 1', NOW)).toEqual({ week: 1, state: 'passed' });
    expect(kpiWeekFlag('By W3', NOW)).toEqual({ week: 3, state: 'this_week' });
    expect(kpiWeekFlag('By W8 (~10 Aug)', NOW)).toEqual({ week: 8, state: 'upcoming' });
    expect(kpiWeekFlag('≥ 50', NOW)).toBeNull();
  });

  it('treats everything as upcoming before the window and passed after it', () => {
    expect(kpiWeekFlag('By W3', new Date('2026-06-01T00:00:00Z'))).toEqual({ week: 3, state: 'upcoming' });
    expect(kpiWeekFlag('By W3', new Date('2026-10-01T00:00:00Z'))).toEqual({ week: 3, state: 'passed' });
  });
});

describe('parseWeekRange / buildWindowState', () => {
  it('parses single weeks, en-dash ranges, and open-ended windows', () => {
    expect(parseWeekRange('W1–2 · now')).toEqual({ from: 1, to: 2 });
    expect(parseWeekRange('W3–4')).toEqual({ from: 3, to: 4 });
    expect(parseWeekRange('W7')).toEqual({ from: 7, to: 7 });
    expect(parseWeekRange('W8 · ~10 Aug')).toEqual({ from: 8, to: 8 });
    expect(parseWeekRange('W10+')).toEqual({ from: 10, to: 12 });
    expect(parseWeekRange('no weeks here')).toBeNull();
  });

  it('classifies windows against the active pilot week', () => {
    expect(buildWindowState('W1–2 · now', NOW)).toBe('passed');
    expect(buildWindowState('W3–4', NOW)).toBe('now');
    expect(buildWindowState('W8 · ~10 Aug', NOW)).toBe('upcoming');
    expect(buildWindowState('W10+', NOW)).toBe('upcoming');
    expect(buildWindowState('W3–4', new Date('2026-06-01T00:00:00Z'))).toBe('upcoming');
    expect(buildWindowState('W3–4', new Date('2026-10-01T00:00:00Z'))).toBe('passed');
  });
});

describe('funnelScenario', () => {
  it('works the funnel backwards from the draw goal at target rates', () => {
    const stages = funnelScenario(100);
    expect(stages.map((s) => [s.label, s.count])).toEqual([
      ['Members reached', 1180],
      ['Booked a slot', 118],
      ['Drawn (sample taken)', 100],
      ['Result returned', 100],
      ['Protocol delivered', 95],
      ['Retest booked', 29],
    ]);
  });

  it('rounds partial people up where under-reaching would miss the goal', () => {
    const stages = funnelScenario(50);
    // 50 / 0.85 = 58.8 -> 59 bookings; 59 / 0.1 -> 590 reached.
    expect(stages[1].count).toBe(59);
    expect(stages[0].count).toBe(590);
  });
});

describe('contactBucket', () => {
  it('buckets statuses by what they demand of us', () => {
    expect(contactBucket('Replied')).toBe('act_now');
    expect(contactBucket('Draft ready')).toBe('act_now');
    expect(contactBucket('Call booked')).toBe('act_now');
    expect(contactBucket('Bounced')).toBe('act_now');
    expect(contactBucket('Sent')).toBe('waiting');
    expect(contactBucket('Done')).toBe('done');
    expect(contactBucket('Connected')).toBe('done');
    expect(contactBucket('Parked')).toBe('parked');
    expect(contactBucket('Declined')).toBe('parked');
    expect(contactBucket('Not started')).toBe('queue');
    expect(contactBucket('anything else')).toBe('queue');
  });
});

describe('currentWeekStartUtc', () => {
  it('returns Monday 00:00 UTC of the containing week', () => {
    // Thu 9 Jul 2026 -> Mon 6 Jul; Mon itself maps to itself; Sun maps back 6 days.
    expect(currentWeekStartUtc(new Date('2026-07-09T22:30:00Z'))).toBe(Date.UTC(2026, 6, 6));
    expect(currentWeekStartUtc(new Date('2026-07-06T00:00:00Z'))).toBe(Date.UTC(2026, 6, 6));
    expect(currentWeekStartUtc(new Date('2026-07-12T23:59:00Z'))).toBe(Date.UTC(2026, 6, 6));
    expect(currentWeekStartUtc(new Date('2026-07-13T00:00:00Z'))).toBe(Date.UTC(2026, 6, 13));
  });
});

describe('daysBetweenUtc', () => {
  it('counts whole UTC days regardless of time-of-day', () => {
    expect(daysBetweenUtc('2026-07-01T23:00:00.000Z', new Date('2026-07-09T01:00:00Z'))).toBe(8);
    expect(daysBetweenUtc('2026-07-09T00:00:00.000Z', new Date('2026-07-09T23:00:00Z'))).toBe(0);
    expect(daysBetweenUtc('not-a-date', new Date('2026-07-09T00:00:00Z'))).toBe(0);
  });
});
