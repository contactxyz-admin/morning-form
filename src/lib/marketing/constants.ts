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
 * Stripe price-ID env-var keys. The actual price IDs are runtime env
 * vars (separate test/live values via STRIPE_SECRET_KEY_{TEST,LIVE}
 * dispatch). U8 wires the lookup; U1 only needs the key names.
 */
export const STRIPE_PRICE_ENV_KEYS: Record<Market, string> = {
  uk: 'STRIPE_PRICE_GBP_19',
  us: 'STRIPE_PRICE_USD_29',
};

/**
 * Rate-limit subjectKind constants. D8 reuses MagicLinkRateLimit by
 * extending its subjectKind enum; callers MUST use these constants
 * (drift via literal strings would silently never match a lookup).
 */
export const RATE_LIMIT_KINDS = {
  uploadIp1h: 'upload-ip-1h',
  uploadIp24h: 'upload-ip-24h',
  signupIp1h: 'signup-ip-1h',
  visitBeaconIp1h: 'visit-beacon-ip-1h',
} as const;

export type RateLimitKind = (typeof RATE_LIMIT_KINDS)[keyof typeof RATE_LIMIT_KINDS];

/**
 * Cookie names. Centralised so middleware, route handlers, and the
 * market-banner component all read/write the same keys.
 */
export const MARKET_COOKIE = 'mf_market';
export const ANONYMOUS_COOKIE = 'mf_anon';
