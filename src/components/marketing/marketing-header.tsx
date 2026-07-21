import Link from 'next/link';
import { LogoLockup } from '@/components/brand/logo-lockup';

export const NAV_LINK_CLASS =
  'rounded-sm font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring focus-visible:outline-none focus-visible:shadow-ring-focus';

// Shared marketing-page style tokens — not header-specific, but this file
// is already the one place NAV_LINK_CLASS lives, so it's the natural home
// for the other small, repeated marketing-copy classNames too, rather than
// each bespoke page re-declaring its own copy.
export const MONO_EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary';
export const DASH_BULLET =
  "leading-relaxed pl-5 relative before:content-['—'] before:absolute before:left-0 before:text-text-tertiary";
export const PRIMARY_MARKETING_CTA_CLASS =
  'group relative inline-flex min-h-[56px] items-center justify-center rounded-button bg-button px-7 py-4 text-body-lg font-medium tracking-[-0.01em] text-bg shadow-button-primary transition-[transform,background-color,box-shadow] duration-450 ease-spring hover:bg-button-hover hover:shadow-button-primary-hover active:scale-[0.985] active:bg-button-active focus-visible:outline-none focus-visible:shadow-ring-focus';
const PRIMARY_NAV_CTA_CLASS =
  'group relative inline-flex min-h-[36px] items-center justify-center rounded-button bg-button px-3.5 py-2 text-caption font-medium tracking-[-0.01em] text-bg shadow-button-primary transition-[transform,background-color,box-shadow] duration-450 ease-spring hover:bg-button-hover hover:shadow-button-primary-hover active:scale-[0.985] active:bg-button-active focus-visible:outline-none focus-visible:shadow-ring-focus';

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
        <Link
          href={homeHref}
          aria-label="Morning Form — home"
          className="rounded-sm text-text-primary focus-visible:outline-none focus-visible:shadow-ring-focus"
        >
          <LogoLockup />
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map((t) => (
            <Link key={t.href} href={t.href} className={NAV_LINK_CLASS}>
              {t.label}
            </Link>
          ))}
          <Link href="/sign-in" className={PRIMARY_NAV_CTA_CLASS}>
            Get started
          </Link>
        </nav>
        <Link href="/sign-in" aria-label="Sign in" className={`${NAV_LINK_CLASS} sm:hidden`}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
