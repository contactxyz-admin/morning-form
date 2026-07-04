import { describe, expect, it } from 'vitest';
import { dueDateInputValue, groupTasksByPhase } from './board-grouping';
import type { OpsTaskDto } from './board-client';

function makeTask(overrides: Partial<OpsTaskDto> & Pick<OpsTaskDto, 'id' | 'phase'>): OpsTaskDto {
  return {
    board: 'pilot',
    title: 'x',
    detail: '',
    ownerEmail: null,
    status: 'not_started',
    dueDate: null,
    orderIndex: 0,
    ...overrides,
  };
}

describe('groupTasksByPhase', () => {
  it('groups already-sorted tasks by phase, preserving first-appearance order', () => {
    const tasks = [
      makeTask({ id: '1', phase: '0 · Decide' }),
      makeTask({ id: '2', phase: '0 · Decide' }),
      makeTask({ id: '3', phase: '1 · Build' }),
    ];
    const groups = groupTasksByPhase(tasks);
    expect(groups).toEqual([
      { phase: '0 · Decide', rows: [tasks[0], tasks[1]] },
      { phase: '1 · Build', rows: [tasks[2]] },
    ]);
  });

  it('merges a newly-appended task into its existing phase group instead of creating a duplicate header', () => {
    // Regression test: a task with phase '' (Unphased) already exists first
    // in the array (server sort puts '' before non-empty strings), then a
    // phased task, then a NEW task appended at the end by createTask() with
    // phase '' again — the old adjacency-based grouping would have produced
    // TWO 'Unphased' groups here instead of merging into the first one.
    const unphased1 = makeTask({ id: '1', phase: '' });
    const phased = makeTask({ id: '2', phase: '1 · Build' });
    const unphased2 = makeTask({ id: '3', phase: '' });

    const groups = groupTasksByPhase([unphased1, phased, unphased2]);

    expect(groups).toEqual([
      { phase: '', rows: [unphased1, unphased2] },
      { phase: '1 · Build', rows: [phased] },
    ]);
  });

  it('returns an empty array for no tasks', () => {
    expect(groupTasksByPhase([])).toEqual([]);
  });
});

describe('dueDateInputValue', () => {
  it('returns an empty string for null', () => {
    expect(dueDateInputValue(null)).toBe('');
  });

  it('truncates an ISO datetime string to the date-only portion', () => {
    expect(dueDateInputValue('2026-07-13T00:00:00.000Z')).toBe('2026-07-13');
  });
});
