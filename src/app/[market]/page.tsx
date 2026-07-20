import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RevealOnScroll } from '@/components/ui/reveal-on-scroll';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { ActionIllustration } from '@/components/marketing/illustrations/action-illustration';
import { ReadIllustration } from '@/components/marketing/illustrations/read-illustration';
import { TrendIllustration } from '@/components/marketing/illustrations/trend-illustration';
import { HeroRecordCard } from '@/components/marketing/hero-record-card';
import { FaqBlock } from '@/components/marketing/faq-block';
import { isMarket } from '@/lib/marketing/market';
import { HOME_FAQ } from '../../../content/marketing/home-faq';
import { MARKET_CLINICIAN, SOURCE_NAMES, type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

// The page renders only fixture data and static copy; pin static
// generation explicitly (like /demo) so a future layout refactor can't
// silently flip the fixture work onto the request path.
export const dynamic = 'force-static';

type CardKey = 'Trend' | 'Read' | 'Action';

const CARD_ILLUSTRATION: Record<CardKey, (props: { className?: string }) => JSX.Element> = {
  Trend: TrendIllustration,
  Read: ReadIllustration,
  Action: ActionIllustration,
};

// Per-card gradient wash, matching the redesign's feature-rail treatment —
// each panel gets a distinct two-tone brand gradient behind its illustration.
const CARD_GRADIENT: Record<CardKey, string> = {
  Trend: 'linear-gradient(155deg, #E3F3FF 0%, #F9E8FB 100%)',
  Read: 'linear-gradient(155deg, #DFE6C1 0%, #E3F3FF 100%)',
  Action: 'linear-gradient(155deg, #F9E8FB 0%, #DFE6C1 100%)',
};

interface MarketHomeProps {
  params: { market: string };
}

// Testing lives per-market (src/app/[market]/testing), so the nav is
// built inside the component where `market` is in scope.
const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'How it works', href: '#how' },
  { label: "What's inside", href: '#inside' },
  { label: 'Live demo', href: '/demo' },
  { label: 'Sign in', href: '/sign-in' },
];

const NAV_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring';

const MARKET_LABEL: Record<Market, string> = {
  uk: 'UK',
  us: 'US',
};

// Small inline Lucide-style icons for the "How it works" steps — copied
// (not CDN-loaded) per the design system's own guidance for production use.
function ConnectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AdaptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

// FAQ copy lives in content/ (schema-validated, editorial provenance) —
// see content/marketing/home-faq.ts.

