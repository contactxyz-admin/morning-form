import { describe, expect, it } from 'vitest';
import { resolveActiveTab } from './path-to-tab';

describe('resolveActiveTab', () => {
  it.each([
    ['/home', 'home'],
    ['/check-in', 'home'],
    ['/intake', 'home'],
    ['/intake/upload', 'home'],
    ['/record', 'record'],
    ['/record/source/abc123', 'record'],
    ['/topics/iron', 'record'],
    ['/graph', 'record'],
    ['/protocol', 'protocol'],
    ['/insights', 'insights'],
    ['/you', 'you'],
    ['/guide', 'you'],
    ['/settings', 'you'],
    ['/settings/shared-links', 'you'],
  ] as const)('maps %s -> %s', (path, expected) => {
    expect(resolveActiveTab(path)).toBe(expected);
  });

  it('falls back to home for unmapped paths', () => {
    expect(resolveActiveTab('/unknown')).toBe('home');
    expect(resolveActiveTab('/')).toBe('home');
  });

  it('prefers the longer prefix when both match', () => {
    // /record/source must win over /record.
    expect(resolveActiveTab('/record/source/xyz')).toBe('record');
  });
});
