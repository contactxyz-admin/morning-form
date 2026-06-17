import { describe, expect, it } from 'vitest';
import {
  EDGE_TYPES,
  NODE_TYPES,
  type EdgeType,
  type NodeType,
} from './types';
import {
  changeVisual,
  haloRadiusForTier,
  labelVisibleByDefault,
  LEGEND_ITEMS,
  radiusForTier,
  selectionStrokeClass,
  toggleHiddenClass,
  visualForEdge,
  visualForNode,
  type NodeVisualClass,
} from './visual-encoding';

describe('changeVisual', () => {
  it('maps improved/worsened/new to distinct tones', () => {
    expect(changeVisual('improved')).toEqual({ ringClass: 'stroke-positive', badgeFillClass: 'fill-positive' });
    expect(changeVisual('worsened')).toEqual({ ringClass: 'stroke-alert', badgeFillClass: 'fill-alert' });
    expect(changeVisual('new')).toEqual({ ringClass: 'stroke-accent', badgeFillClass: 'fill-accent' });
  });

  it('treats stable and unclassified as the neutral tone', () => {
    expect(changeVisual('stable')).toEqual(changeVisual('unclassified'));
    expect(changeVisual('stable').badgeFillClass).toBe('fill-text-tertiary');
  });

  it('defaults an unknown classification to neutral rather than throwing', () => {
    expect(changeVisual('wat')).toEqual(changeVisual('stable'));
  });
});

describe('visualForNode', () => {
  it('returns one of the 4 visual classes for every NodeType', () => {
    const valid = new Set(['clinical', 'biomarker', 'intervention', 'data']);
    for (const type of NODE_TYPES) {
      expect(valid.has(visualForNode(type).visualClass)).toBe(true);
    }
  });

  it('falls back to "data" for unknown types', () => {
    expect(visualForNode('not_a_real_type' as NodeType).visualClass).toBe('data');
  });

  it('groups condition + symptom + symptom_episode + allergy into clinical', () => {
    expect(visualForNode('condition').visualClass).toBe('clinical');
    expect(visualForNode('symptom').visualClass).toBe('clinical');
    expect(visualForNode('symptom_episode').visualClass).toBe('clinical');
    expect(visualForNode('allergy').visualClass).toBe('clinical');
  });

  it('groups biomarker + observation + metric_window into biomarker', () => {
    expect(visualForNode('biomarker').visualClass).toBe('biomarker');
    expect(visualForNode('observation').visualClass).toBe('biomarker');
    expect(visualForNode('metric_window').visualClass).toBe('biomarker');
  });

  it('returns Tailwind classes (no raw hex)', () => {
    const v = visualForNode('biomarker');
    expect(v.fillClass).toMatch(/^fill-/);
    expect(v.strokeClass).toMatch(/^stroke-/);
  });
});

describe('visualForEdge', () => {
  it('returns one of 3 hierarchy classes for every EdgeType', () => {
    const valid = new Set(['agreement', 'causation', 'contradiction']);
    for (const type of EDGE_TYPES) {
      expect(valid.has(visualForEdge(type).hierarchy)).toBe(true);
    }
  });

  it('CAUSES → causation, with arrow head', () => {
    const v = visualForEdge('CAUSES');
    expect(v.hierarchy).toBe('causation');
    expect(v.arrowHead).toBe(true);
  });

  it('CONTRADICTS → contradiction, dashed', () => {
    const v = visualForEdge('CONTRADICTS');
    expect(v.hierarchy).toBe('contradiction');
    expect(v.dashArray).toBeDefined();
  });

  it('SUPPORTS / ASSOCIATED_WITH / TEMPORAL_SUCCEEDS / INSTANCE_OF / OUTCOME_CHANGED → agreement', () => {
    for (const t of ['SUPPORTS', 'ASSOCIATED_WITH', 'TEMPORAL_SUCCEEDS', 'INSTANCE_OF', 'OUTCOME_CHANGED'] as const) {
      expect(visualForEdge(t).hierarchy).toBe('agreement');
    }
  });

  it('falls back to "agreement" for unknown types', () => {
    expect(visualForEdge('NOT_REAL' as EdgeType).hierarchy).toBe('agreement');
  });
});

