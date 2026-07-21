import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { MarkerIndex } from '@/components/marketing/marker-index';
import { MarkerOrbit } from '@/components/marketing/marker-orbit';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { RecordPreview } from '@/components/marketing/record-preview';
import { FaqPage } from '@/components/structured-data/faq-page';
import { MedicalWebPage } from '@/components/structured-data/medical-webpage';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import { TrackMount } from '@/lib/funnel/track-mount';
import {
  BASELINE_TEST_PRICE,
  MARKET_CLINICIAN,
  MARKETS,
  type Market,
} from '@/lib/marketing/constants';
import { isMarket } from '@/lib/marketing/market';
import { TESTING_FAQ } from '../../../content/marketing/testing-faq';
import { testingMarkers } from '../../../content/marketing/testing-markers';

export const dynamic = 'force-static';

interface LandingPageProps {
  params: { market: string };
}

const PAGE_TITLE = 'Morning Form — Your health baseline';
const PAGE_NAME = 'Your health baseline';
const PAGE_DESCRIPTION =
  'One venous panel across eight body systems, explained in plain English alongside the wearable data you already track.';

const NAV_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary transition-colors duration-300 hover:text-text-primary focus-visible:rounded-sm focus-visible:shadow-ring-focus';

const PRIMARY_CTA_CLASS =
  'inline-flex min-h-12 items-center justify-center rounded-button bg-brand-blue-500 px-7 py-3.5 text-body font-semibold text-text-primary transition-[background-color,color,transform,box-shadow] duration-300 ease-spring hover:-translate-y-0.5 hover:bg-brand-blue-700 hover:text-bg hover:shadow-button-primary-hover focus-visible:shadow-ring-focus';

const EYEBROW_CLASS =
  'font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary';

const SECTION_CLASS =
  'mx-auto max-w-[1320px] px-5 py-20 sm:px-10 sm:py-28 lg:px-12';

const HOW_IT_WORKS = [
  {
    step: 'Step 01',
    title: 'Book',
    body: 'Pick a slot at a partner club, a Morning Form studio, or order a kit to your door. A few taps, in the app.',
    icon: 'calendar',
  },
  {
    step: 'Step 02',
    title: 'Draw',
    body: 'A few minutes with the phlebotomist — or the kit and the post box. Your sample goes to an accredited reference lab.',
    icon: 'drop',
  },
  {
    step: 'Step 03',
    title: 'Understand',
    body: 'Every marker arrives in plain English: what it is, where it sits, and what is worth watching. No jargon, no panic.',
    icon: 'book',
  },
  {
    step: 'Step 04',
    title: 'Track',
    body: 'Retest on a cadence that fits, and watch each marker move against your training, sleep and recovery data.',
    icon: 'trend',
  },
] as const;

export function generateStaticParams(): Array<{ market: string }> {
  return MARKETS.map((market) => ({ market }));
}

export function generateMetadata({ params }: LandingPageProps): Metadata {
  if (!isMarket(params.market)) return {};
  const market = params.market;

  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: {
      canonical: `/${market}`,
      languages: {
        'en-GB': '/uk',
        'en-US': '/us',
        'x-default': `/${market}`,
      },
    },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      locale: market === 'uk' ? 'en_GB' : 'en_US',
      type: 'website',
    },
  };
}

