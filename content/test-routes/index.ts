/**
 * Test-route guidance per market (Plan 2026-06-06-001 U1).
 *
 * Each market returns the partner names, ballpark price ranges, and
 * blocked-state guidance for the "Get this tested" detail view. Copy
 * is descriptive only — never directive. All content is scanned by
 * the static-copy compliance test.
 *
 * This module is additive to the priority-markers content layer:
 * markers declare WHAT to test; this module declares HOW for each market.
 */

export type Market = 'uk' | 'us';

export interface PartnerRoute {
  /** Display name, e.g. "Medichecks" or "Ulta Lab Tests". */
  name: string;
  /** One-line description of the self-order path. */
  description: string;
  /** Ballpark price range as a human-readable string (NOT a specific quote). */
  priceRange: string;
  /** URL to the partner's consumer-facing self-order page (not affiliate). */
  url: string;
}

export interface TestRouteMarket {
  /** The market this guidance applies to. */
  market: Market;
  /** When true, the concierge booking route is available for this market. */
  conciergeAvailable: boolean;
  /** Partner(s) MorningForm uses for concierge booking in this market.
   *  Named on the booking form pre-submission (Article 13 disclosure). */
  conciergePartnerNames: string[];
  /** Self-order partners for route 3 ("order it yourself"). */
  selfOrderPartners: PartnerRoute[];
  /** GP/clinician route — always available. */
  gpRouteLabel: string;
  /** Blocked-state copy (NY/NJ/RI + provider-dependent). */
  blockedStateGuidance: string;
  /** US states where direct-access testing is blocked for all providers. */
  blockedStates: string[];
}

const UK_MARKET: TestRouteMarket = {
  market: 'uk',
  conciergeAvailable: true,
  conciergePartnerNames: ['Medichecks'],
  selfOrderPartners: [
    {
      name: 'Medichecks',
      description:
        'Self-order finger-prick or venous blood tests. Results in ~2 days; GP-reviewed reports included.',
      priceRange: '~£19–£45 per marker',
      url: 'https://medichecks.com',
    },
    {
      name: 'Thriva',
      description:
        'At-home finger-prick tests by post. Results in ~2 days with a personalised dashboard.',
      priceRange: '~£9–£49 per marker',
      url: 'https://thriva.co',
    },
  ],
  gpRouteLabel:
    'Ask your GP — mention this marker and your MorningForm priorities. NHS blood tests are free at the point of care.',
  blockedStateGuidance: '',
  blockedStates: [],
};

const US_MARKET: TestRouteMarket = {
  market: 'us',
  conciergeAvailable: true,
  conciergePartnerNames: ['Ulta Lab Tests'],
  selfOrderPartners: [
    {
      name: 'Ulta Lab Tests',
      description:
        'Self-order blood tests at 2,100+ Labcorp and Quest draw centres. Results in 24–48 hours.',
      priceRange: '~$15–$60 per marker',
      url: 'https://ultalabtests.com',
    },
    {
      name: 'QuestDirect',
      description:
        'Quest\'s consumer-direct testing. Buy online, visit a Quest Patient Service Center. Results via the MyQuest portal. At-home self-collection kits available for some markers.',
      priceRange: '~$29–$79 per marker',
      url: 'https://questhealth.com',
    },
  ],
  gpRouteLabel:
    'Ask your primary care provider. Many insurers cover preventive blood work at your annual physical — mention the specific markers by name.',
  blockedStateGuidance:
    'Direct-access blood testing is not available in New York, New Jersey, or Rhode Island (state regulations require a physician order for all lab tests). Arizona and Hawaii restrict some providers. Your best path is through your primary care provider — they can order the same tests, and most insurers cover them.',
  blockedStates: ['NY', 'NJ', 'RI', 'AZ', 'HI'],
};

const MARKET_MAP: Record<Market, TestRouteMarket> = {
  uk: UK_MARKET,
  us: US_MARKET,
};

export function getTestRouteMarket(market: Market): TestRouteMarket {
  return MARKET_MAP[market];
}

/**
 * Check whether a US state code is blocked for direct-access testing.
 * Non-US markets always return false.
 */
export function isBlockedState(market: Market, stateCode: string): boolean {
  if (market !== 'us') return false;
  const normalized = stateCode.trim().toUpperCase();
  return US_MARKET.blockedStates.includes(normalized);
}
