import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header — small, calm, generous spacing. */}
      <header className="px-6 sm:px-10 pt-8 pb-4 flex items-center justify-between">
        <span className="text-base font-medium text-text-primary tracking-[-0.01em]">
          Morning Form
        </span>
        <nav className="flex items-center gap-7 text-caption text-text-secondary">
          <Link href="#" className="hover:text-text-primary transition-colors">Journal</Link>
          <Link href="#" className="hover:text-text-primary transition-colors">About</Link>
          <Link
            href="/sign-in"
            className="hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero — OEM-style: a soft chip rail floating above a generous
          humanist headline whose middle clause carries the brand gradient.
          Inline "Read more" sits in the prose, not as a separate CTA. */}
      <section className="px-6 sm:px-10 pt-16 sm:pt-24 pb-24">
        <div className="mb-10 flex flex-wrap gap-3">
          <span className="chip-soft chip-soft-positive">
            <span className="chip-soft-dot" />
            <span>
              <span className="chip-soft-meta">8 minutes · no commitment</span>
              Free assessment, free protocol
            </span>
          </span>
          <span className="chip-soft chip-soft-pop">
            <span className="chip-soft-dot" />
            <span>
              <span className="chip-soft-meta">Now in private beta</span>
              Adaptive daily protocols
            </span>
          </span>
        </div>

        <h1 className="text-[2.75rem] sm:text-[4.5rem] lg:text-[5.5rem] font-medium text-text-primary leading-[1.02] tracking-[-0.035em] max-w-5xl">
          A system for{' '}
          <span className="text-gradient-warm">understanding the patterns</span>{' '}
          that shape how you feel.{' '}
          <Link
            href="#how"
            className="text-text-whisper hover:text-text-secondary transition-colors duration-300 underline-offset-[0.18em] hover:underline"
          >
            Read more
          </Link>
        </h1>

        <div className="mt-14 flex items-center gap-6 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment</Button>
          </Link>
          <Link
            href="/sign-in"
            className="text-body text-text-secondary hover:text-text-primary transition-colors duration-300 underline-offset-4 hover:underline"
          >
            Already signed up? Sign in →
          </Link>
        </div>
      </section>

      {/* Imagery rail — soft arch frames, no labels, no marks. The arch
          is the brand's window; let the imagery speak. */}
      <section className="px-6 sm:px-10 pb-28">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-7 max-w-6xl">
          {[
            { label: 'Morning' },
            { label: 'Protocol' },
            { label: 'Evening' },
          ].map((p, idx) => (
            <figure key={p.label} className={idx === 1 ? 'sm:-translate-y-6' : ''}>
              <div className="panel-arch aspect-[3/4] flex items-end justify-center pb-5 text-caption text-text-whisper">
                {p.label.toLowerCase()}
              </div>
              <figcaption className="mt-4 text-caption text-text-secondary">
                {p.label}.{' '}
                <span className="text-text-tertiary">
                  {idx === 0 && 'A short check-in to map the day ahead.'}
                  {idx === 1 && 'Personalised, adaptive, explained.'}
                  {idx === 2 && 'Reflection, refinement, sleep prep.'}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* The Problem — quiet eyebrow, generous body. No tech labels. */}
      <section id="how" className="px-6 sm:px-10 py-24 border-t border-border">
        <p className="text-caption text-text-tertiary mb-6">The problem</p>
        <p className="text-[1.75rem] sm:text-[2.5rem] font-medium text-text-primary max-w-3xl leading-[1.15] tracking-[-0.025em]">
          You&rsquo;ve tried supplements, tracked your sleep, read the research.{' '}
          <span className="text-text-tertiary">But nothing connects into a system.</span>
        </p>
        <p className="mt-8 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          Fragmented advice produces fragmented results. You need a protocol that
          understands your patterns — not another product that ignores them.
        </p>
      </section>

      {/* How it works — three quiet steps; numerals in mono for rhythm,
          but no engineered framing. */}
      <section className="px-6 sm:px-10 py-24 border-t border-border">
        <p className="text-caption text-text-tertiary mb-10">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-12 max-w-5xl">
          {[
            {
              n: '01',
              title: 'Assess',
              body: 'An 8-minute intake maps your state, sensitivities, and constraints.',
            },
            {
              n: '02',
              title: 'Protocol',
              body: 'Personalised to your biology. Every recommendation explained with mechanism.',
            },
            {
              n: '03',
              title: 'Adapt',
              body: 'Daily feedback refines your protocol over time. The system learns, you improve.',
            },
          ].map((step) => (
            <div key={step.n}>
              <span className="font-mono text-caption text-text-tertiary">{step.n}</span>
              <h3 className="mt-3 text-heading font-medium text-text-primary tracking-[-0.015em]">
                {step.title}
              </h3>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Statement — the brand voice. Gradient on the closing phrase. */}
      <section className="px-6 sm:px-10 py-28 border-t border-border">
        <h2 className="text-[2rem] sm:text-[3rem] font-medium text-text-primary max-w-3xl leading-[1.08] tracking-[-0.03em]">
          We don&rsquo;t sell products through quizzes.{' '}
          <span className="text-gradient-warm">We build protocols through data.</span>
        </h2>
        <div className="mt-12">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 sm:px-10 py-10 border-t border-border">
        <div className="flex flex-wrap gap-6 text-caption text-text-tertiary">
          <span className="hover:text-text-secondary cursor-pointer transition-colors">Privacy</span>
          <span className="hover:text-text-secondary cursor-pointer transition-colors">About</span>
          <span className="hover:text-text-secondary cursor-pointer transition-colors">Contact</span>
        </div>
        <p className="mt-4 text-caption text-text-tertiary">© 2026 Morning Form</p>
      </footer>
    </div>
  );
}
