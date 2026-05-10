import { describe, expect, it } from 'vitest';
import { inferMarketFromCountryCode, isMarket } from './market';

describe('inferMarketFromCountryCode', () => {
  it('maps GB → uk', () => {
    expect(inferMarketFromCountryCode('GB')).toBe('uk');
  });

  it('maps lowercase gb → uk (case-insensitive)', () => {
    expect(inferMarketFromCountryCode('gb')).toBe('uk');
  });

  it('maps the legacy alias UK → uk', () => {
    // ISO 3166-1 alpha-2 is GB, but some legacy tools / proxies emit UK.
    expect(inferMarketFromCountryCode('UK')).toBe('uk');
  });

  it('maps US → us', () => {
    expect(inferMarketFromCountryCode('US')).toBe('us');
  });

  it('falls back to default for unsupported countries (FR, DE, ...)', () => {
    expect(inferMarketFromCountryCode('FR')).toBe('us'); // DEFAULT_MARKET
    expect(inferMarketFromCountryCode('DE')).toBe('us');
    expect(inferMarketFromCountryCode('AU')).toBe('us');
  });

  it('falls back to default for null / undefined / empty', () => {
    expect(inferMarketFromCountryCode(null)).toBe('us');
    expect(inferMarketFromCountryCode(undefined)).toBe('us');
    expect(inferMarketFromCountryCode('')).toBe('us');
  });

  it('strips whitespace before mapping', () => {
    expect(inferMarketFromCountryCode('  GB  ')).toBe('uk');
  });
});

describe('isMarket', () => {
  it('accepts known markets', () => {
    expect(isMarket('uk')).toBe(true);
    expect(isMarket('us')).toBe(true);
  });

  it('rejects unknown markets and non-strings', () => {
    expect(isMarket('fr')).toBe(false);
    expect(isMarket('UK')).toBe(false); // case-sensitive guard — markets are stored lowercase
    expect(isMarket(undefined)).toBe(false);
    expect(isMarket(null)).toBe(false);
    expect(isMarket(123)).toBe(false);
    expect(isMarket('')).toBe(false);
  });
});
