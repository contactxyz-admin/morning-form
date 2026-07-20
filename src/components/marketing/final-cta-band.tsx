import type { ReactNode } from 'react';
import { RevealOnScroll } from '@/components/ui/reveal-on-scroll';

interface FinalCtaBandProps {
  heading: ReactNode;
  /** Override the heading's max-width when the copy runs longer than one line. Defaults to max-w-xl. */
  headingClassName?: string;
  body: ReactNode;
  /** Button/link row — one primary action plus a distinct secondary, matching the site's CTA convention. */
  children: ReactNode;
  /** Wrap in the homepage's scroll-reveal treatment. Off by default — the testing/partners pages don't use RevealOnScroll elsewhere. */
  reveal?: boolean;
}

/**
 * The signature gradient CTA card that closes every marketing page — one
 * component so the treatment (gradient stops, radial overlay, corner
 * radius) is a single edit instead of synced copies across pages.
 */
export function FinalCtaBand({ heading, headingClassName, body, children, reveal }: FinalCtaBandProps) {
  const card = (
    <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,#F9E8FB_0%,#E3F3FF_45%,#DFE6C1_100%)] px-6 sm:px-16 py-16 sm:py-24 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_0%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_70%)]" />
      <div className="relative">
        <h2
          className={`mx-auto font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02] ${headingClassName ?? 'max-w-xl'}`}
        >
          {heading}
        </h2>
        <p className="mt-6 mx-auto max-w-xl text-body-lg text-text-secondary leading-relaxed">{body}</p>
        <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">{children}</div>
      </div>
    </div>
  );

  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 max-w-[1400px] mx-auto">
      {reveal ? <RevealOnScroll>{card}</RevealOnScroll> : card}
    </section>
  );
}
