/**
 * Market detection and helpers.
 *
 * The [market] route segment is the canonical source of truth at request
 * time; RSC pages get `params.market` directly. `inferMarketFromCountryCode`
 * exists for the middleware geo-redirect at `/` and for the
 * market-banner suppression check (see `src/components/marketing/market-banner.tsx`,
 * which reads cookies/headers itself rather than going through a helper).
 */
import { DEFAULT_MARKET, MARKETS, type Market } from './constants';

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
