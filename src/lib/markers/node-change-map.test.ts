import { describe, expect, it } from 'vitest';
import type { GraphNodeWire } from '@/types/graph';
import type { MarkerChange } from './panel-diff';
import { applyChangesToWireNodes, buildChangeByJoinKey, changedNodeIds } from './node-change-map';

function change(overrides: Partial<MarkerChange> = {}): MarkerChange {
  return {
    marker: 'Ferritin',
    joinKey: 'ferritin',
    unit: 'ug/L',
    beforeValue: 18,
    beforeAt: '2026-04-01T00:00:00.000Z',
    afterValue: 41,
    afterAt: '2026-06-01T00:00:00.000Z',
    referenceLow: 30,
    referenceHigh: 400,
    direction: 'up',
    classification: 'improved',
    ...overrides,
  };
}

function wireNode(overrides: Partial<GraphNodeWire> = {}): GraphNodeWire {
  return {
    id: 'n1',
    userId: 'u',
    type: 'biomarker',
    canonicalKey: 'ferritin',
    displayName: 'Ferritin',
    attributes: {},
    confidence: 1,
    promoted: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    tier: 1,
    score: 5,
    ...overrides,
  };
}

describe('buildChangeByJoinKey', () => {
  it('keys changes by joinKey and drops the reference range from the wire shape', () => {
    const m = buildChangeByJoinKey([change()]);
    const wire = m.get('ferritin');
    expect(wire).toEqual({
      direction: 'up',
      classification: 'improved',
      beforeValue: 18,
      beforeAt: '2026-04-01T00:00:00.000Z',
      afterValue: 41,
      afterAt: '2026-06-01T00:00:00.000Z',
      unit: 'ug/L',
    });
    expect(wire).not.toHaveProperty('referenceLow');
  });
});

describe('applyChangesToWireNodes', () => {
  it('attaches change to the matching biomarker node by canonicalKey', () => {
    const nodes = [wireNode()];
    applyChangesToWireNodes(nodes, [change()]);
    expect(nodes[0].change).toMatchObject({ classification: 'improved', afterValue: 41 });
  });

  it('matches via registryKey when the node canonicalKey is the snake_case fallback', () => {
    const nodes = [wireNode({ canonicalKey: 'serum_ferritin', attributes: { registryKey: 'ferritin' } })];
    applyChangesToWireNodes(nodes, [change({ joinKey: 'ferritin' })]);
    expect(nodes[0].change).toBeDefined();
  });

  it('decorates every concept node sharing a join key (collision is the same marker)', () => {
    const nodes = [
      wireNode({ id: 'a', canonicalKey: 'ferritin' }),
      wireNode({ id: 'b', canonicalKey: 'serum_ferritin', attributes: { registryKey: 'ferritin' } }),
    ];
    applyChangesToWireNodes(nodes, [change()]);
    expect(nodes.every((n) => n.change)).toBe(true);
  });

  it('never decorates a non-biomarker node, even if its key matches', () => {
    const nodes = [wireNode({ type: 'symptom', canonicalKey: 'ferritin' })];
    applyChangesToWireNodes(nodes, [change()]);
    expect(nodes[0].change).toBeUndefined();
  });

  it('leaves nodes untouched when there are no changes', () => {
    const nodes = [wireNode()];
    applyChangesToWireNodes(nodes, []);
    expect(nodes[0].change).toBeUndefined();
  });

  it('leaves unmatched nodes untouched', () => {
    const nodes = [wireNode({ canonicalKey: 'hba1c' })];
    applyChangesToWireNodes(nodes, [change({ joinKey: 'ferritin' })]);
    expect(nodes[0].change).toBeUndefined();
  });
});

describe('changedNodeIds', () => {
  it('returns ids of biomarker nodes whose join key matches a change', () => {
    const nodes = [
      wireNode({ id: 'a', canonicalKey: 'ferritin' }),
      wireNode({ id: 'b', canonicalKey: 'serum_ferritin', attributes: { registryKey: 'ferritin' } }),
      wireNode({ id: 'c', canonicalKey: 'hba1c' }),
    ];
    const ids = changedNodeIds(nodes, [change({ joinKey: 'ferritin' })]);
    expect(ids).toEqual(new Set(['a', 'b'])); // both ferritin variants; not hba1c
  });

  it('never includes a non-biomarker node, and is empty with no changes', () => {
    const nodes = [wireNode({ id: 's', type: 'symptom', canonicalKey: 'ferritin' })];
    expect(changedNodeIds(nodes, [change()])).toEqual(new Set());
    expect(changedNodeIds([wireNode()], [])).toEqual(new Set());
  });
});
