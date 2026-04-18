import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header — wordmark + version stamp + sign-in. The stamp anchors the
          engineered/instrument feel from the first pixel. */}
      <header className="px-5 sm:px-8 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display-narrow font-bold text-text-primary text-lg uppercase">Morning Form</span>
          <span className="tech-stamp">v3.0 / Q2·26</span>
        </div>
        <Link
          href="/sign-in"
          className="text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </header>

      {/* Hero — Pentagon-style: compressed display headline, mono technical
          eyebrow, supporting metadata, corner-marked imagery rail. */}
      <section className="grain px-5 sm:px-8 pt-20 sm:pt-28 pb-24 stagger">
        <div className="mb-8 flex items-center gap-4 flex-wrap">
          <span className="tech-label">▲ MF / 01 — System</span>
          <span aria-hidden className="hidden sm:block h-px w-12 bg-border-strong" />
          <span className="tech-stamp">REV 2026.04</span>
        </div>
        <h1 className="font-display-narrow font-bold text-display sm:text-display-2xl text-text-primary max-w-3xl uppercase leading-[0.92]">
          A system for
          <br />
          <span className="voice-italic normal-case">understanding</span>
          <br />
          your state.
        </h1>
        <p className="mt-10 text-body-lg text-text-secondary max-w-lg leading-relaxed">
          Morning Form assesses your patterns, builds a personalised protocol, and adapts with
          you over time.
        </p>
        <div className="mt-12 flex items-center gap-5 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment →</Button>
          </Link>
          <Link
            href="/sign-in"
            className="text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring underline-offset-4 hover:underline"
          >
            Already signed up? Sign in →
          </Link>
          <span className="tech-stamp">08:00 · FREE · NO COMMIT</span>
        </div>

        {/* Imagery rail — panel-arch frames with corner-mark precision and
            mono index stamps below. Drop <Image /> children in later. */}
        <div className="mt-20 max-w-3xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">Fig. 01 — Daily Loop</span>
            <span className="tech-stamp">3 / 3</span>
          </div>
          <div className="grid grid-cols-3 gap-5 sm:gap-7">
            {[
              { i: '001', label: 'Morning' },
              { i: '002', label: 'Protocol' },
              { i: '003', label: 'Evening' },
            ].map((p, idx) => (
              <div key={p.i} className={idx === 1 ? '-translate-y-3' : ''}>
                <div className="mark-corner panel-arch aspect-[3/4] flex items-end justify-center pb-4 text-caption text-text-whisper">
                  {p.label.toLowerCase()}
                  <span className="mark-corner-bl" />
                  <span className="mark-corner-br" />
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-text-tertiary uppercase">{p.i}</span>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-text-tertiary uppercase">{p.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="px-5 sm:px-8 py-24 border-t border-border">
        <div className="mb-6 flex items-center gap-4">
          <span className="tech-label">▲ MF / 02 — Problem</span>
          <span aria-hidden className="hidden sm:block h-px flex-1 max-w-[120px] bg-border-strong" />
        </div>
        <p className="font-display-narrow font-medium text-display-sm sm:text-display text-text-primary max-w-2xl uppercase leading-[1.05]">
          You&rsquo;ve tried supplements, tracked your sleep, read the research.{' '}
          <span className="text-text-tertiary">But nothing connects into a system.</span>
        </p>
        <p className="mt-8 text-body-lg text-text-secondary max-w-lg">
          Fragmented advice produces fragmented results. You need a protocol that understands
          your patterns — not another product that ignores them.
        </p>
      </section>

      {/* How it works */}
      <section className="px-5 sm:px-8 py-24 border-t border-border">
        <div className="mb-10 flex items-center gap-4">
          <span className="tech-label">▲ MF / 03 — Method</span>
          <span aria-hidden className="hidden sm:block h-px flex-1 max-w-[120px] bg-border-strong" />
        </div>
        <div className="space-y-12 max-w-xl">
          {[
            {
              n: '001',
              title: 'Assess',
              body: '8-minute intake maps your state patterns, sensitivities, and constraints.',
            },
            {
              n: '002',
              title: 'Protocol',
              body: 'Personalised to your biology. Every recommendation explained with mechanism and evidence.',
            },
            {
              n: '003',
              title: 'Adapt',
              body: 'Daily feedback refines your protocol over time. The system learns, you improve.',
            },
          ].map((step) => (
            <div key={step.n} className="grid grid-cols-[auto_1fr] gap-6 items-baseline">
              <span className="font-mono text-[11px] tracking-[0.18em] text-text-tertiary uppercase pt-1">{step.n}</span>
              <div>
                <h3 className="font-display-narrow font-bold text-heading text-text-primary uppercase">
                  {step.title}
                </h3>
                <p className="mt-2 text-body-lg text-text-secondary leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Statement */}
      <section className="px-5 sm:px-8 py-28 border-t border-border">
        <div className="mb-8 flex items-center gap-4">
          <span className="tech-label">▲ MF / 04 — Position</span>
        </div>
        <h2 className="font-display-narrow font-bold text-display-sm sm:text-display text-text-primary uppercase leading-[1.0]">
          Not a supplement brand.
          <br />
          <span className="voice-italic normal-case font-light">A state system.</span>
        </h2>
        <p className="mt-8 text-body-lg text-text-secondary max-w-lg">
          We don&rsquo;t sell products through quizzes. We build protocols through data.
        </p>
        <div className="mt-12 flex items-center gap-4 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment →</Button>
          </Link>
          <span className="tech-stamp">EST 2026 / V3.0</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 sm:px-8 py-10 border-t border-border">
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
