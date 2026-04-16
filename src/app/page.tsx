import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="px-5 sm:px-8 pt-8 flex items-center justify-between">
        <span className="text-label uppercase text-text-tertiary">Morning Form</span>
        <Link
          href="/sign-in"
          className="text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="px-5 sm:px-8 pt-24 sm:pt-32 pb-24 stagger">
        <p className="text-label uppercase text-text-tertiary mb-4">An operating system for state</p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-2xl -tracking-[0.04em]">
          A system for
          <br />
          <span className="italic font-light">understanding</span> your state.
        </h1>
        <p className="mt-8 text-body-lg text-text-secondary max-w-lg leading-relaxed">
          Morning Form assesses your patterns, builds a personalised protocol, and adapts with
          you over time.
        </p>
        <div className="mt-12 flex items-center gap-5 flex-wrap">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment →</Button>
          </Link>
          <p className="text-caption text-text-tertiary">8 minutes · free · no commitment</p>
        </div>
      </section>

      {/* The Problem */}
      <section className="px-5 sm:px-8 py-24 border-t border-border">
        <p className="text-label uppercase text-text-tertiary mb-5">The problem</p>
        <p className="font-display font-light text-display-sm sm:text-display text-text-primary max-w-2xl -tracking-[0.03em] leading-[1.1]">
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
        <p className="text-label uppercase text-text-tertiary mb-8">How it works</p>
        <div className="space-y-12 max-w-xl">
          {[
            {
              n: '01',
              title: 'Assess',
              body: '8-minute intake maps your state patterns, sensitivities, and constraints.',
            },
            {
              n: '02',
              title: 'Protocol',
              body: 'Personalised to your biology. Every recommendation explained with mechanism and evidence.',
            },
            {
              n: '03',
              title: 'Adapt',
              body: 'Daily feedback refines your protocol over time. The system learns, you improve.',
            },
          ].map((step) => (
            <div key={step.n}>
              <span className="font-mono text-caption text-text-tertiary">{step.n}</span>
              <h3 className="mt-3 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                {step.title}
              </h3>
              <p className="mt-2 text-body-lg text-text-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Statement */}
      <section className="px-5 sm:px-8 py-28 border-t border-border">
        <h2 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.05]">
          Not a supplement brand.
          <br />
          <span className="italic font-light">A state system.</span>
        </h2>
        <p className="mt-8 text-body-lg text-text-secondary max-w-lg">
          We don&rsquo;t sell products through quizzes. We build protocols through data.
        </p>
        <div className="mt-12">
          <Link href="/onboarding">
            <Button size="lg">Begin assessment →</Button>
          </Link>
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
