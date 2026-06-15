import { describe, expect, it } from 'vitest';
import type { NodeChangeWire } from '@/types/graph';
import { asOfVisibility, changeVisibleAsOf, scrubberStops } from './as-of';

const BASELINE = '2024-04-20T09:00:00.000Z';
const RECHECK = '2026-02-10T09:00:00.000Z';
const baselineEpoch = Date.parse(BASELINE);
const recheckEpoch = Date.parse(RECHECK);

const change: NodeChangeWire = {
  direction: 'up',
  classification: 'improved',
  beforeValue: 42,
  beforeAt: BASELINE,
  afterValue: 71,
  afterAt: RECHECK,
  unit: 'µg/L',
};

describe('asOfVisibility', () => {
  it('present when the node was born before asOf', () => {
    expect(asOfVisibility(BASELINE, recheckEpoch)).toBe('present');
  });

  it('dimmed when the node is born after asOf', () => {
    expect(asOfVisibility(RECHECK, baselineEpoch)).toBe('dimmed');
  });

  it('born exactly at asOf is present (boundary inclusive)', () => {
    expect(asOfVisibility(BASELINE, baselineEpoch)).toBe('present');
  });

  it('a node with no firstSeenAt is always present', () => {
    expect(asOfVisibility(undefined, baselineEpoch)).toBe('present');
    expect(asOfVisibility(null, baselineEpoch)).toBe('present');
  });

  it('asOfEpoch null (scrubber off) is always present', () => {
    expect(asOfVisibility(RECHECK, null)).toBe('present');
  });
});

describe('changeVisibleAsOf', () => {
  it('shows once asOf reaches the change afterAt', () => {
    expect(changeVisibleAsOf(change, recheckEpoch)).toBe(true);
  });

  it('boundary inclusive at afterAt', () => {
    expect(changeVisibleAsOf(change, recheckEpoch)).toBe(true);
    expect(changeVisibleAsOf(change, recheckEpoch - 1)).toBe(false);
  });

  it('hidden before the change date', () => {
    expect(changeVisibleAsOf(change, baselineEpoch)).toBe(false);
  });

  it('no change → nothing to show', () => {
    expect(changeVisibleAsOf(undefined, recheckEpoch)).toBe(false);
  });

  it('asOfEpoch null (scrubber off) → show', () => {
    expect(changeVisibleAsOf(change, null)).toBe(true);
  });
});

describe('scrubberStops', () => {
  it('returns sorted, de-duplicated firstSeenAt + change.afterAt epochs', () => {
    const stops = scrubberStops([
      { firstSeenAt: RECHECK },
      { firstSeenAt: BASELINE },
      { firstSeenAt: BASELINE }, // dup
      { firstSeenAt: BASELINE, change }, // afterAt = RECHECK (dup of node 1's firstSeen)
    ]);
    expect(stops).toEqual([baselineEpoch, recheckEpoch]);
  });

  it('includes a change afterAt even when no node is born then', () => {
    // Every node born at baseline, but a change comes due at recheck.
    const stops = scrubberStops([{ firstSeenAt: BASELINE, change }]);
    expect(stops).toEqual([baselineEpoch, recheckEpoch]);
  });

  it('no temporal data → empty (caller degrades to a single now-stop)', () => {
    expect(scrubberStops([{ firstSeenAt: undefined }, {}])).toEqual([]);
  });
});
