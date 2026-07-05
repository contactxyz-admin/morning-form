import { describe, expect, it } from 'vitest';
import { buildTimelineModel, getPilotWeekStatus } from './timeline-helpers';

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
});
