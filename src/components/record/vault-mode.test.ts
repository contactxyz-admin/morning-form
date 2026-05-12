import { describe, expect, it } from 'vitest';
import { parseVaultMode, VAULT_MODES } from './vault-mode';

describe('parseVaultMode', () => {
  it('returns the canonical mode when the input matches', () => {
    expect(parseVaultMode('index')).toBe('index');
    expect(parseVaultMode('map')).toBe('map');
  });

  it('returns "index" for null (URL param missing)', () => {
    expect(parseVaultMode(null)).toBe('index');
  });

  it('returns "index" for undefined (URL param absent)', () => {
    expect(parseVaultMode(undefined)).toBe('index');
  });

  it('returns "index" for empty string', () => {
    expect(parseVaultMode('')).toBe('index');
  });

  it('returns "index" for any value outside the VAULT_MODES set (stale or typo-d deep-link)', () => {
    // A future `?mode=timeline` deep-link landing on an older build should
    // resolve to the index view rather than throw — silent fallback is
    // intentional. If you add 'timeline' to VAULT_MODES this test will
    // need updating, which is the right kind of failure.
    expect(parseVaultMode('timeline')).toBe('index');
    expect(parseVaultMode('Map')).toBe('index'); // case-sensitive
    expect(parseVaultMode('🤖')).toBe('index');
  });

  it('VAULT_MODES is the source of truth — adding a mode here should be enough', () => {
    // Pin the current set so adding/removing a mode is a deliberate code
    // change rather than a silent UI drift.
    expect(VAULT_MODES).toEqual(['index', 'map']);
  });
});
