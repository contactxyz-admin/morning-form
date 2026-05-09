/**
 * Market detection and helpers.
 *
 * The [market] route segment is the canonical source of truth at request
 * time; RSC pages get `params.market` directly. The functions below are
 * for two cases:
 *
 *   1. Middleware geo-redirect at `/` — `inferMarketFromCountryCode`
 *      maps `x-vercel-ip-country` to a Market.
 *   2. Components below the `[market]` segment that don't have access to
 *      params (e.g., the market-banner shell) — `getMarket()` reads
 *      cookie/header context. Tests should pass `params.market` directly
 *      where possible.
 */
import { cookies, headers } from 'next/headers';
import { DEFAULT_MARKET, MARKETS, MARKET_COOKIE, type Market } from './constants';

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value);
}

/**
 * Map a Vercel-set country code to a supported market. Vercel sets
 * `x-vercel-ip-country` in production from the actual edge geo (it
 * strips client-supplied values). In preview deployments the header
 * may be absent — the DEFAULT_MARKET fallback handles that.
 */
export function inferMarketFromCountryCode(countryCode: string | null | undefined): Market {
  if (!countryCode) return DEFAULT_MARKET;
  const code = countryCode.trim().toUpperCase();
  if (code === 'GB' || code === 'UK') return 'uk';
  if (code === 'US') return 'us';
  return DEFAULT_MARKET;
}

/**
 * Server helper: resolve the visitor's market from cookie (override)
 * then geo header (default). Cookie wins when both are present, so
 * the in-page banner override sticks across requests.
 */
export function getMarket(): Market {
  const cookieMarket = cookies().get(MARKET_COOKIE)?.value;
  if (isMarket(cookieMarket)) return cookieMarket;
  const country = headers().get('x-vercel-ip-country');
  return inferMarketFromCountryCode(country);
}
