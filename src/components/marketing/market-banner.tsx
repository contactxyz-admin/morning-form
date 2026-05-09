/**
 * Market-mismatch banner.
 *
 * Server component. Renders an unobtrusive "switch market" banner only
 * when the visitor's inferred market (cookie override OR Vercel geo)
 * differs from the page they actually landed on. This keeps a UK
 * visitor who lands on /us via SEO from being silently rerouted —
 * they see a discoverable hint, can switch, and the URL change is
 * the persistent signal (cookie persistence is a Phase-1 concern).
 */
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { MARKET_COOKIE, type Market } from '@/lib/marketing/constants';
import { inferMarketFromCountryCode, isMarket } from '@/lib/marketing/market';

interface MarketBannerProps {
  pageMarket: Market;
}

export function MarketBanner({ pageMarket }: MarketBannerProps) {
  const cookieMarket = cookies().get(MARKET_COOKIE)?.value;
  // If a valid cookie matches the page, the visitor explicitly chose to be
  // here — no banner.
  if (isMarket(cookieMarket) && cookieMarket === pageMarket) return null;

  // Otherwise, see whether the inferred market disagrees with the page.
  const country = headers().get('x-vercel-ip-country');
  const inferred = isMarket(cookieMarket)
    ? cookieMarket
    : inferMarketFromCountryCode(country);
  if (inferred === pageMarket) return null;

  const inferredLabel = inferred === 'uk' ? 'the UK' : 'the US';
  const switchTarget = inferred === 'uk' ? '/uk' : '/us';

  return (
    <div className="border-b border-border bg-surface-warm">
      <div className="px-6 sm:px-10 lg:px-16 py-2 max-w-[1400px] mx-auto flex items-center justify-between gap-4 text-caption text-text-secondary">
        <span>
          You appear to be visiting from {inferredLabel}.
        </span>
        <Link
          href={switchTarget}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-primary hover:text-text-secondary transition-colors"
          aria-label={`Switch to the ${inferred} site`}
        >
          Switch to {switchTarget} →
        </Link>
      </div>
    </div>
  );
}
