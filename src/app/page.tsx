import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/brand/wordmark';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="px-6 sm:px-10 pt-7 pb-4 flex items-center justify-between">
        <Link href="/" aria-label="Morning Form — home" className="-m-1 p-1">
          <Wordmark variant="inline" size="sm" />
        </Link>
        <nav className="flex items-center gap-7 text-caption text-text-secondary">
          <Link href="#how" className="hover:text-text-primary transition-colors">How it works</Link>
          <Link href="#proof" className="hover:text-text-primary transition-colors">Members</Link>
          <Link
            href="/sign-in"
            className="hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero — value prop is concrete: what we ingest, what you get out.
          Gradient lands on the differentiator phrase. */}
      <section className="px-6 sm:px-10 pt-14 sm:pt-20 pb-20">
        <div className="mb-10 flex flex-wrap gap-3">
          <span className="chip-soft chip-soft-positive">
            <span className="chip-soft-dot" />
            <span>
              <span className="chip-soft-meta">Now in private beta · UK</span>
              Free assessment · 8 minutes
            </span>
          </span>
          <span className="chip-soft chip-soft-pop">
            <span className="chip-soft-dot" />
            <span>
              <span className="chip-soft-meta">Whoop · Oura · Apple Health · Libre</span>
              Connects what you already track
            </span>
          </span>
        </div>

        <h1 className="text-[2.5rem] sm:text-[4.25rem] lg:text-[5.25rem] font-extrabold text-text-primary leading-[0.96] tracking-[-0.045em] max-w-5xl">
          One daily protocol from{' '}
          <span className="text-gradient-warm">every wearable, app, and blood test.</span>
        </h1>

        <p className="mt-8 text-body-lg sm:text-[1.25rem] text-text-secondary max-w-2xl leading-[1.55]">
          Morning Form connects your wearables, tracking apps, and blood work in one place.
          AI translates the noise into plain-English actions: what to change today, which
          supplements actually move your numbers, when to see a clinician. Built for people
          who already track everything and still don&rsquo;t know what to do.
        </p>

        <div className="mt-12 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Get your starter protocol →</Button>
          </Link>
          <p className="text-caption text-text-tertiary">
            8 minutes · free · no signup
          </p>
        </div>
      </section>

      {/* Imagery rail — soft proof that the product has a real shape. */}
      <section className="px-6 sm:px-10 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-7 max-w-6xl">
          {[
            { label: 'Morning', caption: 'A 30-second check-in maps the day ahead.' },
            { label: 'Protocol', caption: 'Personalised, adaptive, and explained — not prescribed.' },
            { label: 'Evening', caption: 'Reflect, refine, prep for sleep.' },
          ].map((p, idx) => (
            <figure key={p.label} className={idx === 1 ? 'sm:-translate-y-6' : ''}>
              <div className="panel-arch aspect-[3/4] flex items-end justify-center pb-5 text-caption text-text-whisper">
                {p.label.toLowerCase()}
              </div>
              <figcaption className="mt-4 text-caption text-text-secondary">
                <span className="text-text-primary font-medium">{p.label}.</span>{' '}
                <span className="text-text-tertiary">{p.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Why it pays — three benefits, each tied to a real ROI lever. */}
      <section id="how" className="px-6 sm:px-10 py-24 border-t border-border">
        <p className="text-caption text-text-tertiary mb-3">Why it pays</p>
        <h2 className="text-[2rem] sm:text-[3rem] font-extrabold text-text-primary max-w-3xl leading-[1.02] tracking-[-0.04em]">
          The clearest return on the time and money you&rsquo;re already spending on your health.
        </h2>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-10 max-w-6xl">
          {[
            {
              n: '01',
              title: 'No more supplement guesswork',
              body: 'Every recommendation is justified by your bloods and wearable trends — never generic. Spend less, on the things that actually move your numbers.',
            },
            {
              n: '02',
              title: 'Every device and lab in one view',
              body: 'Whoop, Oura, Apple Health, MyFitnessPal, your last blood panel — connected and translated into one daily protocol you can read in sixty seconds.',
            },
            {
              n: '03',
              title: 'A medical safety net, built in',
              body: 'When your numbers cross thresholds that need a real clinician, Morning Form flags it clearly with a referral. Never buried, never hyped, never sold around.',
            },
          ].map((b) => (
            <div key={b.n}>
              <span className="font-mono text-caption text-text-tertiary">{b.n}</span>
              <h3 className="mt-3 text-heading font-medium text-text-primary tracking-[-0.015em]">
                {b.title}
              </h3>
              <p className="mt-3 text-body text-text-secondary leading-[1.6]">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — three steps, mono numerals for rhythm. */}
      <section className="px-6 sm:px-10 py-24 border-t border-border">
        <p className="text-caption text-text-tertiary mb-10">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 max-w-5xl">
          {[
            {
              n: 'Step 01',
              title: 'Connect',
              body: 'Link your wearables and tracking apps. Upload bloods or order a panel through us.',
            },
            {
              n: 'Step 02',
              title: 'Receive',
              body: 'Your starter protocol arrives in minutes — lifestyle changes and supplements ranked by impact on your data.',
            },
            {
              n: 'Step 03',
              title: 'Adapt',
              body: 'Daily check-ins refine the protocol. Quarterly bloods recalibrate it. The system learns; you improve.',
            },
          ].map((step) => (
            <div key={step.n}>
              <span className="font-mono text-caption text-text-tertiary uppercase tracking-[0.12em]">
                {step.n}
              </span>
              <h3 className="mt-3 text-heading font-medium text-text-primary tracking-[-0.015em]">
                {step.title}
              </h3>
              <p className="mt-2 text-body text-text-secondary leading-[1.6]">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof — placeholder testimonials in the early-adopter voice. */}
      <section id="proof" className="px-6 sm:px-10 py-24 border-t border-border">
        <p className="text-caption text-text-tertiary mb-3">Members</p>
        <h2 className="text-[1.75rem] sm:text-[2.25rem] font-extrabold text-text-primary max-w-2xl leading-[1.05] tracking-[-0.035em]">
          From people who were already tracking everything.
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl">
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
              className="rounded-card border border-border bg-surface p-6 sm:p-7 flex flex-col gap-5"
            >
              <blockquote className="text-body text-text-primary leading-[1.55]">
                &ldquo;<span dangerouslySetInnerHTML={{ __html: t.quote }} />&rdquo;
              </blockquote>
              <figcaption className="mt-auto">
                <p className="text-caption font-medium text-text-primary">{t.name}</p>
                <p className="text-caption text-text-tertiary">{t.meta}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-10 text-caption text-text-tertiary max-w-md">
          Quotes shown are placeholders pending consented testimonials from private beta members.
        </p>
      </section>

      {/* Final CTA — restate the value, then the same low-commitment ask. */}
      <section className="px-6 sm:px-10 py-28 border-t border-border">
        <h2 className="text-[2rem] sm:text-[3.25rem] font-extrabold text-text-primary max-w-3xl leading-[1] tracking-[-0.04em]">
          Get the answer your wearable has been hinting at.{' '}
          <span className="text-gradient-warm">In eight minutes, free.</span>
        </h2>
        <p className="mt-6 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          Take the assessment, link one wearable, see your starter protocol. No card, no signup
          until you decide to keep going.
        </p>
        <div className="mt-12 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Get your starter protocol →</Button>
          </Link>
          <Link
            href="/sign-in"
            className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300 underline-offset-4 hover:underline"
          >
            Already a member? Sign in →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 sm:px-10 py-14 border-t border-border">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
          <Wordmark variant="lockup" size="lg" />
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap gap-6 text-caption text-text-tertiary">
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Privacy</span>
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Safety &amp; clinical</span>
              <span className="hover:text-text-secondary cursor-pointer transition-colors">Contact</span>
            </div>
            <p className="text-caption text-text-tertiary">© 2026 Morning Form</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
