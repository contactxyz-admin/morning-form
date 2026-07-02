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
    referenceChangeValuePct: null,
    withinNoise: null,
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

  it('resolves the AUTHORED interpretation for a PRODUCTION registry slug (via alias)', () => {
    // Production LDL's canonicalKey/joinKey is the registry slug 'ldl_cholesterol',
    // NOT the short MATRIX key 'ldl' — the alias must still resolve the authored
    // rule (Medium–High), not fall through to DEFAULT_RULE (Low). Using the real
    // slug here guards the path the prior 'ldl' fixture masked.
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'ldl_cholesterol', attributes: {} })],
      diff([change({ joinKey: 'ldl_cholesterol' })]),
    )[0];
    expect(row.change?.afterValue).toBe(145);
    expect(row.interpretation?.signalClarity).toBe('Medium–High');
  });

  it('shows change but NO interpretation for an unauthored marker (authored-only policy)', () => {
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'glucose', attributes: {} })],
      diff([change({ joinKey: 'glucose' })]),
    )[0];
    expect(row.change?.afterValue).toBe(145); // value/direction still shown
    expect(row.interpretation).toBeUndefined(); // no inferred flag
  });

  it('relays the SOURCE flag for an unauthored, lab-flagged marker (the safety net)', () => {
    // Vitamin D the lab marked out of range, no authored rule: no interpretation,
    // but the source's own flag is relayed so it is never silently neutral.
    const row = enrichGroundedNodes(
      [
        node({
          canonicalKey: 'vitamin_d',
          attributes: {
            flaggedOutOfRange: true,
            value: 20,
            referenceRangeLow: 30,
            referenceRangeHigh: 100,
          },
        }),
      ],
      diff([change({ joinKey: 'vitamin_d' })]),
    )[0];
    expect(row.interpretation).toBeUndefined(); // still no MorningForm judgement
    expect(row.sourceFlag).toEqual({ flaggedOutOfRange: true, position: 'below' });
    expect(row.change?.afterValue).toBe(145); // value/direction still shown
  });

  it('relays the source flag even with NO usable diff (single panel / flag off)', () => {
    // The source flag is the source's own, not a longitudinal diff — it must show
    // for a single-panel record where change/interpretation are withheld.
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'vitamin_d', attributes: { flaggedOutOfRange: true } })],
      null,
    )[0];
    expect(row.sourceFlag).toEqual({ flaggedOutOfRange: true, position: 'out_of_range' });
    expect(row.change).toBeUndefined();
    expect(row.interpretation).toBeUndefined();
  });

  it('does not fabricate a source flag when the marker was not flagged', () => {
    const row = enrichGroundedNodes(
      [node({ canonicalKey: 'glucose', attributes: { value: 999, referenceRangeHigh: 100 } })],
      diff([change({ joinKey: 'glucose' })]),
    )[0];
    expect(row.sourceFlag).toBeUndefined();
  });

  it('carries BOTH interpretation and sourceFlag for an authored, lab-flagged marker', () => {
    // Both signals are computed; the detail surfaces prioritise the (richer)
    // authored interpretation over the source flag at render. Documenting the
    // data contract so the two never silently collapse onto one field.
    const row = enrichGroundedNodes(
      [
        node({
          canonicalKey: 'ldl',
          attributes: { flaggedOutOfRange: true, value: 3.4, referenceRangeHigh: 3.0 },
        }),
      ],
      diff([change({ joinKey: 'ldl', afterValue: 3.4, referenceHigh: 3.0 })]),
    )[0];
    expect(row.interpretation?.signalClarity).toBe('Medium–High'); // authored LDL
    expect(row.sourceFlag).toEqual({ flaggedOutOfRange: true, position: 'above' });
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
