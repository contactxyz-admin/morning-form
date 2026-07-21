import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { MarkerIndex } from '@/components/marketing/marker-index';
import { testingMarkers } from '../../../content/marketing/testing-markers';
import LandingPage from './page';
import PartnersPage, { generateMetadata as generatePartnersMetadata } from './partners/page';
import TestingPage, { generateMetadata as generateTestingMetadata } from './testing/page';

type Market = 'uk' | 'us';

function landingTree(market: Market): ReactElement {
  return LandingPage({ params: { market } });
}

function landingMarkup(market: Market): string {
  return renderToStaticMarkup(landingTree(market));
}

function testingMarkup(market: Market): string {
  return renderToStaticMarkup(TestingPage({ params: { market } }));
}

function partnersMarkup(market: Market): string {
  return renderToStaticMarkup(PartnersPage({ params: { market } }));
}

function medicalDescription(markup: string): string {
  for (const match of markup.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    const payload = JSON.parse(match[1]) as { '@type'?: string; description?: string };
    if (payload['@type'] === 'MedicalWebPage' && payload.description) {
      return payload.description;
    }
  }
  throw new Error('MedicalWebPage JSON-LD not found');
}

function expectAllLinksToHaveVisibleFocus(markup: string): void {
  const linkTags = markup.match(/<a\b[^>]*>/g) ?? [];
  expect(linkTags.length).toBeGreaterThan(0);
  expect(
    linkTags.filter(
      (tag) =>
        !tag.includes('focus-visible:shadow-ring-focus') &&
        !tag.includes('focus:shadow-ring-focus'),
    ),
  ).toEqual([]);
}

function visitElements(node: ReactNode, visit: (element: ReactElement) => void): void {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    visit(child);
    visitElements((child.props as { children?: ReactNode }).children, visit);
  });
}

