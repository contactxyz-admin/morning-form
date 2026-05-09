/**
 * Single source of truth for marketing-funnel constants.
 *
 * R11 (plan): pricing, market keys, rate-limit subjectKind values, and
 * cookie names live here. Page templates, Stripe code, middleware, and
 * rate-limit callers all import from this module — never literal strings.
 */

export const MARKETS = ['uk', 'us'] as const;
export type Market = (typeof MARKETS)[number];

/**
 * Default market for visitors whose country header is missing or doesn't
 * map to a supported market. We default to US because the larger TAM
 * absorbs noise from non-UK/US visitors more gracefully.
 */
export const DEFAULT_MARKET: Market = 'us';

/**
 * Display configuration per market. Currency codes match Stripe's API.
 * Amount is in minor units (pence, cents) consistent with Stripe semantics.
 */
export const MEMBERSHIP_PRICE: Record<
  Market,
  { amount: number; currency: 'GBP' | 'USD'; display: string; period: string }
> = {
  uk: { amount: 1900, currency: 'GBP', display: '£19', period: 'month' },
  us: { amount: 2900, currency: 'USD', display: '$29', period: 'month' },
};

/**
 * Cookie names. Centralised so middleware, route handlers, and the
 * market-banner component all read/write the same key. Phase 1's
 * `mf_anon` cookie + the rate-limit subjectKind constants + the
 * Stripe price-ID env-var keys land alongside their first consumers
 * (U5/U6/U8) rather than ahead of them.
 */
export const MARKET_COOKIE = 'mf_market';
