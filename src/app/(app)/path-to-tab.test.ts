import { describe, expect, it } from 'vitest';
import { resolveActiveTab } from './path-to-tab';

describe('resolveActiveTab', () => {
  it.each([
    ['/home', 'home'],
    ['/check-in', 'home'],
    ['/intake', 'home'],
    ['/intake/upload', 'home'],
    ['/ask', 'ask'],
    ['/ask?seed=ferritin', 'ask'],
    ['/record', 'record'],
    ['/record/source/abc123', 'record'],
    ['/topics/iron', 'record'],
    ['/you', 'you'],
    ['/guide', 'you'],
    ['/settings', 'you'],
    ['/settings/shared-links', 'you'],
    ['/decisions', 'decisions'],
  ] as const)('maps %s -> %s', (path, expected) => {
    expect(resolveActiveTab(path)).toBe(expected);
  });

  it('falls back to home for /graph (route 308 redirects to /record so layout never sees this path in the wild)', () => {
    expect(resolveActiveTab('/graph')).toBe('home');
  });

  it('falls back to home for /protocol (RSC redirects to /reveal/priorities so layout never sees this path in the wild)', () => {
    expect(resolveActiveTab('/protocol')).toBe('home');
  });

  it('falls back to home for unmapped paths', () => {
    expect(resolveActiveTab('/unknown')).toBe('home');
    expect(resolveActiveTab('/')).toBe('home');
  });

  it('falls back to home for /insights (intentionally unmapped)', () => {
    // /insights still exists as a route but is no longer a nav tab;
    // surfaces there should show no active tab (resolves to default 'home').
    expect(resolveActiveTab('/insights')).toBe('home');
  });

  it('prefers the longer prefix when both match', () => {
    // /record/source must win over /record.
    expect(resolveActiveTab('/record/source/xyz')).toBe('record');
  });
});
