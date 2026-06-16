import { describe, expect, it } from 'vitest';
import { interpret } from './clinical-interpretation';
import type { NodeChangeWire } from '@/types/graph';

const change = (
  classification: NodeChangeWire['classification'],
  direction: NodeChangeWire['direction'],
): NodeChangeWire => ({
  classification,
  direction,
  beforeValue: 1,
  beforeAt: '2024-04-20T09:00:00.000Z',
  afterValue: 2,
  afterAt: '2026-02-10T09:00:00.000Z',
  unit: 'x',
});

describe('interpret — CMO matrix', () => {
  it('LDL-C above the attention threshold → clinician-discussion, exact copy', () => {
    const i = interpret('ldl', change('worsened', 'up'), { value: 3.4, low: null, high: 3.0 });
    expect(i.whereItIsNow).toBe('Above attention threshold');
    expect(i.signalClarity).toBe('Medium–High');
    expect(i.flag).toBe('clinician_discussion');
    expect(i.nextStep).toContain('full lipid profile');
    expect(i.plainEnglish).toContain('attention threshold');
    // never names it a diagnosis or treatment trigger
    expect(i.plainEnglish).toContain('not a diagnosis or treatment trigger');
  });

  it('LDL-C within range → attention (not clinician-discussion)', () => {
    const i = interpret('ldl', change('improved', 'down'), { value: 2.7, low: null, high: 3.0 });
    expect(i.whereItIsNow).toBe('Within range');
    expect(i.flag).toBe('attention');
  });

  it('ApoB new → "New baseline captured", no-trend, attention', () => {
    const i = interpret('apob', change('new', null), { value: 0.98, low: null, high: 0.9 });
    expect(i.whereItIsNow).toBe('New baseline captured');
    expect(i.signalClarity).toBe('Medium');
    expect(i.flag).toBe('attention');
    expect(i.plainEnglish).toContain('no trend yet');
  });

  it('ferritin rose but stays context-dependent (acute-phase) — clarity disagrees with movement (R7)', () => {
    const i = interpret('ferritin', change('stable', 'up'), { value: 68, low: 30, high: 400 });
    expect(i.signalClarity).toBe('Context-dependent');
    expect(i.plainEnglish).toContain('inflammation');
  });

  it('HbA1c carries the iron-confounding context caveat (R7)', () => {
    const i = interpret('hba1c', change('improved', 'down'), { value: 5.7, low: null, high: 5.7 });
    expect(i.signalClarity).toContain('iron status');
  });

  it('value exactly on the attention threshold is NOT above it (boundary)', () => {
    const i = interpret('ldl', change('worsened', 'up'), { value: 3.0, low: null, high: 3.0 });
    expect(i.whereItIsNow).toBe('Within range');
    expect(i.flag).toBe('attention');
  });

  it('free-testosterone is calm/attention, never over-flagged (in-range recovering marker)', () => {
    const i = interpret('free-testosterone', change('stable', 'up'), {
      value: 11.8,
      low: 9.3,
      high: 26.5,
    });
    expect(i.flag).toBe('attention'); // NOT clinician_discussion / DEFAULT
    expect(i.whereItIsNow).toBe('Within range');
  });

  it('unknown marker → conservative default, never false-favourable', () => {
    const i = interpret('mystery-marker', change('improved', 'down'), {
      value: 5,
      low: null,
      high: 10,
    });
    expect(i.signalClarity).toBe('Low');
    expect(i.flag).toBe('clinician_discussion');
    expect(i.nextStep).toContain('clinician');
    expect(i.whereItIsNow).not.toMatch(/favourable|normal|good/i);
  });

  describe('positionLabel branches (via interpret on an unknown marker)', () => {
    it('below range', () => {
      const i = interpret('x', change('worsened', 'down'), { value: 5, low: 10, high: 20 });
      expect(i.whereItIsNow).toBe('Below range');
    });
    it('no reference range → not "Within range" (never false-reassuring)', () => {
      const i = interpret('x', change('unclassified', 'up'), { value: 5, low: null, high: null });
      expect(i.whereItIsNow).toBe('No reference range');
    });
    it('new short-circuits regardless of position', () => {
      const i = interpret('x', change('new', null), { value: 99, low: null, high: 50 });
      expect(i.whereItIsNow).toBe('New baseline captured');
    });
  });
});
