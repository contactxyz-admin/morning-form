/**
 * Lifecycle transition matrix tests (Plan 2026-06-06-002 Phase B U2).
 *
 * Test-first on the safety-bearing logic. Exhaustively pins: every
 * valid transition works, every invalid one is rejected, the verb
 * constraint for outcome-measured is enforced, terminal states have
 * no outgoing edges.
 */
import { describe, expect, it } from 'vitest';
import { ACTION_STATES, resolveTransition, allowedTransitions, type ActionState } from './lifecycle';

describe('action lifecycle — transition matrix', () => {
  it('allows suggested→accepted', () => {
    const t = resolveTransition('suggested', 'accepted');
    expect(t).not.toBeNull();
    expect(t!.timestampField).toBe('acceptedAt');
    expect(t!.terminal).toBe(false);
  });

  it('allows suggested→dismissed', () => {
    const t = resolveTransition('suggested', 'dismissed');
    expect(t).not.toBeNull();
    expect(t!.timestampField).toBe('dismissedAt');
    expect(t!.terminal).toBe(true);
  });

  it('allows accepted→completed', () => {
    const t = resolveTransition('accepted', 'completed');
    expect(t).not.toBeNull();
    expect(t!.timestampField).toBe('completedAt');
    expect(t!.terminal).toBe(false);
  });

  it('allows accepted→dismissed', () => {
    const t = resolveTransition('accepted', 'dismissed');
    expect(t).not.toBeNull();
    expect(t!.timestampField).toBe('dismissedAt');
    expect(t!.terminal).toBe(true);
  });

  it('allows completed→outcome-measured for measure-verb actions', () => {
    const t = resolveTransition('completed', 'outcome-measured', 'measure');
    expect(t).not.toBeNull();
    expect(t!.timestampField).toBeNull(); // snapshot IS the event
    expect(t!.terminal).toBe(true);
  });

  it('rejects completed→outcome-measured for non-measure verbs', () => {
    const t = resolveTransition('completed', 'outcome-measured', 'discuss');
    expect(t).toBeNull();
  });

  it('rejects completed→outcome-measured when verb is undefined', () => {
    const t = resolveTransition('completed', 'outcome-measured');
    expect(t).toBeNull();
  });

  it('rejects jumps: suggested→completed', () => {
    expect(resolveTransition('suggested', 'completed')).toBeNull();
  });

  it('rejects jumps: suggested→outcome-measured', () => {
    expect(resolveTransition('suggested', 'outcome-measured')).toBeNull();
  });

  it('rejects jumps: accepted→outcome-measured', () => {
    expect(resolveTransition('accepted', 'outcome-measured')).toBeNull();
  });

  it('rejects backwards: accepted→suggested', () => {
    expect(resolveTransition('accepted', 'suggested')).toBeNull();
  });

  it('rejects backwards: completed→accepted', () => {
    expect(resolveTransition('completed', 'accepted')).toBeNull();
  });

  it('rejects backwards: completed→suggested', () => {
    expect(resolveTransition('completed', 'suggested')).toBeNull();
  });

  it('rejects from terminal: dismissed→anything', () => {
    for (const to of ACTION_STATES) {
      if (to === 'dismissed') continue; // self-loop not in the table
      expect(resolveTransition('dismissed', to)).toBeNull();
    }
  });

  it('rejects from terminal: outcome-measured→anything', () => {
    for (const to of ACTION_STATES) {
      if (to === 'outcome-measured') continue;
      expect(resolveTransition('outcome-measured', to)).toBeNull();
    }
  });

  it('allowedTransitions lists the correct targets per from-state', () => {
    expect(new Set(allowedTransitions('suggested'))).toEqual(new Set(['accepted', 'dismissed']));
    expect(new Set(allowedTransitions('accepted'))).toEqual(new Set(['completed', 'dismissed']));
    expect(new Set(allowedTransitions('completed', 'measure'))).toEqual(new Set(['outcome-measured']));
    expect(allowedTransitions('completed', 'discuss')).toEqual([]);
  });
});
