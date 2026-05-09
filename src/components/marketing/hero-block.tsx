import { CtaBlock } from './cta-block';
import type { MarketingPage } from '@/lib/marketing/page-schema';

interface HeroBlockProps {
  page: MarketingPage;
  /** e.g. "UK guide" — short eyebrow rendered in mono caps. */
  eyebrow: string;
}

export function HeroBlock({ page, eyebrow }: HeroBlockProps) {
  return (
    <section className="px-6 sm:px-10 lg:px-16 pt-20 sm:pt-32 pb-16 sm:pb-24 max-w-[1400px] mx-auto">
      <p className="mb-10 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        {eyebrow}
      </p>

      <h1 className="font-display font-light text-display sm:text-display-xl lg:text-display-2xl text-text-primary -tracking-[0.04em] leading-[0.98] max-w-5xl">
        {page.h1}
      </h1>

      <p className="mt-10 text-body-lg text-text-secondary max-w-2xl leading-relaxed">
        {page.aboveFold}
      </p>

      <div className="mt-14">
        <CtaBlock
          cta={page.cta}
          market={page.market}
          cohort={page.cohortKey}
          slug={page.slug}
        />
      </div>
    </section>
  );
}
