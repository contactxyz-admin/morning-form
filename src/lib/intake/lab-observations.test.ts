import { describe, expect, it } from 'vitest';
import {
  buildLabObservationGraphInputs,
  observationKeyFor,
} from './lab-observations';

describe('observationKeyFor', () => {
  it('builds obs_<marker>_<yyyy_mm_dd> keys', () => {
    expect(observationKeyFor('ferritin', '2026-04-01')).toBe('obs_ferritin_2026_04_01');
  });

  it('slugifies non-conforming marker keys (hyphens, caps)', () => {
    expect(observationKeyFor('Fasting-Glucose', '2026-04-01')).toBe(
      'obs_fasting_glucose_2026_04_01',
    );
  });

  it('returns null for unparseable dates and empty marker keys', () => {
    expect(observationKeyFor('ferritin', 'not a date')).toBeNull();
    expect(observationKeyFor('—', '2026-04-01')).toBeNull();
  });

  it('collapses same-day timestamps onto one key', () => {
    expect(observationKeyFor('tsh', '2026-04-01T08:30:00Z')).toBe(
      observationKeyFor('tsh', '2026-04-01T17:45:00Z'),
    );
  });
});

describe('buildLabObservationGraphInputs', () => {
  const ferritin = {
    canonicalKey: 'ferritin',
    displayName: 'Ferritin',
    value: 18,
    unit: 'ug/L',
    collectionDate: '2026-04-01',
    supportingChunkIndices: [0],
  };

  it('emits one observation node + INSTANCE_OF edge per dated reading', () => {
    const { nodes, edges } = buildLabObservationGraphInputs([ferritin], '2026-04-01');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'observation',
      canonicalKey: 'obs_ferritin_2026_04_01',
      promoted: false,
      supportingChunkIndices: [0],
      attributes: {
        value: 18,
        unit: 'ug/L',
        measuredAt: new Date('2026-04-01').toISOString(),
        context: 'clinic',
        source: 'lab_pdf',
      },
    });
    expect(nodes[0].displayName).toMatch(/^Ferritin · /);
    expect(edges).toEqual([
      {
        type: 'INSTANCE_OF',
        fromType: 'observation',
        fromCanonicalKey: 'obs_ferritin_2026_04_01',
        toType: 'biomarker',
        toCanonicalKey: 'ferritin',
      },
    ]);
  });

  it('falls back to the panel reportCollectionDate when the reading has none', () => {
    const { nodes } = buildLabObservationGraphInputs(
      [{ ...ferritin, collectionDate: null }],
      '2026-06-15',
    );
    expect(nodes[0].canonicalKey).toBe('obs_ferritin_2026_06_15');
  });

  it('skips undated readings entirely (no node, no edge)', () => {
    const { nodes, edges } = buildLabObservationGraphInputs(
      [{ ...ferritin, collectionDate: null }],
      null,
    );
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('different panels of the same marker produce distinct dated instances', () => {
    const april = buildLabObservationGraphInputs([ferritin], null);
    const june = buildLabObservationGraphInputs(
      [{ ...ferritin, value: 41, collectionDate: '2026-06-01' }],
      null,
    );
    expect(april.nodes[0].canonicalKey).not.toBe(june.nodes[0].canonicalKey);
  });
});
