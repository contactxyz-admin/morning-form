import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogoLockup } from '@/components/brand/logo-lockup';

export const NAV_LINK_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring';

interface MarketingHeaderProps {
  homeHref: string;
  navLinks: ReadonlyArray<{ label: string; href: string }>;
}

/**
 * Shared sticky header for every marketing page (market home, testing,
 * programmatic-SEO pages). One component so the sticky/blur treatment and
 * the "Get started" nav CTA can't drift out of sync between pages the way
 * three independently hand-rolled headers did before this.
 */
export function MarketingHeader({ homeHref, navLinks }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="px-6 sm:px-10 lg:px-16 py-3.5 flex items-center justify-between gap-4 max-w-[1400px] mx-auto">
        <Link href={homeHref} aria-label="Morning Form — home" className="text-text-primary">
          <LogoLockup />
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map((t) => (
            <Link key={t.href} href={t.href} className={NAV_LINK_CLASS}>
              {t.label}
            </Link>
          ))}
          <Link href="/sign-in">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
        <Link href="/sign-in" aria-label="Sign in" className={`${NAV_LINK_CLASS} sm:hidden`}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