export default function LandingPage({ params }: MarketHomeProps) {
  if (!isMarket(params.market)) notFound();
  const market = params.market;
  const clinician = MARKET_CLINICIAN[market];

  return (
    <div className="min-h-screen bg-bg">
      <TrackMount event={FUNNEL_EVENTS.LANDING_VIEWED} properties={{ market }} />

      {/* Header — sticky, translucent-blurred, real brand lockup + mono-uppercase tabs. */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="px-6 sm:px-10 lg:px-16 py-3.5 flex items-center justify-between gap-4 max-w-[1400px] mx-auto">
          <Link
            href={`/${market}`}
            aria-label="Morning Form — home"
            className="text-text-primary"
          >
            <LogoLockup />
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {[{ label: 'Testing', href: `/${market}/testing` }, ...NAV_LINKS].map((t) => (
              <Link key={t.href} href={t.href} className={NAV_LINK_CLASS}>
                {t.label}
              </Link>
            ))}
            <Link href="/sign-in">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
          <Link
            href="/sign-in"
            aria-label="Sign in"
            className={`${NAV_LINK_CLASS} sm:hidden`}
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero — soft gradient wash fading to the page ground, copy on the
          left, the product itself on the right via HeroRecordCard. */}
      <section className="relative overflow-hidden bg-[linear-gradient(160deg,#F9E8FB_0%,#E3F3FF_45%,#DFE6C1_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/85 via-bg/55 to-bg" />
        <div className="relative px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-10 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
            <div className="stagger">
              <Badge dot>Private beta · {MARKET_LABEL[market]}</Badge>

              <h1 className="mt-8 font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98]">
                <span className="text-brand-blue-700">One</span> health record from every wearable, app, and blood test.
              </h1>

              <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
                No new test to buy. Morning Form reads the wearables you already wear
                and the bloods you already get — then tells you what&rsquo;s changed,
                what it means, and what to do today. In plain English.
              </p>

              <div className="mt-10 flex items-center gap-6 flex-wrap">
                <Link href="/sign-in">
                  <Button size="lg">Get started</Button>
                </Link>
                <TrackedLink
                  href="/demo"
                  event={FUNNEL_EVENTS.DEMO_CLICKED}
                  eventProperties={{ placement: 'hero' }}
                  className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
                >
                  Explore the live demo →
                </TrackedLink>
              </div>
              <p className="mt-5 text-caption text-text-tertiary">
                Free while in private beta · no card required
              </p>
            </div>

            <HeroRecordCard className="rise" />
          </div>

          {/* Source strip — the concrete answer to "from every wearable, app,
              and blood test". Names mirror the live connector registry. */}
          <div className="mt-16 sm:mt-20 pt-8 border-t border-border flex flex-wrap items-baseline gap-x-7 gap-y-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">
              Reads from
            </span>
            {SOURCE_NAMES.map((name) => (
              <span
                key={name}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Imagery rail — three product-feature illustrations, each on a
          distinct brand-gradient wash (Trend / Read / Action). */}
      <section className="px-6 sm:px-10 lg:px-16 pb-28 sm:pb-40 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {([
            { label: 'Trend', caption: 'Every marker moving in one view, month over month.' },
            { label: 'Read', caption: 'What your numbers mean, written in plain English.' },
            { label: 'Action', caption: 'What to change today, ranked by impact on your data.' },
          ] as ReadonlyArray<{ label: CardKey; caption: string }>).map((p, i) => {
            const Illustration = CARD_ILLUSTRATION[p.label];
            return (
              <RevealOnScroll key={p.label} delayMs={i * 90}>
                <figure className="m-0">
                  <div
                    className="panel-arch aspect-[4/5] relative overflow-hidden"
                    style={{ background: CARD_GRADIENT[p.label] }}
                  >
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
              </RevealOnScroll>
            );
          })}
        </div>
      </section>

      {/* Why it pays — three benefits, each tied to a real ROI lever. */}
      <section className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <RevealOnScroll>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">Why it pays</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            The clearest return on the time and money you&rsquo;re already spending on your health.
          </h2>
        </RevealOnScroll>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-6xl">
          {[
            {
              n: '01',
              title: `A longitudinal record your ${clinician.singular} doesn’t have`,
              body: `Most ${clinician.plural} see you for ten minutes every two years, on a single snapshot. Morning Form builds the thread — month over month, panel over panel — so the pattern surfaces months before the symptom would have sent you in.`,
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
          ].map((b, i) => (
            <RevealOnScroll key={b.n} delayMs={i * 90}>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">{b.n}</span>
              <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                {b.title}
              </h3>
              <p className="mt-3 text-body text-text-secondary leading-relaxed">{b.body}</p>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* How it works — three steps, icon + monospaced numerals for rhythm,
          on a soft brand-gradient band. */}
      <section id="how" className="scroll-mt-24 bg-[linear-gradient(135deg,#E3F3FF_0%,#F9E8FB_100%)]">
        <div className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
          <RevealOnScroll>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-bluegrey mb-12">How it works</p>
          </RevealOnScroll>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-5xl">
            {[
              { n: 'Step 01', title: 'Connect', icon: <ConnectIcon />, body: 'Link your wearables and tracking apps. Upload bloods or order a panel through us. A few minutes, once.' },
              { n: 'Step 02', title: 'Read', icon: <ReadIcon />, body: 'Your record arrives in minutes — every number in plain English, with the lifestyle changes ranked by impact on your data.' },
              { n: 'Step 03', title: 'Adapt', icon: <AdaptIcon />, body: 'Fifteen-second daily check-ins refine the read. Quarterly bloods recalibrate it. The record builds; you improve.' },
            ].map((step, i) => (
              <RevealOnScroll key={step.n} delayMs={i * 100}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-brand-blue-900 shadow-hairline">
                    {step.icon}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand-bluegrey">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-body text-text-secondary leading-relaxed">{step.body}</p>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* What's inside — the full surface of the product, indexed. This is
          the "everything we have built" section: each entry maps to a real,
          shipped surface of the app. */}
      <section id="inside" className="scroll-mt-24 px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
        <RevealOnScroll>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">What&rsquo;s inside</p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
            One membership. The whole instrument.
          </h2>
        </RevealOnScroll>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8 max-w-6xl">
          {[
            {
              n: '01',
              title: 'The record',
              body: 'Every marker, lab, and trend on one navigable graph — and the provenance of every number one tap away.',
            },
            {
              n: '02',
              title: 'Ask',
              body: 'A guide that answers from your record and cites its sources. When a question belongs to a clinician, it says so.',
            },
            {
              n: '03',
              title: 'Priority markers',
              body: 'A short assessment maps your pattern, then ranks which blood tests are actually worth doing first — with the reasoning shown.',
            },
            {
              n: '04',
              title: 'Daily check-ins',
              body: 'Fifteen seconds, morning and evening. How you feel calibrates what your data means.',
            },
            {
              n: '05',
              title: 'Works with your AI',
              body: 'Connect Claude or any MCP client to your record — read-only, token-scoped, revocable any time.',
            },
            {
              n: '06',
              title: 'Yours, properly',
              body: 'Export your entire record whenever you like. Delete it just as easily. Never sold, never used for advertising.',
            },
          ].map((f, i) => (
            <RevealOnScroll key={f.n} delayMs={(i % 3) * 90}>
              <div className="h-full rounded-card bg-surface p-6 sm:p-7 shadow-hairline transition-[box-shadow,transform] duration-300 ease-spring hover:shadow-card-hover hover:-translate-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">{f.n}</span>
                <h3 className="mt-3 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {f.title}
                </h3>
                <p className="mt-3 text-body text-text-secondary leading-relaxed">{f.body}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* Refusals — the trust section. Until consented member quotes exist,
          the strongest proof we can offer is what the product will not do;
          an inverted band gives the page its one deliberate rhythm break. */}
      <section className="bg-text-primary">
        <div className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
          <RevealOnScroll>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper mb-5">
              The other half of the product
            </p>
            <h2 className="font-display font-light text-display sm:text-display-xl text-bg max-w-3xl -tracking-[0.04em] leading-[1.02]">
              What Morning Form refuses to do.
            </h2>
          </RevealOnScroll>

          <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-14 max-w-5xl">
            {[
              {
                n: '01',
                title: 'No hype',
                body: 'No streaks, badges, or confetti. Progress is communicated through calm data — or not at all.',
              },
              {
                n: '02',
                title: 'No diagnosis',
                body: 'Morning Form explains and flags; it never diagnoses. When a marker needs a clinician, you get a clear referral — not an upsell.',
              },
              {
                n: '03',
                title: 'No generic advice',
                body: 'If a suggestion can’t be traced back to your own numbers, it doesn’t ship.',
              },
              {
                n: '04',
                title: 'No noise',
                body: 'If nothing changed, Morning Form says nothing. Your attention is treated as the scarcest marker of all.',
              },
            ].map((r, i) => (
              <RevealOnScroll key={r.n} delayMs={i * 80}>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">{r.n}</span>
                <h3 className="mt-4 font-display font-normal text-heading text-bg -tracking-[0.02em]">
                  {r.title}
                </h3>
                <p className="mt-3 text-body text-text-inverse-muted leading-relaxed">{r.body}</p>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — the objections a data product must answer before the ask. */}
      <FaqBlock entries={HOME_FAQ.entries} />

      {/* Final CTA — restate the value, on the hero's gradient wash. */}
      <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 max-w-[1400px] mx-auto">
        <RevealOnScroll>
          <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,#F9E8FB_0%,#E3F3FF_45%,#DFE6C1_100%)] px-6 sm:px-16 py-16 sm:py-24 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_70%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
                See what your numbers have been trying to tell you. Free.
              </h2>
              <p className="mt-6 mx-auto max-w-xl text-body-lg text-text-secondary leading-relaxed">
                Link a wearable, upload a panel, take the assessment when
                you&rsquo;re ready — all optional. No card required.
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
                  See a sample record →
                </TrackedLink>
                <Link
                  href="/sign-in"
                  className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
                >
                  Already a member? Sign in →
                </Link>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </section>

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
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
              © 2026 Morning Form
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
