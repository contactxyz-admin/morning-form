import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ActionIllustration } from '@/components/marketing/illustrations/action-illustration';
import { ReadIllustration } from '@/components/marketing/illustrations/read-illustration';
import { TrendIllustration } from '@/components/marketing/illustrations/trend-illustration';
import { isMarket } from '@/lib/marketing/market';
import { type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

type CardKey = 'Trend' | 'Read' | 'Action';

const CARD_ILLUSTRATION: Record<CardKey, (props: { className?: string }) => JSX.Element> = {
  Trend: TrendIllustration,
  Read: ReadIllustration,
  Action: ActionIllustration,
};

interface MarketHomeProps {
  params: { market: string };
}

const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'How it works', href: '#how' },
  { label: 'Members', href: '#proof' },
  { label: 'See a demo', href: '/demo' },
  { label: 'Sign in', href: '/sign-in' },
];

const NAV_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring';

const MARKET_LABEL: Record<Market, string> = {
  uk: 'UK',
  us: 'US',
};

const TESTIMONIAL_SAVINGS_DISPLAY: Record<Market, string> = {
  uk: '£80 a month',
  us: '$100 a month',
};

export default function LandingPage({ params }: MarketHomeProps) {
  if (!isMarket(params.market)) notFound();
  const market = params.market;

  return (
    <div className="min-h-screen bg-bg">
      <TrackMount event={FUNNEL_EVENTS.LANDING_VIEWED} properties={{ market }} />
      {/* Header — text-only wordmark + mono-uppercase tabs, matching the
          /demo branding voice. */}
      <header className="px-6 sm:px-10 lg:px-16 pt-7 pb-4 flex items-center justify-between max-w-[1400px] mx-auto">
        <Link
          href={`/${market}`}
          aria-label="Morning Form — home"
          className="font-display font-light text-subheading -tracking-[0.02em] text-text-primary"
        >
          Morning Form
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((t) => (
            <Link key={t.href} href={t.href} className={NAV_LINK_CLASS}>
              {t.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/sign-in"
          aria-label="Sign in"
          className={`${NAV_LINK_CLASS} sm:hidden`}
        >
          Sign in
        </Link>
      </header>

      {/* Hero — mono-uppercase eyebrow (was a chip-soft pill), ink headline,
          generous breathing room. */}
      <section className="px-6 sm:px-10 lg:px-16 pt-20 sm:pt-32 pb-24 sm:pb-40 max-w-[1400px] mx-auto">
        <p className="mb-10 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          Now in private beta · {MARKET_LABEL[market]}
        </p>

        <h1 className="font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98] max-w-5xl">
          One health record from every wearable, app, and blood test.
        </h1>

        <p className="mt-10 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          The longitudinal view your doctor doesn&rsquo;t have — written in plain English.
          Morning Form reads your Whoop, Oura, Apple Health, and blood panels and tells
          you what&rsquo;s changed, what it means, and what to do today.
        </p>

        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">See your record</Button>
          </Link>
          <p className="text-caption text-text-tertiary">
            8 minutes · free · no signup
          </p>
        </div>
      </section>

      {/* Imagery rail — three product-feature illustrations on the
          panel-arch frame. Each illustration communicates a feature
          (Trend / Read / Action) without making numerical or clinical
          claims that real screenshots would have to defend. */}
      <section className="px-6 sm:px-10 lg:px-16 pb-28 sm:pb-40 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {([
            { label: 'Trend', caption: 'Every marker moving in one view, month over month.' },
            { label: 'Read', caption: 'What your numbers mean, written in plain English.' },
            { label: 'Action', caption: 'What to change today, ranked by impact on your data.' },
          ] as ReadonlyArray<{ label: CardKey; caption: string }>).map((p) => {
            const Illustration = CARD_ILLUSTRATION[p.label];
            return (
              <figure key={p.label}>
                <div className="panel-arch aspect-[4/5] relative overflow-hidden">
                  <Illustration className="absolute inset-0 w-full h-full" />
                  <span className="absolute bottom-5 left-5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">
                    {p.label}
                  </span>
                </div>
                <figcaption className="mt-5 text-caption leading-relaxed">
                  <span className="text-text-primary font-medium">{p.label}.</span>{' '}
                  <span className="text-text-tertiary">{p.caption}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      {/* Why it pays — three benefits, each tied to a real ROI lever. */}
      <section id="how" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">Why it pays</p>
        <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
          The clearest return on the time and money you&rsquo;re already spending on your health.
        </h2>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-6xl">
          {[
            {
              n: '01',
              title: 'A longitudinal record your doctor doesn’t have',
              body: 'Most clinicians see you for ten minutes every two years, on a single snapshot. Morning Form builds the thread — month over month, panel over panel — so patterns surface before they become problems.',
            },
            {
              n: '02',
              title: 'No more guesswork',
              body: 'Every recommendation is justified by your bloods and wearable trends — never generic. Spend less, on the things that actually move your numbers.',
            },
            {
              n: '03',
              title: 'A safety net, built in',
              body: 'When a marker crosses a threshold that needs a real clinician, Morning Form flags it clearly with a referral. Never buried, never hyped, never sold around.',
            },
          ].map((b) => (
            <div key={b.n}>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">{b.n}</span>
              <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                {b.title}
              </h3>
              <p className="mt-3 text-body text-text-secondary leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — three steps, monospaced numerals for rhythm. */}
      <section className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-12">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-5xl">
          {[
            {
              n: 'Step 01',
              title: 'Connect',
              body: 'Link your wearables and tracking apps. Upload bloods or order a panel through us.',
            },
            {
              n: 'Step 02',
              title: 'Read',
              body: 'Your record arrives in minutes — every number in plain English, with the lifestyle changes ranked by impact on your data.',
            },
            {
              n: 'Step 03',
              title: 'Adapt',
              body: 'Daily check-ins refine the read. Quarterly bloods recalibrate it. The record builds; you improve.',
            },
          ].map((step) => (
            <div key={step.n}>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                {step.n}
              </span>
              <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                {step.title}
              </h3>
              <p className="mt-3 text-body text-text-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof — placeholder testimonials in the early-adopter voice. */}
      <section id="proof" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">Members</p>
        <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
          From people who were already tracking everything.
        </h2>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl">
          {[
            {
              quote:
                `I’d been stacking ten supplements based on Reddit. Morning Form ranked four of them as doing nothing for my actual bloods. Saved me about ${TESTIMONIAL_SAVINGS_DISPLAY[market]} inside a week.`,
              name: 'Placeholder · M, 34',
              meta: 'Whoop · quarterly bloods',
            },
            {
              quote:
                'It’s the first thing that read my Oura, my CGM, and my last lab and gave me a sentence I could act on. Every other app made me do the synthesis.',
              name: 'Placeholder · M, 29',
              meta: 'Oura · Libre · Apple Health',
            },
            {
              quote:
                'Flagged a liver marker my doctor had told me to ignore and pushed me to retest. Came back in range after twelve weeks on the protocol. That alone paid for the year.',
              name: 'Placeholder · M, 38',
              meta: 'Annual blood panel',
            },
          ].map((t, i) => (
            <figure
              key={i}
              className="rounded-card border border-border bg-surface p-7 sm:p-8 flex flex-col gap-6"
            >
              <blockquote className="text-body text-text-primary leading-relaxed">
                {'“'}{t.quote}{'”'}
              </blockquote>
              <figcaption className="mt-auto">
                <p className="text-caption font-medium text-text-primary">{t.name}</p>
                <p className="text-caption text-text-tertiary">{t.meta}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-12 text-caption text-text-tertiary max-w-md">
          Quotes shown are placeholders pending consented testimonials from private beta members.
        </p>
      </section>

      {/* Final CTA — restate the value, ink only, low-commitment ask. */}
      <section className="px-6 sm:px-10 lg:px-16 py-32 sm:py-44 border-t border-border max-w-[1400px] mx-auto">
        <h2 className="font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary max-w-4xl -tracking-[0.04em] leading-[0.98]">
          See what your numbers have been trying to tell you. In eight minutes, free.
        </h2>
        <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          Take the assessment, link one wearable, see your record. No card, no signup until
          you decide to keep going.
        </p>
        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">See your record</Button>
          </Link>
          <Link
            href="/demo"
            className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
          >
            See a sample record →
          </Link>
          <Link
            href="/sign-in"
            className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
          >
            Already a member? Sign in →
          </Link>
        </div>
      </section>

      {/* Footer — text-only wordmark, mono-uppercase nav. */}
      <footer className="px-6 sm:px-10 lg:px-16 py-16 border-t border-border max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
          <Link
            href={`/${market}`}
            className="font-display font-light text-heading -tracking-[0.02em] text-text-primary"
          >
            Morning Form
          </Link>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap gap-7">
              <Link href="/privacy" className={NAV_LINK_CLASS}>Privacy</Link>
              <Link href="/safety" className={NAV_LINK_CLASS}>Safety &amp; clinical</Link>
              <Link href="/contact" className={NAV_LINK_CLASS}>Contact</Link>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
              © 2026 Morning Form
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
