import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { FaqBlock } from '@/components/marketing/faq-block';
import { RecordPreview } from '@/components/marketing/record-preview';
import { TestingVisual } from '@/components/marketing/testing-visual';
import { FaqPage } from '@/components/structured-data/faq-page';
import { MedicalWebPage } from '@/components/structured-data/medical-webpage';
import { isMarket } from '@/lib/marketing/market';
import { MARKET_CLINICIAN, MARKETS, type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import { TESTING_FAQ } from '../../../../content/marketing/testing-faq';

// Static copy + fixture-free preview components only — pin static
// generation explicitly, same rationale as the market homepage.
export const dynamic = 'force-static';

interface TestingPageProps {
  params: { market: string };
}

const NAV_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring';

const MONO_EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary';

/**
 * The baseline panel, as proposed in the gym-partners deck: one venous
 * draw across eight systems, read through an energy and recovery lens.
 * Marker lists are bare marker names (measurements, never products) —
 * the static-copy compliance gate scans this file.
 */
function panelGroups(market: Market): ReadonlyArray<{ title: string; markers: string }> {
  const uk = market === 'uk';
  return [
    {
      title: 'Metabolic & heart',
      markers: 'HbA1c · Glucose · Insulin (HOMA-IR) · Cholesterol, LDL, HDL, triglycerides · ApoB · Lp(a)',
    },
    {
      title: 'Hormones & thyroid',
      markers: `Total & free testosterone · SHBG · LH, FSH · ${uk ? 'Oestradiol' : 'Estradiol'} · DHEA-S · Cortisol · TSH, free T4, free T3 · TPO antibodies`,
    },
    {
      title: 'Recovery, blood & iron',
      markers: `${uk ? 'Full' : 'Complete'} blood count · Ferritin · Iron, TIBC · Transferrin saturation`,
    },
    {
      title: 'Inflammation & immune',
      markers: 'hs-CRP · ESR · Homocysteine · Uric acid · Neutrophil–lymphocyte ratio',
    },
    {
      title: 'Nutrients & vitamins',
      markers: 'Vitamin D · Vitamin B12 · Folate · Magnesium · Zinc · Omega-3 index',
    },
    {
      title: 'Liver, kidney & organ',
      markers: 'ALT, AST, GGT, ALP · Bilirubin, albumin · Creatinine, eGFR, urea · Electrolytes',
    },
  ];
}

const HOW_IT_WORKS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  {
    n: 'Step 01',
    title: 'Book',
    body: 'Pick a slot at a partner club, or order a kit to your door. A few taps, in the app.',
  },
  {
    n: 'Step 02',
    title: 'Draw',
    body: 'A few minutes with the phlebotomist — or the kit and the post box. Your sample goes to an accredited reference lab.',
  },
  {
    n: 'Step 03',
    title: 'Understand',
    body: 'Every marker arrives in plain English: what it is, where it sits, what’s worth watching. No jargon, no panic.',
  },
  {
    n: 'Step 04',
    title: 'Track',
    body: 'Retest on a cadence that fits, and watch each marker move against your training, sleep and recovery data.',
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
  const market = params.market;
  const clinician = MARKET_CLINICIAN[market];

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
      <header className="px-6 sm:px-10 lg:px-16 pt-7 pb-4 flex items-center justify-between max-w-[1400px] mx-auto">
        <Link
          href={`/${market}`}
          aria-label="Morning Form — home"
          className="text-text-primary"
        >
          <LogoLockup />
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          <Link href="#ways" className={NAV_LINK_CLASS}>Two ways to test</Link>
          <Link href="#panel" className={NAV_LINK_CLASS}>What&rsquo;s measured</Link>
          <Link href="#how" className={NAV_LINK_CLASS}>How it works</Link>
          <Link href="/demo" className={NAV_LINK_CLASS}>Live demo</Link>
          <Link href="/sign-in" className={NAV_LINK_CLASS}>Sign in</Link>
        </nav>
        <Link href="/sign-in" aria-label="Sign in" className={`${NAV_LINK_CLASS} sm:hidden`}>
          Sign in
        </Link>
      </header>

      <main>
        {/* Hero — copy left, the two testing routes as a product shot right. */}
        <section className="px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-20 sm:pb-28 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
            <div className="stagger">
              <p className={MONO_EYEBROW}>Testing · {market.toUpperCase()}</p>

              <h1 className="mt-8 font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98]">
                <span className="italic">One</span> draw. Sixty-plus markers. A baseline you
                can train against.
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
                  href="#panel"
                  className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
                >
                  See what&rsquo;s measured ↓
                </Link>
              </div>
              <p className="mt-5 text-caption text-text-tertiary">
                Draws at partner clubs · at-home kits · every result lands in your record
              </p>
            </div>

            <TestingVisual className="rise" />
          </div>
        </section>

        {/* Two ways to test — the core of the offer: in person where you
            train, or at home. */}
        <section id="ways" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-5`}>Two ways to test</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            At your club, or at your door.
          </h2>

          <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-6xl">
            <div className="rounded-card border border-border bg-surface p-8 sm:p-10">
              <p className={MONO_EYEBROW}>01 · Partner clubs</p>
              <h3 className="mt-5 font-display font-normal text-display-sm text-text-primary -tracking-[0.03em]">
                A draw day where you already train.
              </h3>
              <p className="mt-4 text-body text-text-secondary leading-relaxed">
                On set days, a registered phlebotomist runs a private room at a partner
                club. You book a slot in the app, the draw takes a few minutes, and
                you&rsquo;re back on the floor before your session starts.
              </p>
              <ul className="mt-6 space-y-2 text-body text-text-secondary">
                {[
                  'Booked in the app, in seconds',
                  'A few minutes — in-club, private',
                  'Run by a registered clinical partner',
                  'First clubs onboarding now',
                ].map((b) => (
                  <li
                    key={b}
                    className="leading-relaxed pl-5 relative before:content-['—'] before:absolute before:left-0 before:text-text-tertiary"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card border border-border bg-surface p-8 sm:p-10">
              <p className={MONO_EYEBROW}>02 · At home</p>
              <h3 className="mt-5 font-display font-normal text-display-sm text-text-primary -tracking-[0.03em]">
                A kit on your kitchen table.
              </h3>
              <p className="mt-4 text-body text-text-secondary leading-relaxed">
                No partner club nearby, or prefer to test privately? A collection kit
                comes to your door with clear instructions and a prepaid return to the
                same accredited lab. Some markers need a venous draw — the app is clear
                about which the kit covers and which are worth a visit.
              </p>
              <ul className="mt-6 space-y-2 text-body text-text-secondary">
                {[
                  'Posted to you, returned by prepaid post',
                  'Same lab standards, same plain-English read',
                  market === 'us'
                    ? 'Availability varies by state — shown before you order'
                    : 'Availability shown in the app before you order',
                ].map((b) => (
                  <li
                    key={b}
                    className="leading-relaxed pl-5 relative before:content-['—'] before:absolute before:left-0 before:text-text-tertiary"
                  >
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

        {/* The panel — what one draw measures. Marker lists mirror the
            baseline panel proposed with our medical director. */}
        <section id="panel" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-5`}>What&rsquo;s measured</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            Sixty-plus markers, one baseline.
          </h2>
          <p className="mt-8 text-body-lg text-text-secondary max-w-2xl leading-relaxed">
            One venous draw across eight body systems, grouped into the six panels below —
            from metabolic and hormonal to recovery, inflammation and organ health.
            Comprehensive by design, read through an energy and recovery lens.
          </p>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {panelGroups(market).map((group) => (
              <div key={group.title} className="rounded-card border border-border bg-surface p-6 sm:p-7">
                <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {group.title}
                </h3>
                <p className="mt-3 text-caption text-text-secondary leading-relaxed">{group.markers}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-caption text-text-tertiary max-w-2xl">
            Illustrative baseline panel — finalised with our medical director and
            processed by an accredited reference lab. Descriptive, not diagnostic.
          </p>
        </section>

        {/* How it works — book, draw, understand, track. */}
        <section id="how" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-12`}>How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-14 sm:gap-12">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.n}>
                <span className={MONO_EYEBROW}>{step.n}</span>
                <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-body text-text-secondary leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Where testing fits — the panel is one layer of the record. */}
        <section className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
            <div>
              <p className={`${MONO_EYEBROW} mb-5`}>Testing × the record</p>
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
        </section>

        {/* The clinical layer — inverted band, the trust section. */}
        <section className="bg-text-primary">
          <div className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper mb-5">
              The clinical layer
            </p>
            <h2 className="font-display font-light text-display sm:text-display-xl text-bg max-w-3xl -tracking-[0.04em] leading-[1.02]">
              We carry the clinical load.
            </h2>

            <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-14 max-w-5xl">
              {[
                {
                  n: '01',
                  title: 'Regulated collection',
                  body: 'Draws run under a registered clinical partner — trained phlebotomists, proper kit, clinical-waste handling, indemnity in place.',
                },
                {
                  n: '02',
                  title: 'Reviewed results',
                  body: 'Every panel is reviewed before it reaches your record. Findings that need attention are flagged clearly, with a referral.',
                },
                {
                  n: '03',
                  title: 'Consent & identity',
                  body: 'E-consent and ID checks before any draw. Your results stay yours — shared only if you choose to share them.',
                },
                {
                  n: '04',
                  title: 'Descriptive, not diagnostic',
                  body: 'Morning Form explains and flags; it never diagnoses. When a marker needs a clinician, you get a clear referral — not an upsell.',
                },
              ].map((r) => (
                <div key={r.n}>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">
                    {r.n}
                  </span>
                  <h3 className="mt-4 font-display font-normal text-heading text-bg -tracking-[0.02em]">
                    {r.title}
                  </h3>
                  <p className="mt-3 text-body text-text-inverse-muted leading-relaxed">{r.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-16 text-body text-text-inverse-muted max-w-2xl leading-relaxed">
              If you have symptoms that worry you now, speak to your {clinician.singular}{' '}
              first — a baseline panel is not urgent care.
            </p>
          </div>
        </section>

        {/* For clubs — the partnership funnel, one quiet row. */}
        <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 border-t border-border max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-20 items-center">
            <div>
              <p className={`${MONO_EYEBROW} mb-5`}>For clubs &amp; studios</p>
              <h2 className="font-display font-light text-display text-text-primary -tracking-[0.035em] leading-[1.06]">
                Run draw days in your club.
              </h2>
              <p className="mt-6 text-body-lg text-text-secondary max-w-xl leading-relaxed">
                We bring the phlebotomist, the kit, the logistics and the lab; you provide
                a private room and a nudge to your members. A member benefit no other club
                offers — with zero operational lift.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <Link
                href="/contact"
                className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
              >
                Partner with us →
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ — the objections a testing product must answer before the ask. */}
        <FaqBlock entries={TESTING_FAQ.entries} />

        {/* Final CTA. */}
        <section className="px-6 sm:px-10 lg:px-16 py-32 sm:py-44 border-t border-border max-w-[1400px] mx-auto">
          <h2 className="font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary max-w-4xl -tracking-[0.04em] leading-[0.98]">
            Start with a baseline.
          </h2>
          <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
            Join Morning Form, connect what you already wear, and book your first draw
            when you&rsquo;re ready — at a partner club or from your kitchen table.
          </p>
          <div className="mt-14 flex items-center gap-6 flex-wrap">
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
