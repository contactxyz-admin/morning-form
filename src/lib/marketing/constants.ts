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
 * market-banner / visit-beacon components all read/write the same keys.
 */
export const MARKET_COOKIE = 'mf_market';
export const ANONYMOUS_COOKIE = 'mf_anon';

/**
 * Anonymous-visitor cookie lifespan. ~13 months keeps returning visitors
 * attributable across a full year-over-year window without ballooning
 * the LandingPageVisit row count via cookie churn.
 */
export const ANONYMOUS_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 400;

/**
 * Rate-limit subjectKind constants for the marketing tree. Phase 0 uses
 * only the visit-beacon kind; upload + signup variants land in Phase 1
 * alongside their first consumers (U5/U6).
 */
export const RATE_LIMIT_KINDS = {
  visitBeaconIp1h: 'visit-beacon-ip-1h',
} as const;

export type RateLimitKind = (typeof RATE_LIMIT_KINDS)[keyof typeof RATE_LIMIT_KINDS];

/**
 * Visit-beacon rate limit cap per IP per hour. 60/h is generous for
 * legitimate browser-tab churn (a 60-min reading session reloading every
 * minute would just hit the cap) while shutting down bot rotation.
 */
export const VISIT_BEACON_HOURLY_CAP = 60;
