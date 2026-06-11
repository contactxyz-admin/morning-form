import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ActionIllustration } from '@/components/marketing/illustrations/action-illustration';
import { ReadIllustration } from '@/components/marketing/illustrations/read-illustration';
import { TrendIllustration } from '@/components/marketing/illustrations/trend-illustration';
import { RecordPreview } from '@/components/marketing/record-preview';
import { FaqBlock } from '@/components/marketing/faq-block';
import { isMarket } from '@/lib/marketing/market';
import { MARKET_CLINICIAN, SOURCE_NAMES, type Market } from '@/lib/marketing/constants';
import { TrackMount } from '@/lib/funnel/track-mount';
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

interface MarketHomeProps {
  params: { market: string };
}

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

const FAQ_ENTRIES: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'Is this medical advice?',
    answer:
      'No. Morning Form reads and explains your own data, and points you to a clinician when a marker needs one. It never diagnoses, and it never replaces your clinician — it gives you a better record to bring them.',
  },
  {
    question: 'Which devices and apps work?',
    answer:
      'Whoop, Oura, Fitbit, Dexcom and FreeStyle Libre connect from the web; Apple Health connects through the iPhone app. Any blood panel can be uploaded as a PDF, whoever ran it.',
  },
  {
    question: 'I don’t have a wearable — can I still use it?',
    answer:
      'Yes. Upload a blood panel, or begin with the assessment and daily check-ins. The record builds from whatever you give it, and gets sharper with each source you add.',
  },
  {
    question: 'Is my data private?',
    answer:
      'Your record is yours. It is never sold and never used for advertising, and you can export the whole thing — or delete it — from settings at any time.',
  },
  {
    question: 'What happens if something looks wrong?',
    answer:
      'When a marker crosses a threshold that needs a real clinician, Morning Form flags it clearly, explains it in plain English, and recommends you speak to one. Flags are never buried, and never sold around.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Nothing while we are in private beta — no card required. Membership pricing will be announced at launch, and beta members will hear it first.',
  },
];

export default function LandingPage({ params }: MarketHomeProps) {
  if (!isMarket(params.market)) notFound();
  const market = params.market;
  const clinician = MARKET_CLINICIAN[market];

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

      {/* Hero — copy on the left, the product itself on the right. The
          RecordPreview renders the same synthetic series as /demo, so the
          first thing a visitor sees is a real record, not an abstraction. */}
      <section className="px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-20 sm:pb-28 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
          <div className="stagger">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
              Now in private beta · {MARKET_LABEL[market]}
            </p>

            <h1 className="mt-8 font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98]">
              <span className="italic">One</span> health record from every wearable, app, and blood test.
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
              <Link
                href="/demo"
                className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300"
              >
                Explore the live demo →
              </Link>
            </div>
            <p className="mt-5 text-caption text-text-tertiary">
              Free while in private beta · no card required
            </p>
          </div>

          <RecordPreview className="rise" />
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
      <section className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">Why it pays</p>
        <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
          The clearest return on the time and money you&rsquo;re already spending on your health.
        </h2>

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
      <section id="how" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-12">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-5xl">
          {[
            {
              n: 'Step 01',
              title: 'Connect',
              body: 'Link your wearables and tracking apps. Upload bloods or order a panel through us. A few minutes, once.',
            },
            {
              n: 'Step 02',
              title: 'Read',
              body: 'Your record arrives in minutes — every number in plain English, with the lifestyle changes ranked by impact on your data.',
            },
            {
              n: 'Step 03',
              title: 'Adapt',
              body: 'Fifteen-second daily check-ins refine the read. Quarterly bloods recalibrate it. The record builds; you improve.',
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

      {/* What's inside — the full surface of the product, indexed. This is
          the "everything we have built" section: each entry maps to a real,
          shipped surface of the app. */}
      <section id="inside" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">What&rsquo;s inside</p>
        <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
          One membership. The whole instrument.
        </h2>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16 max-w-6xl">
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
          ].map((f) => (
            <div key={f.n}>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">{f.n}</span>
              <h3 className="mt-4 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                {f.title}
              </h3>
              <p className="mt-3 text-body text-text-secondary leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Refusals — the trust section. Until consented member quotes exist,
          the strongest proof we can offer is what the product will not do;
          an inverted band gives the page its one deliberate rhythm break. */}
      <section className="bg-text-primary">
        <div className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 max-w-[1400px] mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper mb-5">
            The other half of the product
          </p>
          <h2 className="font-display font-light text-display sm:text-display-xl text-bg max-w-3xl -tracking-[0.04em] leading-[1.02]">
            What Morning Form refuses to do.
          </h2>

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
            ].map((r) => (
              <div key={r.n}>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">{r.n}</span>
                <h3 className="mt-4 font-display font-normal text-heading text-bg -tracking-[0.02em]">
                  {r.title}
                </h3>
                <p className="mt-3 text-body text-text-inverse-muted leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — the objections a data product must answer before the ask. */}
      <FaqBlock entries={FAQ_ENTRIES} />

      {/* Final CTA — restate the value, ink only, low-commitment ask. */}
      <section className="px-6 sm:px-10 lg:px-16 py-32 sm:py-44 border-t border-border max-w-[1400px] mx-auto">
        <h2 className="font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary max-w-4xl -tracking-[0.04em] leading-[0.98]">
          See what your numbers have been trying to tell you. Free.
        </h2>
        <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          Link a wearable, upload a panel, take the assessment when
          you&rsquo;re ready — all optional. No card required.
        </p>
        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/sign-in">
            <Button size="lg">Get started</Button>
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
          {/* Privacy / Safety & clinical / Contact links removed until those
              routes exist — they 404'd. Restore alongside the real pages. */}
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary sm:text-right">
            © 2026 Morning Form
          </p>
        </div>
      </footer>
    </div>
  );
}
