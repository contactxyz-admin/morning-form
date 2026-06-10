import { describe, expect, it } from 'vitest';
import { markerJoinKey } from './marker-key';

describe('markerJoinKey', () => {
  it('uses the registry key when present, lowercased', () => {
    expect(markerJoinKey('serum_ferritin', 'Ferritin')).toBe('ferritin');
  });

  it('falls back to the canonicalKey when registryKey is absent/empty, lowercased', () => {
    expect(markerJoinKey('Serum_Ferritin')).toBe('serum_ferritin');
    expect(markerJoinKey('serum_ferritin', '')).toBe('serum_ferritin');
    expect(markerJoinKey('serum_ferritin', null)).toBe('serum_ferritin');
    expect(markerJoinKey('serum_ferritin', undefined)).toBe('serum_ferritin');
  });

  it('reunites two canonicalKeys that share a registry key (cross-panel drift)', () => {
    expect(markerJoinKey('ferritin', 'ferritin')).toBe(markerJoinKey('serum_ferritin', 'ferritin'));
  });

  it('ignores a non-string registryKey', () => {
    expect(markerJoinKey('ferritin', 123 as unknown)).toBe('ferritin');
  });
});
