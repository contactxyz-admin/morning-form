import { describe, expect, it } from 'vitest';
import { ARCHETYPE_KEYS } from '@/lib/priority-markers-schema';
import { resolvePrioritiesContent } from '@/lib/priority-marker-engine';
import {
  getTestRouteMarket,
  isBlockedState,
  type Market,
} from '@/../content/test-routes/index';

/**
 * Content-mechanics + route-guidance coverage (Plan 2026-06-06-001 U1).
 *
 * Every archetype's every marker must resolve test-mechanics fields
 * (sampleType + fastingRequired), and both markets must resolve complete
 * route guidance. This is the build-time contract that backs the "Get this
 * tested" surface for ALL markers, not just the ones edited by hand.
 */

const MARKETS: Market[] = ['uk', 'us'];

describe('test-mechanics content coverage', () => {
  it('every archetype resolves and validates', () => {
    for (const key of ARCHETYPE_KEYS) {
      expect(resolvePrioritiesContent(key), `archetype ${key} missing`).toBeDefined();
    }
  });

  it('every marker in every archetype resolves sampleType + fastingRequired', () => {
    for (const key of ARCHETYPE_KEYS) {
      const content = resolvePrioritiesContent(key);
      expect(content).toBeDefined();
      for (const m of content!.markers) {
        expect(typeof m.sampleType, `${key}/${m.markerName} sampleType`).toBe('string');
        expect(m.sampleType.length).toBeGreaterThan(0);
        expect(typeof m.fastingRequired, `${key}/${m.markerName} fastingRequired`).toBe('boolean');
      }
    }
  });
});

describe('route guidance per market', () => {
  it('resolves complete guidance (concierge partners + GP route + self-order) for both markets', () => {
    for (const market of MARKETS) {
      const routes = getTestRouteMarket(market);
      expect(routes.market).toBe(market);
      expect(routes.conciergePartnerNames.length).toBeGreaterThan(0);
      expect(routes.gpRouteLabel.length).toBeGreaterThan(0);
      expect(Array.isArray(routes.selfOrderPartners)).toBe(true);
      expect(routes.selfOrderPartners.length).toBeGreaterThan(0);
    }
  });

  it('hard-blocks NY/NJ/RI for US, does NOT hard-block AZ/HI (provider-dependent) or UK', () => {
    for (const blocked of ['NY', 'NJ', 'RI', 'ny', 'nj', 'ri']) {
      expect(isBlockedState('us', blocked), `${blocked} should be blocked`).toBe(true);
    }
    for (const allowed of ['CA', 'TX', 'AZ', 'HI']) {
      expect(isBlockedState('us', allowed), `${allowed} should not be hard-blocked`).toBe(false);
    }
    expect(isBlockedState('uk', 'NY')).toBe(false);
  });

  it('US blocked-state guidance copy is present', () => {
    const us = getTestRouteMarket('us');
    expect(us.blockedStateGuidance.length).toBeGreaterThan(0);
    expect(us.blockedStateGuidance).toMatch(/New York|New Jersey|Rhode Island/);
  });
});

describe('get-tested sheet — hs-CRP both markets (plan verification step)', () => {
  it('prints a resolvable sheet for hs-CRP in UK and US', () => {
    let marker: { markerName: string; sampleType: string; fastingRequired: boolean } | undefined;
    for (const key of ARCHETYPE_KEYS) {
      const c = resolvePrioritiesContent(key);
      marker = c?.markers.find((m) => m.markerName === 'hs-CRP');
      if (marker) break;
    }
    expect(marker, 'hs-CRP present in content').toBeDefined();
    for (const market of MARKETS) {
      const routes = getTestRouteMarket(market);
      expect(marker!.sampleType.length).toBeGreaterThan(0);
      expect(routes.conciergePartnerNames.length).toBeGreaterThan(0);
      expect(routes.gpRouteLabel.length).toBeGreaterThan(0);
    }
  });
});
