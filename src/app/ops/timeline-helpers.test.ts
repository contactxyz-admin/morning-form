import { describe, expect, it } from 'vitest';
import {
  buildTimelineModel,
  getPilotWeekStatus,
  milestoneLabelsForWeeks,
  timelineWindowCopy,
} from './timeline-helpers';

describe('getPilotWeekStatus', () => {
  it('returns before before the pilot starts', () => {
    expect(getPilotWeekStatus(new Date('2026-06-21T12:00:00Z'))).toEqual({ state: 'before' });
  });

  it('returns active week 1', () => {
    expect(getPilotWeekStatus(new Date('2026-06-22T12:00:00Z'))).toEqual({
      state: 'active',
      week: 1,
      label: '22 Jun',
    });
  });

  it('returns active week 4', () => {
    expect(getPilotWeekStatus(new Date('2026-07-13T12:00:00Z'))).toEqual({
      state: 'active',
      week: 4,
      label: '13 Jul',
    });
  });

  it('returns active week 12 through the final planned week', () => {
    expect(getPilotWeekStatus(new Date('2026-09-13T12:00:00Z'))).toEqual({
      state: 'active',
      week: 12,
      label: '7 Sep',
    });
  });

  it('returns after after the plan window', () => {
    expect(getPilotWeekStatus(new Date('2026-09-14T12:00:00Z'))).toEqual({ state: 'after' });
  });
});

describe('buildTimelineModel', () => {
  it('derives inclusive week spans and readable row metadata', () => {
    const model = buildTimelineModel(new Date('2026-07-06T12:00:00Z'));
    const gymRow = model.rows.find((row) => row.colorClassKey === 'gym');

    expect(gymRow).toMatchObject({
      from: 1,
      to: 4,
      lane: 'Gym partnerships',
      colorClassKey: 'gym',
      isCritical: true,
      startLabel: '22 Jun',
      endLabel: '13 Jul',
    });
    expect(gymRow?.weeks).toEqual([1, 2, 3, 4]);
  });

  it('exposes readable milestone text by week', () => {
    const model = buildTimelineModel(new Date('2026-07-06T12:00:00Z'));

    expect(model.milestonesByWeek[4]).toBe('Gyms secured');
    expect(model.milestonesByWeek[2]).toBeUndefined();
  });

  it('flags exactly the critical-path rows', () => {
    const model = buildTimelineModel(new Date('2026-07-06T12:00:00Z'));
    const critical = model.rows.filter((row) => row.isCritical).map((row) => row.label);

    expect(critical).toEqual([
      'Gym partnerships: deck → outreach → secure',
      'Phlebotomy partner: outreach → select',
      'Product · build the MVP',
    ]);
  });
});

describe('timelineWindowCopy', () => {
  it('names the week-1 start date before the window opens', () => {
    expect(timelineWindowCopy({ state: 'before' })).toBe(
      'Pilot window has not started yet. Week 1 begins on 22 Jun.',
    );
  });

  it('names the active week', () => {
    expect(timelineWindowCopy({ state: 'active', week: 4, label: '13 Jul' })).toBe(
      'Active now: week 4, starting 13 Jul.',
    );
  });

  it('marks the window complete after the final week', () => {
    expect(timelineWindowCopy({ state: 'after' })).toBe(
      'Pilot window is complete. Use this as the final 12-week reference.',
    );
  });
});

describe('milestoneLabelsForWeeks', () => {
  it('collects only weeks that have milestones, in order', () => {
    expect(
      milestoneLabelsForWeeks([1, 2, 3, 4], { 1: 'Kickoff', 3: 'Partner signed', 4: 'Gyms secured' }),
    ).toEqual(['Kickoff', 'Partner signed', 'Gyms secured']);
  });
});