describe('radiusForTier', () => {
  it('tier 1 > tier 2 > tier 3', () => {
    expect(radiusForTier(1)).toBeGreaterThan(radiusForTier(2));
    expect(radiusForTier(2)).toBeGreaterThan(radiusForTier(3));
  });
});

describe('selectionStrokeClass', () => {
  it('maps every NodeType to exactly 4 stroke classes', () => {
    const classes = new Set(NODE_TYPES.map((t) => selectionStrokeClass(t)));
    expect(classes.size).toBe(4);
  });

  it('returns Tailwind stroke classes (no raw hex) — must stay mirrored in the tailwind.config.ts safelist', () => {
    for (const type of NODE_TYPES) {
      expect(selectionStrokeClass(type)).toMatch(/^stroke-/);
    }
  });

  it('follows the same 4-class grouping as visualForNode', () => {
    // Same visual class → same halo stroke; the halo speaks node identity.
    expect(selectionStrokeClass('condition')).toBe(selectionStrokeClass('symptom'));
    expect(selectionStrokeClass('biomarker')).toBe(selectionStrokeClass('observation'));
    expect(selectionStrokeClass('medication')).toBe(selectionStrokeClass('lifestyle'));
    expect(selectionStrokeClass('source_document')).toBe(selectionStrokeClass('mood'));
  });

  it('falls back to the data-class stroke for unknown types (mirrors visualForNode)', () => {
    expect(selectionStrokeClass('not_a_real_type' as NodeType)).toBe(
      selectionStrokeClass('source_document'),
    );
  });
});

describe('haloRadiusForTier', () => {
  it('is node radius + 4 (the forceCollide padding) for every tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(haloRadiusForTier(tier)).toBe(radiusForTier(tier) + 4);
    }
  });
});

describe('labelVisibleByDefault', () => {
  it('only tier 1 has always-on labels', () => {
    expect(labelVisibleByDefault(1)).toBe(true);
    expect(labelVisibleByDefault(2)).toBe(false);
    expect(labelVisibleByDefault(3)).toBe(false);
  });
});

describe('LEGEND_ITEMS', () => {
  it('lists all 4 visual classes once, in canvas order', () => {
    expect(LEGEND_ITEMS.map((i) => i.visualClass)).toEqual([
      'clinical',
      'biomarker',
      'intervention',
      'data',
    ]);
  });

  it('labels the "data" class as "Source" for the reader', () => {
    const data = LEGEND_ITEMS.find((i) => i.visualClass === 'data');
    expect(data?.label).toBe('Source');
  });

  it('swatch fill/stroke match visualForNode (single source — no drift)', () => {
    const biomarker = LEGEND_ITEMS.find((i) => i.visualClass === 'biomarker');
    const v = visualForNode('biomarker');
    expect(biomarker?.fillClass).toBe(v.fillClass);
    expect(biomarker?.strokeClass).toBe(v.strokeClass);
  });
});

describe('toggleHiddenClass', () => {
  it('adds an absent class and removes a present one', () => {
    const empty = new Set<NodeVisualClass>();
    const added = toggleHiddenClass(empty, 'biomarker');
    expect(added.has('biomarker')).toBe(true);
    const removed = toggleHiddenClass(added, 'biomarker');
    expect(removed.has('biomarker')).toBe(false);
  });

  it('returns a new Set without mutating the input', () => {
    const input = new Set<NodeVisualClass>(['clinical']);
    const next = toggleHiddenClass(input, 'data');
    expect(next).not.toBe(input);
    expect(input.has('data')).toBe(false); // input untouched
    expect(next.has('data')).toBe(true);
    expect(next.has('clinical')).toBe(true); // existing members preserved
  });
});
