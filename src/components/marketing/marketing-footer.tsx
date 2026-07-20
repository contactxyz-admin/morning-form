import Link from 'next/link';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { NAV_LINK_CLASS, MONO_EYEBROW } from './marketing-header';
import type { Market } from '@/lib/marketing/constants';

interface MarketingFooterProps {
  market: Market;
  /** Extra caption line above the copyright row — e.g. the programmatic
   *  page-template's "Last reviewed {date}" line. Omit elsewhere. */
  extraLine?: string;
  /** Render the named link as static text instead of a Link — for when a
   *  page is rendering its own footer and would otherwise link to itself. */
  currentPage?: 'partners';
}

/**
 * Shared footer for every marketing page (market home, testing, partners,
 * programmatic-SEO pages). Mirrors MarketingHeader: one component so the
 * link set and copy can't drift out of sync between pages the way a
 * hand-duplicated footer would.
 */
export function MarketingFooter({ market, extraLine, currentPage }: MarketingFooterProps) {
  return (
    <footer className="px-6 sm:px-10 lg:px-16 py-16 border-t border-border max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-10">
        <Link href={`/${market}`} aria-label="Morning Form — home" className="text-text-primary">
          <LogoLockup imageClassName="w-[188px]" textClassName="text-heading" />
        </Link>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap gap-7">
            {currentPage === 'partners' ? (
              <span className={NAV_LINK_CLASS}>Partner with us</span>
            ) : (
              <Link href={`/${market}/partners`} className={NAV_LINK_CLASS}>Partner with us</Link>
            )}
            <Link href="/privacy" className={NAV_LINK_CLASS}>Privacy</Link>
            <Link href="/safety" className={NAV_LINK_CLASS}>Safety &amp; clinical</Link>
            <Link href="/contact" className={NAV_LINK_CLASS}>Contact</Link>
          </div>
          {extraLine ? <p className={MONO_EYEBROW}>{extraLine}</p> : null}
          <p className={MONO_EYEBROW}>© 2026 Morning Form</p>
        </div>
      </div>
    </footer>
  );
}