function StepIcon({ name }: { name: (typeof HOW_IT_WORKS)[number]['icon'] }) {
  if (name === 'calendar') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 2v4M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  if (name === 'drop') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z" />
      </svg>
    );
  }

  if (name === 'book') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export default function LandingPage({ params }: LandingPageProps) {
  if (!isMarket(params.market)) notFound();
  const market: Market = params.market;
  const clinician = MARKET_CLINICIAN[market];
  const price = BASELINE_TEST_PRICE[market].display;

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <TrackMount
        event={FUNNEL_EVENTS.LANDING_VIEWED}
        properties={{ market }}
      />
      <MedicalWebPage
        url={`/${market}`}
        name={PAGE_NAME}
        description={PAGE_DESCRIPTION}
        market={market}
        lastReviewed={TESTING_FAQ.lastReviewedAt}
        reviewerOrgName="Morning Form"
      />
      <FaqPage entries={TESTING_FAQ.entries} />

      <a
        href="#top"
        className="fixed left-3 top-3 z-50 -translate-y-[180%] rounded-button bg-text-primary px-4 py-2 text-caption text-bg transition-transform focus:translate-y-0 focus:shadow-ring-focus"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 overflow-hidden border-b border-border bg-[linear-gradient(0deg,#F7F2EC_0%,#EBE9F0_55%,#DFE7F1_100%)]">
        <div
          className="grain pointer-events-none absolute inset-0 opacity-30"
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-5 py-3.5 sm:px-10 lg:px-12">
          <Link
            href={`/${market}`}
            aria-label="Morning Form — home"
            className="text-text-primary focus-visible:rounded-sm focus-visible:shadow-ring-focus"
          >
            <LogoLockup />
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-5 lg:flex xl:gap-7"
          >
            <a href="#index" className={NAV_LINK_CLASS}>
              What&rsquo;s measured
            </a>
            <a href="#ways" className={NAV_LINK_CLASS}>
              Book
            </a>
            <a href="#how" className={NAV_LINK_CLASS}>
              How it works
            </a>
            <a href="#record" className={NAV_LINK_CLASS}>
              The record
            </a>
            <a href="#faq" className={NAV_LINK_CLASS}>
              FAQ
            </a>
            <a
              href="#ways"
              className="inline-flex min-h-9 items-center rounded-button bg-brand-blue-500 px-4 text-caption font-semibold text-text-primary transition-colors hover:bg-brand-blue-700 hover:text-bg focus-visible:shadow-ring-focus"
            >
              Explore testing
            </a>
          </nav>
          <Link href="/sign-in" className={`${NAV_LINK_CLASS} lg:hidden`}>
            Sign in
          </Link>
        </div>
      </header>

      <main id="top">
        <section className="relative min-h-[min(96vh,1040px)] overflow-hidden">
          <Image
            src="/landing/hero.jpg"
            alt="Practitioners preparing for a morning training session"
            fill
            priority
            quality={90}
            sizes="100vw"
            className="object-cover object-[58%_center]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#F7F7F7_0%,#F7F7F7_9%,rgba(247,247,247,0.94)_27%,rgba(247,247,247,0.52)_47%,rgba(247,247,247,0.10)_66%,rgba(247,247,247,0.30)_100%)]" />
          <div className="relative z-10 mx-auto flex min-h-[min(96vh,1040px)] max-w-[1320px] flex-col justify-end px-5 pb-10 pt-[clamp(7.5rem,18vh,13.75rem)] sm:px-10 lg:px-12">
            <h1 className="max-w-[15em] text-balance font-display text-[clamp(2.45rem,6vw,5rem)] font-light leading-[1.02] tracking-[-0.035em]">
              Your first form shapes every form after it.
            </h1>
            <p className="mt-6 max-w-[34em] text-pretty text-[clamp(0.98rem,1.4vw,1.125rem)] leading-relaxed text-text-secondary">
              A single venous panel across eight body systems — metabolic,
              hormonal, recovery, inflammation and organ health — read in plain
              English against the wearable data you already track.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a href="#ways" className={PRIMARY_CTA_CLASS}>
                Choose how to test · {price}
              </a>
              <a
                href="#index"
                className="inline-flex items-center gap-2 text-body text-text-secondary transition-colors hover:text-text-primary focus-visible:rounded-sm focus-visible:shadow-ring-focus"
              >
                See what&rsquo;s included <ArrowDownIcon />
              </a>
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary sm:text-[11px]">
              Venous blood draw · foundational genomics · clinical review
              pathway
            </p>
          </div>
        </section>

        <div className="h-28 bg-bg sm:h-44 lg:h-56" aria-hidden="true" />

        <section id="index" className={`${SECTION_CLASS} scroll-mt-24 pt-4`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className={EYEBROW_CLASS}>What&rsquo;s measured</p>
              <h2 className="mt-5 max-w-[16em] text-balance font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.05] tracking-[-0.03em]">
                60+ markers, one baseline.
              </h2>
              <p className="mt-6 max-w-[38em] text-pretty text-body-lg leading-relaxed text-text-secondary">
                One venous draw across eight body systems, grouped into the
                panels below. Search a marker, or open one to see what it tells
                you.
              </p>
            </div>
            <MarkerOrbit className="mx-auto w-full max-w-[620px]" />
          </div>

          <div className="mt-12">
            <MarkerIndex markers={testingMarkers(market)} />
          </div>
          <p className="mt-5 max-w-[48em] text-caption leading-relaxed text-text-tertiary">
            Illustrative baseline — finalised with our medical director and
            processed by accredited reference labs. Descriptive, not diagnostic;
            genomics is not a clinical genetic test.
          </p>
        </section>

        <section
          id="ways"
          className={`${SECTION_CLASS} scroll-mt-24 border-t border-border`}
        >
          <p className={EYEBROW_CLASS}>Book your test</p>
          <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.05] tracking-[-0.03em]">
            At your club, at a studio, or at your door.
          </h2>

          <div className="mt-12 grid gap-5 lg:grid-cols-2 lg:gap-7">
            <article className="overflow-hidden rounded-[28px] bg-surface shadow-hairline transition-shadow duration-300 hover:shadow-card-hover">
              <div className="relative aspect-video">
                <Image
                  src="/landing/booking-club.jpg"
                  alt="A calm, private club draw room"
                  fill
                  sizes="(min-width:1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6 sm:p-8">
                <p className={EYEBROW_CLASS}>01 · Partner clubs</p>
                <h3 className="mt-4 font-display text-[clamp(1.4rem,2.4vw,1.8rem)] font-normal leading-tight tracking-[-0.02em]">
                  A draw day where you already train.
                </h3>
                <p className="mt-4 max-w-[32em] text-body leading-relaxed text-text-secondary">
                  A registered phlebotomist, a private room, a few unhurried
                  minutes — booked in the app before your session.
                </p>
                <p className="mt-6 inline-flex rounded-button bg-surface-sunken px-4 py-2 text-caption font-semibold text-text-secondary">
                  Club bookings opening soon
                </p>
                <p className="mt-6 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
                  Private room · registered clinical partner · minutes
                </p>
              </div>
            </article>

            <article className="overflow-hidden rounded-[28px] bg-surface shadow-hairline transition-shadow duration-300 hover:shadow-card-hover">
              <div className="relative aspect-video">
                <Image
                  src="/landing/booking-home.jpg"
                  alt="A Morning Form home-testing kit on a kitchen table"
                  fill
                  sizes="(min-width:1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6 sm:p-8">
                <p className={EYEBROW_CLASS}>02 · At home</p>
                <h3 className="mt-4 font-display text-[clamp(1.4rem,2.4vw,1.8rem)] font-normal leading-tight tracking-[-0.02em]">
                  A kit on your kitchen table.
                </h3>
                <p className="mt-4 max-w-[32em] text-body leading-relaxed text-text-secondary">
                  A considered collection kit, with a prepaid return to the same
                  accredited lab. Test privately, on your own morning.
                </p>
                <p className="mt-6 inline-flex rounded-button bg-surface-sunken px-4 py-2 text-caption font-semibold text-text-secondary">
                  Home-kit bookings opening soon
                </p>
                <p className="mt-6 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
                  Posted to you · prepaid return · same accredited lab
                </p>
              </div>
            </article>
          </div>

          <figure className="relative mt-5 min-h-[510px] overflow-hidden rounded-[28px] sm:min-h-0 sm:aspect-[21/9] lg:mt-7">
            <Image
              src="/landing/booking-studio.webp"
              alt="A warm, design-led Morning Form studio"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(22,22,22,0.72)_0%,rgba(22,22,22,0.10)_58%)]" />
            <figcaption className="absolute inset-x-0 bottom-0 p-6 text-bg sm:p-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bg/80 sm:text-[11px]">
                03 · Morning Form Studios · London
              </p>
              <h3 className="mt-3 max-w-[20em] text-balance font-display text-[clamp(1.4rem,2.4vw,1.8rem)] font-normal leading-tight tracking-[-0.02em]">
                Or book a session at a studio of our own.
              </h3>
              <p className="mt-3 max-w-[34em] text-body leading-relaxed text-bg/90">
                Our own design-led space — an unhurried draw, results guidance
                on-site, and somewhere that feels nothing like a clinic.
              </p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-bg/70">
                Whichever you choose — the same standards, the same lab, the
                same record.
              </p>
              <p className="mt-5 inline-flex rounded-button bg-bg/90 px-4 py-2 text-caption font-semibold text-text-secondary backdrop-blur-sm">
                Studio bookings opening soon
              </p>
            </figcaption>
          </figure>
        </section>

        <section
          id="how"
          className={`${SECTION_CLASS} scroll-mt-24 border-t border-border`}
        >
          <p className={`${EYEBROW_CLASS} mb-10`}>How it works</p>
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-9">
            {HOW_IT_WORKS.map((step) => (
              <article key={step.step}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-blue-100 text-brand-blue-900">
                    <StepIcon name={step.icon} />
                  </span>
                  <span className={EYEBROW_CLASS}>{step.step}</span>
                </div>
                <h3 className="mt-4 font-display text-heading font-normal tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-body leading-relaxed text-text-secondary">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-surface">
          <div
            className={`${SECTION_CLASS} grid items-center gap-10 lg:grid-cols-2 lg:gap-16`}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-card shadow-card-hover">
              <Image
                src="/landing/training-editorial.jpg"
                alt="A practitioner training with resistance bands"
                fill
                sizes="(min-width:1024px) 50vw, 100vw"
                className="object-cover object-[50%_18%]"
              />
            </div>
            <div>
              <p className={`${EYEBROW_CLASS} text-brand-blue-700`}>
                Dimension III · the human
              </p>
              <h2 className="mt-5 text-balance font-display text-[clamp(1.85rem,3.4vw,2.75rem)] font-light leading-[1.08] tracking-[-0.03em]">
                Before performance, there is preparation.
              </h2>
              <p className="mt-5 max-w-[30em] text-pretty text-body-lg leading-relaxed text-text-secondary">
                We build the record for people already paying attention to their
                body — the moments of readiness before the work begins, not the
                finish line.
              </p>
            </div>
          </div>
        </section>

        <section
          id="record"
          className="relative scroll-mt-24 overflow-hidden bg-[#EDE7F2]"
        >
          <Image
            src="/landing/record-background.jpg"
            alt=""
            aria-hidden="true"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0 bg-bg/65 backdrop-blur-[4px]"
            aria-hidden="true"
          />
          <div
            className={`${SECTION_CLASS} relative z-10 grid items-center gap-12 lg:grid-cols-2 lg:gap-20`}
          >
            <div>
              <p className={`${EYEBROW_CLASS} text-brand-bluegrey`}>
                Testing × the record
              </p>
              <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.05] tracking-[-0.03em]">
                A panel is a snapshot. The record is the film.
              </h2>
              <p className="mt-6 max-w-[34em] text-pretty text-body-lg leading-relaxed text-text-secondary">
                Wearables show the load you carry day to day; bloods show what
                it is doing underneath. Morning Form reads them together — a
                draw lands next to your sleep, training and heart-rate
                variability, so a shift in iron or thyroid shows up in context,
                panel over panel.
              </p>
              <p className="mt-4 max-w-[34em] text-pretty text-body-lg leading-relaxed text-text-secondary">
                And when nothing changed, the record says nothing. Your
                attention is treated as the scarcest marker of all.
              </p>
            </div>
            <RecordPreview className="shadow-card-hover" />
          </div>
        </section>

        <section id="clinical" className="bg-surface">
          <div className={SECTION_CLASS}>
            <p className={EYEBROW_CLASS}>The clinical layer</p>
            <h2 className="mt-5 max-w-[15em] text-balance font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.05] tracking-[-0.03em]">
              Checked by clinicians, before you see it.
            </h2>
            <div className="mt-14 grid max-w-5xl gap-12 md:grid-cols-3">
              {[
                {
                  number: '01',
                  title: 'Reviewed by clinicians',
                  body: 'A registered clinician reviews every panel before it reaches your record — a person, not just an algorithm.',
                },
                {
                  number: '02',
                  title: 'We flag what needs attention',
                  body: `Anything outside range is flagged clearly, with a referral to your ${clinician.singular} or another clinician — never an upsell.`,
                },
                {
                  number: '03',
                  title: 'Your results stay yours',
                  body: 'Private to your record by default. Share a read-only link if you want to, and revoke it whenever.',
                },
              ].map((item) => (
                <article key={item.number}>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-brand-blue-700">
                    {item.number}
                  </span>
                  <h3 className="mt-3 font-display text-heading font-normal tracking-[-0.02em]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-body leading-relaxed text-text-secondary">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
            <p className="mt-12 max-w-[42em] text-body leading-relaxed text-text-secondary">
              If you have symptoms that worry you now, speak to your{' '}
              {clinician.singular} first — a baseline panel is not urgent care.{' '}
              <Link
                href="/safety"
                className="font-medium text-text-primary underline decoration-border-strong underline-offset-4 transition-colors hover:text-brand-blue-700 focus-visible:rounded-sm focus-visible:shadow-ring-focus"
              >
                Read our clinical approach.
              </Link>
            </p>
          </div>
        </section>

        <section id="faq" className={`${SECTION_CLASS} scroll-mt-24`}>
          <div className="grid items-start gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className={EYEBROW_CLASS}>Questions</p>
              <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4vw,3rem)] font-light leading-[1.08] tracking-[-0.03em]">
                The things worth asking first.
              </h2>
              <p className="mt-5 max-w-[28em] text-body leading-relaxed text-text-secondary">
                Run draw days in your club? We bring the phlebotomist, the kit
                and the lab — you provide a private room.{' '}
                <Link
                  href={`/${market}/partners`}
                  className="font-medium text-text-primary underline decoration-border-strong underline-offset-4 transition-colors hover:text-brand-blue-700 focus-visible:rounded-sm focus-visible:shadow-ring-focus"
                >
                  Partner with us.
                </Link>
              </p>
            </div>
            <div className="space-y-2.5">
              {TESTING_FAQ.entries.map((entry, index) => (
                <details
                  key={entry.question}
                  className="group overflow-hidden rounded-card-sm bg-surface shadow-hairline"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-body font-semibold text-text-primary transition-colors hover:bg-bg-deep focus-visible:shadow-ring-focus [&::-webkit-details-marker]:hidden">
                    {entry.question}
                    <span
                      className="grid h-7 w-7 flex-none place-items-center rounded-full border border-border font-mono text-sm font-normal text-text-tertiary transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-body leading-relaxed text-text-secondary">
                    {entry.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-10 sm:pb-28 lg:px-12">
          <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#FCE1D2_0%,#F6E7DD_24%,#E8EEF1_52%,#D2E1EB_76%,#BDD1DF_100%)] px-6 py-16 text-center sm:px-12 sm:py-24">
            <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_70%)]" />
            <div className="relative z-10">
              <h2 className="mx-auto max-w-[14em] text-balance font-display text-[clamp(2.25rem,5vw,4rem)] font-light leading-[1.02] tracking-[-0.035em]">
                Start with a baseline.
              </h2>
              <p className="mx-auto mt-6 max-w-[34em] text-pretty text-body-lg leading-relaxed text-text-secondary">
                Join Morning Form, connect what you already wear, and book your
                first draw when you are ready — at a partner club, a studio, or
                from your kitchen table.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
                <Link href="/sign-in" className={PRIMARY_CTA_CLASS}>
                  Join the private beta
                </Link>
                <Link
                  href="/demo"
                  className="text-body text-text-secondary transition-colors hover:text-text-primary focus-visible:rounded-sm focus-visible:shadow-ring-focus"
                >
                  Explore the live demo →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter market={market} />
    </div>
  );
}
