import { describe, expect, it } from 'vitest';
import {
  buildMarkerTrends,
  markersTrendingWrongDirection,
  retestSuggestion,
  singleReadingMarkers,
  type MarkerSeriesInput,
  type TrendPoint,
} from './trend';
import { FORBIDDEN_PHRASE_PATTERNS } from '@/lib/scribe/policy/forbidden-phrases';

function p(value: number, timestamp: string, unit = 'ug/L'): TrendPoint {
  return { value, unit, timestamp };
}

const INPUTS: MarkerSeriesInput[] = [
  // Worsening: vitamin D falling away from range across 3 consistent points.
  {
    marker: 'Vitamin D',
    range: { low: 50, high: 150 },
    points: [p(70, '2026-01-01', 'nmol/L'), p(55, '2026-03-01', 'nmol/L'), p(40, '2026-05-01', 'nmol/L')],
  },
  // Improving: ferritin rising toward range.
  {
    marker: 'Ferritin',
    range: { low: 30, high: 400 },
    points: [p(18, '2026-02-01'), p(41, '2026-04-01'), p(62, '2026-06-01')],
  },
  // Single reading: deserves a retest.
  {
    marker: 'Magnesium',
    range: { low: 0.7, high: 1.0 },
    points: [p(0.6, '2026-05-01', 'mmol/L')],
  },
  // Bigger worsening mover (for sort order): TSH climbing far above range.
  {
    marker: 'TSH',
    range: { low: 0.4, high: 4.0 },
    points: [p(5, '2026-01-01', 'mU/L'), p(8, '2026-03-01', 'mU/L'), p(12, '2026-05-01', 'mU/L')],
  },
];

describe('trend derived views', () => {
  const trends = buildMarkerTrends(INPUTS);

  it('markersTrendingWrongDirection returns only worsening markers, deterministically ordered by name', () => {
    const wrong = markersTrendingWrongDirection(trends);
    expect(wrong.map((t) => t.marker)).toEqual(['TSH', 'Vitamin D']); // alphabetical, not unit-incomparable magnitude
  });

  it('excludes improving and single-reading markers from the wrong-direction view', () => {
    const wrong = markersTrendingWrongDirection(trends);
    expect(wrong.map((t) => t.marker)).not.toContain('Ferritin');
    expect(wrong.map((t) => t.marker)).not.toContain('Magnesium');
  });

  it('singleReadingMarkers returns exactly the one-reading markers', () => {
    expect(singleReadingMarkers(trends).map((t) => t.marker)).toEqual(['Magnesium']);
  });

  it('retest suggestion for a single reading is descriptive and present', () => {
    const mag = singleReadingMarkers(trends)[0];
    const s = retestSuggestion(mag);
    expect(s).toContain('single reading for Magnesium');
    expect(s).toContain('a repeat test would confirm');
  });

  it('retest suggestion for a worsening marker frames a repeat test, not a treatment', () => {
    const tsh = markersTrendingWrongDirection(trends)[0];
    const s = retestSuggestion(tsh);
    expect(s).toContain('TSH');
    expect(s).toContain('repeat test would confirm this direction');
  });

  it('no retest suggestion for a confident improving marker', () => {
    const ferritin = trends.find((t) => t.marker === 'Ferritin')!;
    expect(retestSuggestion(ferritin)).toBeNull();
  });

  // The safety contract: every generated suggestion must pass the shared
  // forbidden-phrase scanner — no dose, no dietary directive, no causal
  // over-claim (U14). This couples U12's copy to U14's enforcement.
  it('every generated retest suggestion clears the forbidden-phrase scanner', () => {
    for (const t of trends) {
      const s = retestSuggestion(t);
      if (!s) continue;
      for (const re of FORBIDDEN_PHRASE_PATTERNS) {
        expect(re.test(s), `"${s}" matched ${re}`).toBe(false);
      }
    }
  });
});
