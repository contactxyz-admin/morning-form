import { describe, expect, it } from 'vitest';
import { wearableMetricNamesFor } from './metric-aliases';

describe('wearableMetricNamesFor', () => {
  it('always includes the marker name itself (lowercased)', () => {
    expect(wearableMetricNamesFor('Ferritin')).toContain('ferritin');
  });

  it('maps a lab display name to its persona/wearable metric alias', () => {
    expect(wearableMetricNamesFor('Ferritin')).toContain('ferritin_ng_ml');
    expect(wearableMetricNamesFor('HbA1c')).toContain('hba1c_percent');
    expect(wearableMetricNamesFor('Body weight')).toContain('weight_kg');
  });

  it('de-duplicates and is case-insensitive on input', () => {
    const names = wearableMetricNamesFor('FERRITIN');
    expect(names).toEqual(Array.from(new Set(names)));
    expect(names).toContain('ferritin');
  });

  it('returns just the name for an unmapped marker (no fuzzy guessing)', () => {
    expect(wearableMetricNamesFor('Selenium')).toEqual(['selenium']);
  });

  it('is safe for prototype-member tokens — marker names are user-controlled URL input', () => {
    // A plain-object map would resolve Object.prototype members for these and
    // crash on aliases.map(); the Map-backed lookup must return just the name.
    for (const hostile of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(wearableMetricNamesFor(hostile)).toEqual([hostile.toLowerCase()]);
    }
  });
});
