import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoTab } from '@/components/demo/demo-tab';
import { TrackMount } from '@/lib/funnel/track-mount';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

/**
 * Public `/demo` layout — no auth, no session, no app chrome.
 *
 * Renders a quiet top nav across the three demo sub-routes (overview,
 * record, ask) and a "synthetic data" disclosure footer. Marked
 * noindex/nofollow at the metadata layer; `src/middleware.ts` also sets
 * the matching `X-Robots-Tag` headers.
 */

export const metadata: Metadata = {
  title: 'Morning Form — synthetic demo',
  description:
    'A walkthrough of Morning Form on a synthetic 38-year-old metabolic-syndrome persona. Synthetic data, no real patient.',
  robots: { index: false, follow: false, nocache: true },
};

const TABS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Overview', href: '/demo' },
  { label: 'Record', href: '/demo/record' },
  { label: 'Ask', href: '/demo/ask' },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary grain-page flex flex-col">
      {/* Layouts persist across the demo tabs, so this fires once per
          entry into /demo — the arrival counterpart to the landing
          page's DEMO_CLICKED CTAs. The event path records the entry tab. */}
      <TrackMount event={FUNNEL_EVENTS.DEMO_VIEWED} />
      <header className="px-5 sm:px-8 pt-8 pb-5 border-b border-border/60">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/demo"
            className="font-display font-light text-subheading -tracking-[0.02em] text-text-primary"
          >
            Morning Form
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            Synthetic demo
          </span>
        </div>
        <nav
          aria-label="Demo sections"
          className="max-w-3xl mx-auto mt-5 flex items-center gap-6"
        >
          {TABS.map((t) => (
            <DemoTab key={t.href} {...t} />
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8">{children}</main>

      <footer className="border-t border-border/60 px-5 sm:px-8 py-6 mt-16">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-2">
            Synthetic data — no real patient
          </p>
          <p className="text-caption text-text-tertiary leading-relaxed">
            This demo runs against a deterministically generated 24-month dataset for a
            38-year-old with mild metabolic syndrome. Inflection point: month 14
            (lifestyle intervention). Reference ranges drawn from UpToDate, ADA, NICE.
            Nothing here represents an identifiable person.
          </p>
        </div>
      </footer>
    </div>
  );
}
