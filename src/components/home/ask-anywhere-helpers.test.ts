import { describe, expect, it } from 'vitest';
import { buildAskHref } from './ask-anywhere-helpers';

describe('buildAskHref', () => {
  it('returns null for empty input', () => {
    expect(buildAskHref('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(buildAskHref('   \n\t  ')).toBeNull();
  });

  it('encodes plain text', () => {
    expect(buildAskHref('why is my ferritin low')).toBe(
      '/ask?seed=why%20is%20my%20ferritin%20low',
    );
  });

  it('trims surrounding whitespace before encoding', () => {
    expect(buildAskHref('   hello   ')).toBe('/ask?seed=hello');
  });

  it('round-trips apostrophes and quotes', () => {
    const href = buildAskHref(`what's a "good" multivitamin?`);
    expect(href).not.toBeNull();
    const seed = new URL(`http://x.test${href!}`).searchParams.get('seed');
    expect(seed).toBe(`what's a "good" multivitamin?`);
  });

  it('round-trips unicode and emoji', () => {
    const href = buildAskHref('é — naïve 🩺');
    expect(href).not.toBeNull();
    const seed = new URL(`http://x.test${href!}`).searchParams.get('seed');
    expect(seed).toBe('é — naïve 🩺');
  });
});
