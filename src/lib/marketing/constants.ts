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

/** One-off price for the baseline testing offer on the public landing page. */
export const BASELINE_TEST_PRICE: Record<
  Market,
  { amount: number; currency: 'GBP' | 'USD'; display: string }
> = {
  uk: { amount: 29900, currency: 'GBP', display: '£299' },
  us: { amount: 29900, currency: 'USD', display: '$299' },
};

/**
 * Deck-aligned pricing for the not-yet-launched layers (Studios, Supply).
 * Surfaced today only on the public demo's preview cards (plan
 * 2026-06-10-001 R-F) — components import these, never literal price
 * strings. The DEMO_ prefix is deliberate: these are preview fiction, and
 * a grep must never confuse them with launched pricing like
 * MEMBERSHIP_PRICE. When a layer ships, add its real constant and retire
 * the DEMO_ one.
 */
export const DEMO_STUDIO_VISIT_PRICE = {
  amount: 29900,
  currency: 'USD',
  display: '$299',
} as const;

export const DEMO_SUPPLY_PRICE = {
  amount: 6900,
  currency: 'USD',
  display: '$69',
  period: 'month',
} as const;

/**
 * Per-market clinician vocabulary — "GP" reads native in the UK,
 * "doctor" in the US. Both forms live here so page copy never re-derives
 * the plural from the singular.
 */
export const MARKET_CLINICIAN: Record<Market, { singular: string; plural: string }> = {
  uk: { singular: 'GP', plural: 'GPs' },
  us: { singular: 'doctor', plural: 'doctors' },
};

/**
 * Sources a visitor can connect or upload today, as shown on the landing
 * page. Device names mirror HEALTH_PROVIDERS (src/lib/health/providers.ts),
 * limited to providers with a working path — Garmin is pending partner
 * approval and Google Fit is a deprecated legacy path, so neither is
 * advertised. record-preview.test.ts pins each device name against the
 * provider registry so a rename or removal there fails loudly here.
 */
export const SOURCE_NAMES: ReadonlyArray<string> = [
  'Apple Health',
  'Whoop',
  'Oura',
  'Fitbit',
  'Dexcom',
  'FreeStyle Libre',
  'Blood panels (PDF)',
];

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
