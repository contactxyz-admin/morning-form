import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { FaqBlock } from '@/components/marketing/faq-block';
import { MarketingHeader, NAV_LINK_CLASS } from '@/components/marketing/marketing-header';
import { MarkerOrbit } from '@/components/marketing/marker-orbit';
import { MarkerIndex } from '@/components/marketing/marker-index';
import { RecordPreview } from '@/components/marketing/record-preview';
import { FaqPage } from '@/components/structured-data/faq-page';
import { MedicalWebPage } from '@/components/structured-data/medical-webpage';
import { isMarket } from '@/lib/marketing/market';
import { MARKETS, type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import { TESTING_FAQ } from '../../../../content/marketing/testing-faq';
import { testingMarkers } from '../../../../content/marketing/testing-markers';

// Static copy + fixture-free preview components only — pin static
// generation explicitly, same rationale as the market homepage.
export const dynamic = 'force-static';

interface TestingPageProps {
  params: { market: string };
}

const MONO_EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary';

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none translate-y-0.5 text-brand-sage-700">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
    </svg>
  );
}

function HomePinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z" />
      <path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2" />
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function TrackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

const HOW_IT_WORKS: ReadonlyArray<{ n: string; title: string; body: string; icon: JSX.Element }> = [
  {
    n: 'Step 01',
    title: 'Book',
    body: 'Pick a slot at a partner club, or order a kit to your door. A few taps, in the app.',
    icon: <CalendarIcon />,
  },
  {
    n: 'Step 02',
    title: 'Draw',
    body: 'A few minutes with the phlebotomist — or the kit and the post box. Your sample goes to an accredited reference lab.',
    icon: <DropletIcon />,
  },
  {
    n: 'Step 03',
    title: 'Understand',
    body: 'Every marker arrives in plain English: what it is, where it sits, what’s worth watching. No jargon, no panic.',
    icon: <LayersIcon />,
  },
  {
    n: 'Step 04',
    title: 'Track',
    body: 'Retest on a cadence that fits, and watch each marker move against your training, sleep and recovery data.',
    icon: <TrackIcon />,
  },
];

// Page identity — shared by generateMetadata (the <title>/OG tags) and the
// MedicalWebPage JSON-LD so the SEO name/description have a single source.
const PAGE_TITLE = 'Blood testing at your club or at home — Morning Form';
const PAGE_NAME = 'Blood testing at your club or at home';
const PAGE_DESCRIPTION =
  'Sixty-plus markers from one venous draw — booked in seconds at a partner club, or collected at home. Read in plain English inside your Morning Form record.';

export function generateStaticParams(): Array<{ market: string }> {
  return MARKETS.map((market) => ({ market }));
}

export function generateMetadata({ params }: TestingPageProps): Metadata {
  if (!isMarket(params.market)) return {};
  const market = params.market;

  const title = PAGE_TITLE;
  const description = PAGE_DESCRIPTION;

  return {
    title,
    description,
    alternates: {
      canonical: `/${market}/testing`,
      languages: {
        'en-GB': '/uk/testing',
        'en-US': '/us/testing',
        'x-default': `/${market}/testing`,
      },
    },
    openGraph: {
      title,
      description,
      locale: market === 'uk' ? 'en_GB' : 'en_US',
      type: 'website',
    },
  };
}

