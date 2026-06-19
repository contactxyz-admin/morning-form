import { describe, expect, it } from 'vitest';
import { deriveSourceAbnormality, SOURCE_ABNORMALITY_LABEL } from './source-abnormality';

describe('deriveSourceAbnormality', () => {
  it('returns undefined when the source did not flag the value (nothing fabricated)', () => {
    expect(deriveSourceAbnormality(false, 5, 1, 3)).toBeUndefined();
    // Even a value plainly outside the range is NOT flagged unless the source said so.
    expect(deriveSourceAbnormality(false, 999, 1, 3)).toBeUndefined();
  });

  it('reads direction "above" from the source value vs its printed high', () => {
    expect(deriveSourceAbnormality(true, 3.4, null, 3.0)).toEqual({
      flaggedOutOfRange: true,
      position: 'above',
    });
  });

  it('reads direction "below" from the source value vs its printed low', () => {
    expect(deriveSourceAbnormality(true, 18, 30, 150)).toEqual({
      flaggedOutOfRange: true,
      position: 'below',
    });
  });

  it('falls back to "out_of_range" when the direction is not derivable', () => {
    expect(deriveSourceAbnormality(true, null, 30, 150)).toEqual({
      flaggedOutOfRange: true,
      position: 'out_of_range',
    });
    expect(deriveSourceAbnormality(true, 18, null, null)).toEqual({
      flaggedOutOfRange: true,
      position: 'out_of_range',
    });
  });

  it('a flagged value sitting inside the range relays out_of_range (trusts the source, not our maths)', () => {
    // The source flagged it; we don't second-guess that, and with no direction
    // resolvable from value-vs-range we stay neutral on direction.
    expect(deriveSourceAbnormality(true, 40, 30, 150)?.position).toBe('out_of_range');
  });

  it('label copy is calm and source-relayed (passive voice, never alarming)', () => {
    for (const label of Object.values(SOURCE_ABNORMALITY_LABEL)) {
      expect(label).toMatch(/^Flagged /);
      expect(label).not.toMatch(/urgent|danger|critical|abnormal/i);
    }
  });
});
