import { describe, expect, it } from 'vitest';
import { formatMembershipPrice, formatPrice } from './currency';

describe('formatPrice', () => {
  it('formats whole UK pounds without trailing decimals', () => {
    expect(formatPrice('uk', 1900)).toBe('£19');
  });

  it('formats whole US dollars without trailing decimals', () => {
    expect(formatPrice('us', 2900)).toBe('$29');
  });

  it('formats fractional UK pounds with two decimals', () => {
    expect(formatPrice('uk', 1950)).toBe('£19.50');
  });

  it('formats fractional US dollars with two decimals', () => {
    expect(formatPrice('us', 2999)).toBe('$29.99');
  });
});

describe('formatMembershipPrice', () => {
  it('returns £19 for uk', () => {
    expect(formatMembershipPrice('uk')).toBe('£19');
  });

  it('returns $29 for us', () => {
    expect(formatMembershipPrice('us')).toBe('$29');
  });
});
