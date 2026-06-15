import Link from 'next/link';

/**
 * Public info pages — /privacy, /safety, /contact. No auth, no session,
 * no app chrome. Same quiet editorial register as /demo: wordmark
 * header, max-w-3xl column, hairline footer cross-linking the set.
 *
 * Every statement on these pages is grounded in the codebase or the
 * compliance register (docs/compliance/*) — when the underlying
 * behaviour changes, change the page in the same PR.
 */

const FOOTER_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Safety & clinical', href: '/safety' },
  { label: 'Contact', href: '/contact' },
];

const FOOTER_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300';

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col">
      <header className="px-5 sm:px-8 pt-8 pb-5 border-b border-border/60">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="font-display font-light text-subheading -tracking-[0.02em] text-text-primary"
          >
            Morning Form
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8 pt-12 pb-20">
        {children}
      </main>

      <footer className="border-t border-border/60 px-5 sm:px-8 py-8">
        <div className="max-w-3xl mx-auto flex flex-wrap items-baseline gap-x-7 gap-y-3">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={FOOTER_LINK_CLASS}>
              {l.label}
            </Link>
          ))}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper ml-auto">
            © 2026 Morning Form
          </span>
        </div>
      </footer>
    </div>
  );
}