export default function TestingPage({ params }: TestingPageProps) {
  if (!isMarket(params.market)) notFound();
  const market: Market = params.market;

  return (
    <div className="min-h-screen bg-bg">
      <TrackMount event={FUNNEL_EVENTS.TESTING_VIEWED} properties={{ market }} />
      <MedicalWebPage
        url={`/${market}/testing`}
        name={PAGE_NAME}
        description={PAGE_DESCRIPTION}
        market={market}
        lastReviewed={TESTING_FAQ.lastReviewedAt}
        reviewerOrgName="Morning Form"
      />
      <FaqPage entries={TESTING_FAQ.entries} />

      {/* Header — brand lockup + mono-uppercase tabs, matching the
          market homepage. */}
      <MarketingHeader
        homeHref={`/${market}`}
        navLinks={[
          { label: "What's measured", href: '#index' },
          { label: 'Two ways', href: '#ways' },
          { label: 'How it works', href: '#how' },
          { label: 'The record', href: '#record' },
          { label: 'FAQ', href: '#faq' },
          { label: 'Sign in', href: '/sign-in' },
        ]}
      />

      <main>
        {/* Hero — copy left, the panel itself as a product shot right. */}
        <section className="px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-20 sm:pb-28 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
            <div className="stagger">
              <p className={MONO_EYEBROW}>Testing · {market.toUpperCase()}</p>

              <h1 className="mt-8 font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98]">
                One draw. Sixty-plus markers. A baseline you can{' '}
                <span className="text-brand-blue-700">train against</span>.
              </h1>

              <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
                A single venous panel across eight body systems — from metabolic and
                hormonal to recovery, inflammation and organ health — read in plain English
                against the wearable data you already track. Book a draw at a partner club
                in seconds, or test from home with a posted kit.
              </p>

              <div className="mt-10 flex items-center gap-6 flex-wrap">
                <Link href="/sign-in">
                  <Button size="lg">Get started</Button>
                </Link>
                <Link
                  href="#index"
                  className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
                >
                  See what&rsquo;s measured ↓
                </Link>
              </div>
              <p className="mt-5 text-caption text-text-tertiary">
                Draws at partner clubs · at-home kits · every result lands in your record
              </p>
            </div>

            <MarkerOrbit className="rise" />
          </div>
        </section>

        {/* What's measured — a searchable, filterable index of every
            marker in the panel, not just a flat list of names. */}
        <section id="index" className="scroll-mt-24 px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-5`}>What&rsquo;s measured</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            Sixty-plus markers, one baseline.
          </h2>
          <p className="mt-8 text-body-lg text-text-secondary max-w-2xl leading-relaxed">
            One venous draw across eight body systems, grouped into the six panels below —
            comprehensive by design, read through an energy and recovery lens. Search a
            marker, or open one to see what it tells you.
          </p>

          <div className="mt-12">
            <MarkerIndex markers={testingMarkers(market)} />
          </div>

          <p className="mt-8 text-caption text-text-tertiary max-w-2xl">
            Illustrative baseline panel — finalised with our medical director and
            processed by an accredited reference lab. Descriptive, not diagnostic.
          </p>
        </section>

        {/* Two ways to test — the core of the offer: in person where you
            train, or at home. */}
        <section id="ways" className="scroll-mt-24 px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-5`}>Two ways to test</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            At your club, or at your door.
          </h2>

          <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-6xl">
            <div className="rounded-card bg-surface shadow-hairline p-8 sm:p-10 transition-shadow duration-300 ease-spring hover:shadow-card-hover">
              <div className="flex items-center justify-between">
                <p className={MONO_EYEBROW}>01 · Partner clubs</p>
                <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-brand-blue-100 text-brand-blue-900">
                  <CalendarCheckIcon />
                </span>
              </div>
              <h3 className="mt-5 font-display font-normal text-display-sm text-text-primary -tracking-[0.03em]">
                A draw day where you already train.
              </h3>
              <p className="mt-4 text-body text-text-secondary leading-relaxed">
                On set days, a registered phlebotomist runs a private room at a partner
                club. You book a slot in the app, the draw takes a few minutes, and
                you&rsquo;re back on the floor before your session starts.
              </p>

              <p className={`mt-6 mb-2.5 ${MONO_EYEBROW}`}>Morning slots</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-chip border border-border bg-surface px-3.5 py-1.5 text-caption font-mono text-text-secondary">07:20</span>
                <span className="rounded-chip border border-border bg-surface px-3.5 py-1.5 text-caption font-mono text-text-secondary">07:40</span>
                <span className="rounded-chip bg-text-primary px-3.5 py-1.5 text-caption font-mono text-bg">08:00 · booked</span>
                <span className="rounded-chip border border-border bg-surface px-3.5 py-1.5 text-caption font-mono text-text-secondary">08:20</span>
              </div>

              <ul className="mt-6 space-y-2.5">
                {[
                  'Booked in the app, in seconds',
                  'A few minutes — in-club, private',
                  'Run by a registered clinical partner',
                  'First clubs onboarding now',
                ].map((b) => (
                  <li key={b} className="flex items-baseline gap-2.5 text-body text-text-secondary leading-relaxed">
                    <CheckIcon />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card bg-surface shadow-hairline p-8 sm:p-10 transition-shadow duration-300 ease-spring hover:shadow-card-hover">
              <div className="flex items-center justify-between">
                <p className={MONO_EYEBROW}>02 · At home</p>
                <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-brand-sage-50 text-brand-sage-900">
                  <HomePinIcon />
                </span>
              </div>
              <h3 className="mt-5 font-display font-normal text-display-sm text-text-primary -tracking-[0.03em]">
                A kit on your kitchen table.
              </h3>
              <p className="mt-4 text-body text-text-secondary leading-relaxed">
                No partner club nearby, or prefer to test privately? A collection kit
                comes to your door with clear instructions and a prepaid return to the
                same accredited lab. Some markers need a venous draw — the app is clear
                about which the kit covers and which are worth a visit.
              </p>

              <p className={`mt-6 mb-2.5 ${MONO_EYEBROW}`}>Kit journey</p>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-secondary">
                <span className="rounded-chip bg-brand-sage-50 px-3 py-1.5 text-brand-sage-900">Posted to you</span>
                <span className="text-brand-grey-200">→</span>
                <span className="rounded-chip bg-brand-sage-50 px-3 py-1.5 text-brand-sage-900">Prepaid return</span>
                <span className="text-brand-grey-200">→</span>
                <span className="rounded-chip bg-brand-sage-50 px-3 py-1.5 text-brand-sage-900">Same lab</span>
              </div>

              <ul className="mt-6 space-y-2.5">
                {[
                  'Same lab standards, same plain-English read',
                  market === 'us'
                    ? 'Availability varies by state — shown before you order'
                    : 'Availability shown in the app before you order',
                  'Results private to your record by default',
                ].map((b) => (
                  <li key={b} className="flex items-baseline gap-2.5 text-body text-text-secondary leading-relaxed">
                    <CheckIcon />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-10 text-caption text-text-tertiary max-w-2xl">
            Either way — the same panel standards, the same accredited lab, the same
            record.
          </p>
        </section>

        {/* How it works — book, draw, understand, track. */}
        <section id="how" className="scroll-mt-24 px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-12`}>How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-14 sm:gap-12">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.n}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-blue-100 text-brand-blue-900">
                    {step.icon}
                  </span>
                  <span className={MONO_EYEBROW}>{step.n}</span>
                </div>
                <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-body text-text-secondary leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Where testing fits — the panel is one layer of the record. */}
        <section
          id="record"
          className="scroll-mt-24"
          style={{ background: 'linear-gradient(135deg,#DFE6C1 0%,#C3CAA8 35%,#B8C9E2 75%,#D0E5F4 100%)' }}
        >
          <div className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
              <div>
                <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-bluegrey">Testing × the record</p>
                <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
                  A panel is a snapshot. The record is the film.
                </h2>
                <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
                  Wearables show the load you carry day to day; bloods show what it&rsquo;s
                  doing underneath. Morning Form reads them together — a draw lands next to
                  your sleep, training and heart-rate variability, so a shift in iron or
                  thyroid shows up in context, panel over panel.
                </p>
                <p className="mt-5 text-body-lg text-text-secondary max-w-xl leading-relaxed">
                  And when nothing changed, the record says nothing. Your attention is
                  treated as the scarcest marker of all.
                </p>
              </div>
              <RecordPreview />
            </div>
          </div>
        </section>

        {/* FAQ — the objections a testing product must answer before the ask. */}
        <FaqBlock id="faq" entries={TESTING_FAQ.entries} />

        {/* Final CTA — on the hero's gradient wash, matching the homepage. */}
        <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 max-w-[1400px] mx-auto">
          <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,#F9E8FB_0%,#E3F3FF_45%,#DFE6C1_100%)] px-6 sm:px-16 py-16 sm:py-24 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_70%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-xl font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
                Start with a baseline.
              </h2>
              <p className="mt-6 mx-auto max-w-xl text-body-lg text-text-secondary leading-relaxed">
                Join Morning Form, connect what you already wear, and book your first draw
                when you&rsquo;re ready — at a partner club or from your kitchen table.
              </p>
              <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
                <Link href="/sign-in">
                  <Button size="lg">Get started</Button>
                </Link>
                <TrackedLink
                  href="/demo"
                  event={FUNNEL_EVENTS.DEMO_CLICKED}
                  eventProperties={{ placement: 'final_cta' }}
                  className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
                >
                  Explore the live demo →
                </TrackedLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer — brand lockup, mono-uppercase nav. */}
      <footer className="px-6 sm:px-10 lg:px-16 py-16 border-t border-border max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
          <Link
            href={`/${market}`}
            aria-label="Morning Form — home"
            className="text-text-primary"
          >
            <LogoLockup imageClassName="w-[188px]" textClassName="text-heading" />
          </Link>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap gap-7">
              <Link href={`/${market}/partners`} className={NAV_LINK_CLASS}>Partner with us</Link>
              <Link href="/privacy" className={NAV_LINK_CLASS}>Privacy</Link>
              <Link href="/safety" className={NAV_LINK_CLASS}>Safety &amp; clinical</Link>
              <Link href="/contact" className={NAV_LINK_CLASS}>Contact</Link>
            </div>
            <p className={MONO_EYEBROW}>© 2026 Morning Form</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