describe('market landing page', () => {
  it('attributes the final live-demo link to the final CTA', () => {
    let finalDemoLink: ReactElement | undefined;

    visitElements(landingTree('uk'), (element) => {
      if (element.type !== TrackedLink) return;
      const props = element.props as { children?: ReactNode };
      if (React.Children.toArray(props.children).join('').includes('Explore the live demo')) {
        finalDemoLink = element;
      }
    });

    expect(finalDemoLink).toBeDefined();
    expect(finalDemoLink?.props).toMatchObject({
      href: '/demo',
      event: FUNNEL_EVENTS.DEMO_CLICKED,
      eventProperties: { placement: 'final_cta' },
    });
  });

  it('distinguishes the 60+ marker promise from the 33 searchable marker groups', () => {
    const markup = landingMarkup('uk');

    expect(testingMarkers('uk')).toHaveLength(33);
    expect(markup).toContain('60+ markers, one baseline.');
    expect(markup).toContain('33 of 33 marker groups');
    expect(markup).not.toContain('33 of 33 markers');
    expect(markup).toContain('All marker groups');
    expect(markup).not.toContain('All markers');
    expect(markup).toContain('Search marker groups');
    expect(markup).toContain('search a group, or open it');
    expect(markup).toContain('focus:ring-button-focus');

    const emptyIndexMarkup = renderToStaticMarkup(
      React.createElement(MarkerIndex, { markers: [] }),
    );
    expect(emptyIndexMarkup).toContain('No marker groups match that search.');
    expect(emptyIndexMarkup).toMatch(
      /<button[^>]*class="[^"]*focus:shadow-ring-focus[^"]*"[^>]*>\s*Clear search/,
    );
  });

  it('keeps testing and partner metadata aligned with the public offer', () => {
    const ukTestingDescription =
      'Sixty-plus markers from one venous draw, available through partner clubs and our London studio as bookings open. A core-panel home kit is available in eligible locations. Results are read in plain English inside your Morning Form record.';
    const usTestingDescription =
      'Sixty-plus markers from one venous draw, available through partner clubs as bookings open. A core-panel home kit is available in eligible states. Results are read in plain English inside your Morning Form record.';
    const partnerDescription =
      'Bring blood testing to your members with minimal operational lift. We bring the phlebotomist, the kit, the logistics and the lab — you provide a private room and a nudge to your members.';

    expect(generateTestingMetadata({ params: { market: 'uk' } })).toMatchObject({
      title: 'Blood testing at your club, our London studio or at home — Morning Form',
      description: ukTestingDescription,
    });
    expect(generateTestingMetadata({ params: { market: 'us' } })).toMatchObject({
      title: 'Blood testing at your club or at home — Morning Form',
      description: usTestingDescription,
    });
    expect(medicalDescription(testingMarkup('uk'))).toBe(ukTestingDescription);
    expect(medicalDescription(testingMarkup('us'))).toBe(usTestingDescription);

    for (const market of ['uk', 'us'] as const) {
      const metadata = generatePartnersMetadata({ params: { market } });
      expect(metadata.description).toBe(partnerDescription);
      expect(metadata.description).not.toContain('zero operational lift');
    }
  });

  it('keeps London studio promises UK-only and caveats home collection by market', () => {
    const ukMarkup = landingMarkup('uk');
    const usMarkup = landingMarkup('us');

    expect(ukMarkup).toContain('Morning Form Studios · London');
    expect(ukMarkup).toContain('At your club, at a studio, or at your door.');
    expect(ukMarkup).toContain('£299');

    expect(usMarkup).not.toMatch(/studio/i);
    expect(usMarkup).not.toContain('London');
    expect(usMarkup).toContain('At your club, or at your door where available.');
    expect(usMarkup).toContain('$299');

    for (const markup of [ukMarkup, usMarkup]) {
      expect(markup).toContain(
        'It covers a core panel rather than every marker in the full venous baseline',
      );
      expect(markup).toContain(
        'Kits cover a core panel; some markers still require a venous draw.',
      );
    }

    expect(usMarkup).toContain('Availability varies by state — shown before you order.');
    expect(ukMarkup).not.toContain('Availability varies by state');
    expect(ukMarkup).toContain('Clinician review is not automatic.');
    expect(ukMarkup).not.toContain('reviews every panel before it reaches your record');
    expect(ukMarkup).not.toMatch(/genom|genetic/i);
    expect(ukMarkup).toContain(
      'As bookings open, choose a partner-club slot or a Morning Form studio.',
    );
    expect(usMarkup).toContain('As bookings open, choose a partner-club slot.');

    for (const markup of [ukMarkup, usMarkup]) {
      expect(markup).not.toContain('Pick a slot at a partner club');
      expect(markup).not.toContain('book your first test when you are ready');
      expectAllLinksToHaveVisibleFocus(markup);
    }
  });

  it('keeps the shared testing page aligned with marker groups and home-kit scope', () => {
    const ukMarkup = testingMarkup('uk');
    const usMarkup = testingMarkup('us');

    for (const markup of [ukMarkup, usMarkup]) {
      expect(markup).toContain('organised into 33 marker groups');
      expect(markup).toContain('Search a group, or open it');
      expect(markup).not.toContain('Search a marker');
      expect(markup).toContain(
        'It covers a core panel rather than every marker in the full venous baseline',
      );
      expect(markup).toContain('The app shows the exact panel before you book.');
      expect(markup).not.toMatch(/<a[^>]+href="\/sign-in"[^>]*>\s*<button/);
      expectAllLinksToHaveVisibleFocus(markup);
    }

    expect(ukMarkup).toContain('Three ways to test');
    expect(ukMarkup).toContain('Morning Form Studios · London');
    expect(ukMarkup).toContain('Studio bookings opening soon');
    expect(ukMarkup).toContain(
      'As bookings open, choose a partner-club slot or our London studio.',
    );
    expect(ukMarkup).not.toContain('booked at a partner club or our London studio');
    expect(ukMarkup).not.toContain('Book the full venous baseline');
    expect(ukMarkup).toContain('Availability shown in the app before you order');
    expect(ukMarkup).not.toContain('Availability varies by state');

    expect(usMarkup).toContain('Two ways to test');
    expect(usMarkup).not.toMatch(/studio/i);
    expect(usMarkup).not.toContain('London');
    expect(usMarkup).toContain('Availability varies by state — shown before you order');
    expect(usMarkup).toContain('As bookings open, choose a partner-club slot.');
  });

  it('keeps the linked partner journey clinically honest and semantically valid', () => {
    for (const market of ['uk', 'us'] as const) {
      const markup = partnersMarkup(market);

      expect(markup).toContain('Clinician review is not automatic.');
      expect(markup).not.toContain('Every panel is reviewed before it reaches');
      expect(markup).toContain('A clear clinical pathway.');
      expect(markup).not.toContain('We carry the clinical load.');
      expect(markup).toContain('clear next step');
      expect(markup).not.toContain('clear referral');
      expect(markup).not.toMatch(/<a[^>]+>\s*<button/);
      expect(markup).toContain('minimal operational lift');
      expectAllLinksToHaveVisibleFocus(markup);
    }
  });
});
