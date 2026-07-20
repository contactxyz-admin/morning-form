import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { MarketingHeader, NAV_LINK_CLASS } from '@/components/marketing/marketing-header';
import { isMarket } from '@/lib/marketing/market';
import { MARKET_CLINICIAN, MARKETS, type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

// Static copy only — pin static generation explicitly, same rationale as
// the market homepage and testing page.
export const dynamic = 'force-static';

interface PartnersPageProps {
  params: { market: string };
}

const MONO_EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary';
const DASH_BULLET = "leading-relaxed pl-5 relative before:content-['—'] before:absolute before:left-0 before:text-text-tertiary";

const PAGE_TITLE = 'Run draw days in your club — Partner with Morning Form';
const PAGE_DESCRIPTION =
  'Bring blood testing to your members with zero operational lift. We bring the phlebotomist, the kit, the logistics and the lab — you provide a private room and a nudge to your members.';

export function generateStaticParams(): Array<{ market: string }> {
  return MARKETS.map((market) => ({ market }));
}

export function generateMetadata({ params }: PartnersPageProps): Metadata {
  if (!isMarket(params.market)) return {};
  const market = params.market;

  const title = PAGE_TITLE;
  const description = PAGE_DESCRIPTION;

  return {
    title,
    description,
    alternates: {
      canonical: `/${market}/partners`,
      languages: {
        'en-GB': '/uk/partners',
        'en-US': '/us/partners',
        'x-default': `/${market}/partners`,
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

export default function PartnersPage({ params }: PartnersPageProps) {
  if (!isMarket(params.market)) notFound();
  const market: Market = params.market;
  const clinician = MARKET_CLINICIAN[market];

  return (
    <div className="min-h-screen bg-bg">
      <TrackMount event={FUNNEL_EVENTS.PARTNERS_VIEWED} properties={{ market }} />

      {/* Header — brand lockup + mono-uppercase tabs, matching the
          market homepage and testing page. */}
      <MarketingHeader
        homeHref={`/${market}`}
        navLinks={[
          { label: 'Testing', href: `/${market}/testing` },
          { label: 'Sign in', href: '/sign-in' },
        ]}
      />

      <main>
        {/* Hero — the partnership pitch, promoted from a quiet row on the
            testing page to its own page. */}
        <section className="px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-20 sm:pb-28 max-w-[1400px] mx-auto">
          <div className="stagger max-w-2xl">
            <p className={MONO_EYEBROW}>For clubs &amp; studios · {market.toUpperCase()}</p>

            <h1 className="mt-8 font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98]">
              Run draw days in your club.
            </h1>

            <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
              We bring the phlebotomist, the kit, the logistics and the lab; you provide
              a private room and a nudge to your members. A member benefit no other club
              offers — with zero operational lift.
            </p>

            <div className="mt-10 flex items-center gap-6 flex-wrap">
              <Link href="/contact">
                <Button size="lg">Partner with us</Button>
              </Link>
              <Link
                href={`/${market}/testing`}
                className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
              >
                See the member experience →
              </Link>
            </div>
            <p className="mt-5 text-caption text-text-tertiary">
              First clubs onboarding now · same accredited lab as every draw
            </p>
          </div>
        </section>

        {/* What it looks like — the member-facing experience your club is
            hosting, drawn from the same draw-day model described on the
            testing page. */}
        <section className="px-6 sm:px-10 lg:px-16 py-20 sm:py-28 border-t border-border max-w-[1400px] mx-auto">
          <p className={`${MONO_EYEBROW} mb-5`}>What it looks like</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            A draw day where your members already train.
          </h2>
          <p className="mt-8 text-body-lg text-text-secondary max-w-2xl leading-relaxed">
            On set days, a registered phlebotomist runs a private room at your club.
            Members book a slot in the app, the draw takes a few minutes, and they&rsquo;re
            back on the floor before their session starts.
          </p>

          <ul className="mt-10 space-y-3 max-w-2xl">
            {[
              'Members book in the app, in seconds — no calls, no clipboard',
              'A few minutes, in a private room you provide',
              'Run end-to-end by our registered clinical partner',
              'Every result lands in the member’s own Morning Form record',
            ].map((b) => (
              <li key={b} className={`${DASH_BULLET} text-body text-text-secondary`}>
                {b}
              </li>
            ))}
          </ul>
        </section>

        {/* The clinical layer — inverted band, the trust section. Moved
            here from the testing page: this is the detail a club weighing
            liability cares about more than an individual member does. */}
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
                  body: 'Every panel is reviewed before it reaches a member’s record. Findings that need attention are flagged clearly, with a referral.',
                },
                {
                  n: '03',
                  title: 'Consent & identity',
                  body: 'E-consent and ID checks before any draw. Results stay with the member — shared only if they choose to share them.',
                },
                {
                  n: '04',
                  title: 'Descriptive, not diagnostic',
                  body: 'Morning Form explains and flags; it never diagnoses. When a marker needs a clinician, the member gets a clear referral — not an upsell.',
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
              If a member has symptoms that worry them now, we point them to their{' '}
              {clinician.singular} first — a baseline panel is not urgent care.
            </p>
          </div>
        </section>

        {/* Final CTA. */}
        <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 max-w-[1400px] mx-auto">
          <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,#F9E8FB_0%,#E3F3FF_45%,#DFE6C1_100%)] px-6 sm:px-16 py-16 sm:py-24 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_70%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-xl font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
                Bring Morning Form to your club.
              </h2>
              <p className="mt-6 mx-auto max-w-xl text-body-lg text-text-secondary leading-relaxed">
                Tell us about your club or studio, and we&rsquo;ll be in touch to set up
                your first draw day.
              </p>
              <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
                <Link href="/contact">
                  <Button size="lg">Partner with us</Button>
                </Link>
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
