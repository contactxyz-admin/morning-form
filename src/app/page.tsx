import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="px-5 pt-6">
        <span className="font-mono text-label tracking-[0.2em] text-text-primary uppercase">
          Morning Form
        </span>
      </header>

      {/* Hero */}
      <section className="px-5 pt-24 pb-20">
        <h1 className="font-serif text-[2.25rem] leading-[1.12] tracking-tight text-text-primary max-w-md">
          A system for understanding your state.
        </h1>
        <p className="mt-6 text-body text-text-secondary max-w-sm leading-relaxed">
          Morning Form assesses your patterns, builds a personalized protocol,
          and adapts with you over time.
        </p>
        <div className="mt-10">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center h-12 px-6 bg-accent text-white text-body font-medium rounded-button transition-all duration-250 hover:bg-accent-muted active:scale-[0.98]"
          >
            Begin Assessment →
          </Link>
        </div>
        <p className="mt-4 text-caption text-text-tertiary">
          8 minutes · free · no commitment
        </p>
      </section>

      {/* The Problem */}
      <section className="px-5 py-20 border-t border-border">
        <span className="text-label uppercase tracking-[0.08em] text-text-tertiary font-medium">
          The Problem
        </span>
        <p className="mt-6 text-heading text-text-primary max-w-md leading-snug">
          You&apos;ve tried supplements, tracked your sleep, read the research.
          But nothing connects into a system.
        </p>
        <p className="mt-4 text-body text-text-secondary max-w-sm">
          Fragmented advice produces fragmented results. You need a protocol
          that understands your patterns — not another product that ignores them.
        </p>
      </section>

      {/* How it works */}
      <section className="px-5 py-20 border-t border-border">
        <span className="text-label uppercase tracking-[0.08em] text-text-tertiary font-medium">
          How It Works
        </span>
        <div className="mt-10 space-y-10">
          <div>
            <span className="font-mono text-data text-text-tertiary">01</span>
            <h3 className="mt-2 text-subheading font-medium text-text-primary">Assess</h3>
            <p className="mt-2 text-body text-text-secondary">
              8-minute intake maps your state patterns, sensitivities, and constraints.
            </p>
          </div>
          <div>
            <span className="font-mono text-data text-text-tertiary">02</span>
            <h3 className="mt-2 text-subheading font-medium text-text-primary">Protocol</h3>
            <p className="mt-2 text-body text-text-secondary">
              Personalized to your biology. Every recommendation explained with mechanism and evidence.
            </p>
          </div>
          <div>
            <span className="font-mono text-data text-text-tertiary">03</span>
            <h3 className="mt-2 text-subheading font-medium text-text-primary">Adapt</h3>
            <p className="mt-2 text-body text-text-secondary">
              Daily feedback refines your protocol over time. The system learns, you improve.
            </p>
          </div>
        </div>
      </section>

      {/* Statement */}
      <section className="px-5 py-24 border-t border-border">
        <h2 className="font-serif text-[1.75rem] leading-tight tracking-tight text-text-primary">
          Not a supplement brand.<br />
          A state system.
        </h2>
        <p className="mt-6 text-body text-text-secondary max-w-sm">
          We don&apos;t sell products through quizzes. We build protocols through data.
        </p>
        <div className="mt-10">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center h-12 px-6 bg-accent text-white text-body font-medium rounded-button transition-all duration-250 hover:bg-accent-muted active:scale-[0.98]"
          >
            Begin Assessment →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 py-8 border-t border-border">
        <div className="flex gap-6 text-caption text-text-tertiary">
          <span className="hover:text-text-secondary cursor-pointer transition-colors">Privacy</span>
          <span className="hover:text-text-secondary cursor-pointer transition-colors">About</span>
          <span className="hover:text-text-secondary cursor-pointer transition-colors">Contact</span>
        </div>
        <p className="mt-4 text-caption text-text-tertiary">
          © 2026 Morning Form
        </p>
      </footer>
    </div>
  );
}
