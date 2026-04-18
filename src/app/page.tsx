import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/brand/wordmark';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header — fixed visual rhythm; nav sits in optical alignment with the wordmark. */}
      <header className="px-6 sm:px-10 lg:px-16 pt-7 pb-4 flex items-center justify-between max-w-[1400px] mx-auto">
        <Link href="/" aria-label="Morning Form — home" className="-m-1 p-1">
          <Wordmark variant="inline" size="md" />
        </Link>
        <nav className="flex items-center gap-8 text-[0.8125rem] text-text-secondary">
          <Link href="#how" className="hover:text-text-primary transition-colors">How it works</Link>
          <Link href="#proof" className="hover:text-text-primary transition-colors">Members</Link>
          <Link href="/sign-in" className="hover:text-text-primary transition-colors">Sign in</Link>
        </nav>
      </header>

      {/* Hero — single status chip, ink headline (no gradient), generous breathing room. */}
      <section className="px-6 sm:px-10 lg:px-16 pt-20 sm:pt-32 pb-24 sm:pb-40 max-w-[1400px] mx-auto">
        <div className="mb-10">
          <span className="chip-soft">
            <span className="chip-soft-dot" />
            <span>Now in private beta · UK</span>
          </span>
        </div>

        <h1 className="text-[2.75rem] sm:text-[4.5rem] lg:text-[5.5rem] font-semibold text-text-primary leading-[1.02] tracking-[-0.04em] max-w-5xl">
          One health record from every wearable, app, and blood test.
        </h1>

        <p className="mt-10 text-[1.125rem] sm:text-[1.25rem] text-text-secondary max-w-2xl leading-[1.5] tracking-[-0.005em]">
          The longitudinal view your GP doesn&rsquo;t have — written in plain English.
          Morning Form reads your Whoop, Oura, Apple Health, and blood panels and tells
          you what&rsquo;s changed, what it means, and what to do today.
        </p>

        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">See your record</Button>
          </Link>
          <p className="text-[0.8125rem] text-text-tertiary">
            8 minutes · free · no signup
          </p>
        </div>
      </section>

      {/* Imagery rail — neutral rounded frames, equal heights, no decorative offsets. */}
      <section className="px-6 sm:px-10 lg:px-16 pb-28 sm:pb-40 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {[
            { label: 'Trend', caption: 'Every marker moving in one view, month over month.' },
            { label: 'Read', caption: 'What your numbers mean, written in plain English.' },
            { label: 'Action', caption: 'What to change today, ranked by impact on your data.' },
          ].map((p) => (
            <figure key={p.label}>
              <div className="panel-arch aspect-[4/5] flex items-end p-5 text-[0.75rem] uppercase tracking-[0.08em] text-text-whisper">
                {p.label}
              </div>
              <figcaption className="mt-5 text-[0.875rem] leading-[1.5]">
                <span className="text-text-primary font-medium">{p.label}.</span>{' '}
                <span className="text-text-tertiary">{p.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Why it pays — three benefits, each tied to a real ROI lever. */}
      <section id="how" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="text-[0.75rem] uppercase tracking-[0.1em] text-text-tertiary mb-5">Why it pays</p>
        <h2 className="text-[2rem] sm:text-[3rem] font-semibold text-text-primary max-w-3xl leading-[1.05] tracking-[-0.035em]">
          The clearest return on the time and money you&rsquo;re already spending on your health.
        </h2>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-12 max-w-6xl">
          {[
            {
              n: '01',
              title: 'A longitudinal record your GP doesn\u2019t have',
              body: 'Most clinicians see you for ten minutes every two years, on a single snapshot. Morning Form builds the thread — month over month, panel over panel — so patterns surface before they become problems.',
            },
            {
              n: '02',
              title: 'No more supplement guesswork',
              body: 'Every recommendation is justified by your bloods and wearable trends — never generic. Spend less, on the things that actually move your numbers.',
            },
            {
              n: '03',
              title: 'A medical safety net, built in',
              body: 'When a marker crosses a threshold that needs a real clinician, Morning Form flags it clearly with a referral. Never buried, never hyped, never sold around.',
            },
          ].map((b) => (
            <div key={b.n}>
              <span className="font-mono text-[0.75rem] text-text-tertiary tracking-wider">{b.n}</span>
              <h3 className="mt-4 text-[1.375rem] font-semibold text-text-primary tracking-[-0.02em] leading-[1.25]">
                {b.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-text-secondary leading-[1.6]">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — three steps, monospaced numerals for rhythm. */}
      <section className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="text-[0.75rem] uppercase tracking-[0.1em] text-text-tertiary mb-12">How it works</p>
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
              body: 'Your record arrives in minutes — every number in plain English, with the lifestyle changes and supplements ranked by impact on your data.',
            },
            {
              n: 'Step 03',
              title: 'Adapt',
              body: 'Daily check-ins refine the read. Quarterly bloods recalibrate it. The record builds; you improve.',
            },
          ].map((step) => (
            <div key={step.n}>
              <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-text-tertiary">
                {step.n}
              </span>
              <h3 className="mt-4 text-[1.375rem] font-semibold text-text-primary tracking-[-0.02em] leading-[1.25]">
                {step.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-text-secondary leading-[1.6]">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof — placeholder testimonials in the early-adopter voice. */}
      <section id="proof" className="px-6 sm:px-10 lg:px-16 py-28 sm:py-40 border-t border-border max-w-[1400px] mx-auto">
        <p className="text-[0.75rem] uppercase tracking-[0.1em] text-text-tertiary mb-5">Members</p>
        <h2 className="text-[1.875rem] sm:text-[2.5rem] font-semibold text-text-primary max-w-2xl leading-[1.1] tracking-[-0.03em]">
          From people who were already tracking everything.
        </h2>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl">
          {[
            {
              quote:
                'I&rsquo;d been stacking ten supplements based on Reddit. Morning Form ranked four of them as doing nothing for my actual bloods. Saved me about £80 a month inside a week.',
              name: 'Placeholder · M, 34',
              meta: 'Whoop · quarterly bloods',
            },
            {
              quote:
                'It&rsquo;s the first thing that read my Oura, my CGM, and my last lab and gave me a sentence I could act on. Every other app made me do the synthesis.',
              name: 'Placeholder · M, 29',
              meta: 'Oura · Libre · Apple Health',
            },
            {
              quote:
                'Flagged a liver marker my GP had told me to ignore and pushed me to retest. Came back in range after twelve weeks on the protocol. That alone paid for the year.',
              name: 'Placeholder · M, 38',
              meta: 'Annual blood panel',
            },
          ].map((t, i) => (
            <figure
              key={i}
              className="rounded-card border border-border bg-surface p-7 sm:p-8 flex flex-col gap-6"
            >
              <blockquote className="text-[0.9375rem] text-text-primary leading-[1.55]">
                &ldquo;<span dangerouslySetInnerHTML={{ __html: t.quote }} />&rdquo;
              </blockquote>
              <figcaption className="mt-auto">
                <p className="text-[0.8125rem] font-medium text-text-primary">{t.name}</p>
                <p className="text-[0.8125rem] text-text-tertiary">{t.meta}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-12 text-[0.8125rem] text-text-tertiary max-w-md">
          Quotes shown are placeholders pending consented testimonials from private beta members.
        </p>
      </section>

      {/* Final CTA — restate the value, ink only, low-commitment ask. */}
      <section className="px-6 sm:px-10 lg:px-16 py-32 sm:py-44 border-t border-border max-w-[1400px] mx-auto">
        <h2 className="text-[2.25rem] sm:text-[3.5rem] font-semibold text-text-primary max-w-3xl leading-[1.02] tracking-[-0.035em]">
          See what your numbers have been trying to tell you. In eight minutes, free.
        </h2>
        <p className="mt-8 text-[1.125rem] text-text-secondary max-w-xl leading-[1.55]">
          Take the assessment, link one wearable, see your record. No card, no signup until
          you decide to keep going.
        </p>
        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">See your record</Button>
          </Link>
          <Link
            href="/sign-in"
            className="text-[0.9375rem] text-text-secondary hover:text-text-primary transition-colors duration-300"
          >
            Already a member? Sign in →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 sm:px-10 lg:px-16 py-16 border-t border-border max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
          <Wordmark variant="lockup" size="lg" />
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap gap-7 text-[0.8125rem] text-text-tertiary">
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Privacy</span>
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Safety &amp; clinical</span>
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Contact</span>
            </div>
            <p className="text-[0.8125rem] text-text-tertiary">© 2026 Morning Form</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
