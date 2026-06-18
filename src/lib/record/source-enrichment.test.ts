import { describe, expect, it } from 'vitest';
import { enrichGroundedNodes, type GroundedNodeInput } from './source-enrichment';
import type { PanelDiff, MarkerChange } from '@/lib/markers/panel-diff';

function change(overrides: Partial<MarkerChange> = {}): MarkerChange {
  return {
    marker: 'LDL-C',
    joinKey: 'ldl',
    unit: 'mg/dL',
    beforeValue: 100,
    beforeAt: '2025-01-01',
    afterValue: 145,
    afterAt: '2026-01-01',
    referenceLow: null,
    referenceHigh: 130,
    direction: 'up',
    classification: 'worsened',
    ...overrides,
  };
}

function diff(changes: MarkerChange[], previousPanelAt: string | null = '2025-01-01'): PanelDiff {
  return { latestPanelAt: '2026-01-01', previousPanelAt, changes };
}

const node = (o: Partial<GroundedNodeInput> = {}): GroundedNodeInput => ({
  id: 'n1',
  type: 'biomarker',
  displayName: 'LDL-C',
  canonicalKey: 'ldl',
  attributes: {},
  ...o,
});

describe('enrichGroundedNodes', () => {
  it('decorates a matching biomarker with change + interpretation', () => {
    const [row] = enrichGroundedNodes([node()], diff([change()]));
    expect(row.change?.afterValue).toBe(145);
    expect(row.interpretation?.flag).toBeDefined();
  });

  it('matches by registryKey, not canonicalKey (the join-key contract / BLOCKER)', () => {
    // The diff keys on the registry key; the node's canonicalKey is a snake_case
    // fallback. Reading registryKey off the parsed attributes is what makes this work.
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'ldl_cholesterol', attributes: { registryKey: 'ldl' } })],
      diff([change({ joinKey: 'ldl' })]),
    )[0];
    expect(row.change?.afterValue).toBe(145);
  });

  it('leaves non-biomarker nodes name-only even on a key match', () => {
    const row = enrichGroundedNodes([node({ type: 'condition' })], diff([change()]))[0];
    expect(row.change).toBeUndefined();
    expect(row.interpretation).toBeUndefined();
  });

  it('leaves an unmatched biomarker name-only', () => {
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'apob', attributes: {} })],
      diff([change({ joinKey: 'ldl' })]),
    )[0];
    expect(row.change).toBeUndefined();
  });

  it('withholds decoration on a single-panel diff (previousPanelAt null) — matches the record route', () => {
    const row = enrichGroundedNodes(
      [node()],
      diff([change({ classification: 'new', beforeValue: null, direction: null })], null),
    )[0];
    expect(row.change).toBeUndefined();
    expect(row.interpretation).toBeUndefined();
  });

  it('no diff → name-only, base fields preserved', () => {
    const [row] = enrichGroundedNodes([node({ id: 'x' })], null);
    expect(row).toMatchObject({ id: 'x', type: 'biomarker', displayName: 'LDL-C', canonicalKey: 'ldl' });
    expect(row.change).toBeUndefined();
  });
});
