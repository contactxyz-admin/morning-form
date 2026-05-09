/**
 * Currency formatting per market.
 *
 * Single helper so pricing strings render consistently across page
 * templates, the Stripe checkout button, and lifecycle email bodies.
 * Source of truth for the underlying amount/currency is constants.ts.
 */
import { MEMBERSHIP_PRICE, type Market } from './constants';

/**
 * Format a price for display. Pass the raw amount in minor units
 * (pence/cents); we'll divide and apply the locale formatter.
 *
 * formatPrice('uk', 1900)  → '£19'
 * formatPrice('us', 2900)  → '$29'
 * formatPrice('uk', 1950)  → '£19.50'
 */
export function formatPrice(market: Market, amountInMinorUnits: number): string {
  const { currency } = MEMBERSHIP_PRICE[market];
  const locale = market === 'uk' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // Drop the trailing .00 on whole-pound/dollar amounts; keep two
    // decimals for non-round prices like £19.50.
    minimumFractionDigits: amountInMinorUnits % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountInMinorUnits / 100);
}

/**
 * The headline membership price formatted for display in the given market.
 * Convenience wrapper for the most common call site.
 */
export function formatMembershipPrice(market: Market): string {
  return formatPrice(market, MEMBERSHIP_PRICE[market].amount);
}
